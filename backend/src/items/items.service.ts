import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Item, ItemCategory, CATEGORY_PREFIX } from './item.entity';
import { CreateItemDto } from './dto/create-item.dto';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { Employee } from '../employees/employee.entity';
import { EmailService } from '../email/email.service';

@Injectable()
export class ItemsService {
  constructor(
    @InjectRepository(Item) private readonly repo: Repository<Item>,
    @InjectRepository(Employee) private readonly empRepo: Repository<Employee>,
    private readonly auditLogs: AuditLogsService,
    private readonly dataSource: DataSource,
    private readonly emailService: EmailService,
  ) {}

  /** 경영지원팀에게 품목 변경 알림 */
  private async notifyMgmtTeamItem(itemName: string, itemCode: string, changeType: string) {
    try {
      const appUrl = process.env.APP_URL ?? 'https://ims.example.com';
      const mgmtTeam = await this.empRepo.find({ where: { man_team: '경영지원팀', is_active: 1 } });
      for (const e of mgmtTeam) {
        if (e.email) void this.emailService.sendItemChanged(e.email, e.name, itemName, changeType, appUrl, itemCode);
      }
    } catch (_) { /* fire-and-forget */ }
  }

  /** 품목 목록
   *  - MASTER / ADMIN : 전체 (관리 목적, PRIVATE 포함)
   *  - USER           : PUBLIC 품목만 (드롭다운·선택 용도)
   */
  findAll(user: Employee) {
    const qb = this.repo.createQueryBuilder('item')
      .orderBy('item.item_code', 'ASC');
    if (user.man_roll === 'USER') {
      qb.where(`(item.visibility = 'PUBLIC' OR item.visibility IS NULL)`);
    }
    return qb.getMany();
  }

  async findOne(item_code: string) {
    const item = await this.repo.findOne({ where: { item_code } });
    if (!item) throw new NotFoundException('ERR_INV_003');
    return item;
  }

  // 카테고리별 순번 자동 채번: HW-0001, SW-0002 ...
  private async generateItemCode(category: ItemCategory, manager: EntityManager): Promise<string> {
    const prefix = CATEGORY_PREFIX[category];

    const rows = await manager.query(
      `SELECT item_code FROM items WHERE item_code LIKE $1 ORDER BY item_code DESC LIMIT 1`,
      [`${prefix}-%`],
    );

    let nextNum = 1;
    if (rows.length > 0) {
      const lastCode: string = rows[0].item_code;
      const lastNum = parseInt(lastCode.split('-').pop() ?? '0', 10);
      if (!isNaN(lastNum)) nextNum = lastNum + 1;
    }

    return `${prefix}-${String(nextNum).padStart(4, '0')}`;
  }

  async create(dto: CreateItemDto, actor: Employee) {
    const saved = await this.dataSource.transaction(async (manager) => {
      const item_code = await this.generateItemCode(dto.category, manager);
      const item = manager.create(Item, { ...dto, item_code });
      const s = await manager.save(item);
      await this.auditLogs.log(manager, {
        man_no: actor.man_no, action: 'CREATE',
        table_name: 'items', new_value: s.item_code,
      });
      return s;
    });
    void this.notifyMgmtTeamItem(saved.item_name, saved.item_code, '등록');
    return saved;
  }

  async update(item_code: string, dto: Partial<CreateItemDto>, actor: Employee) {
    const item = await this.findOne(item_code);
    const saved = await this.dataSource.transaction(async (manager) => {
      // category, item_code 변경 불가 — 해당 필드 제거 후 적용
      const { category: _cat, ...safeDto } = dto as CreateItemDto;
      Object.assign(item, safeDto);
      const s = await manager.save(item);
      await this.auditLogs.log(manager, {
        man_no: actor.man_no, action: 'UPDATE',
        table_name: 'items', new_value: item_code,
      });
      return s;
    });
    void this.notifyMgmtTeamItem(saved.item_name, saved.item_code, '수정');
    return saved;
  }

  async toggleActive(item_code: string, actor: Employee) {
    const item = await this.findOne(item_code);
    const saved = await this.dataSource.transaction(async (manager) => {
      item.is_active = item.is_active === 1 ? 0 : 1;
      const s = await manager.save(item);
      await this.auditLogs.log(manager, {
        man_no: actor.man_no,
        action: 'UPDATE',
        table_name: 'items',
        new_value: `${item_code}:is_active=${item.is_active}`,
      });
      return s;
    });
    const changeType = saved.is_active === 1 ? '활성화' : '비활성화';
    void this.notifyMgmtTeamItem(saved.item_name, saved.item_code, changeType);
    return saved;
  }

  /** CSV / Excel 파일로 품목 일괄 등록 */
  async importFromFile(
    buffer: Buffer,
    _mimetype: string,
    actor: Employee,
  ): Promise<{ created: number; skipped: number; errors: string[] }> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const XLSX = require('xlsx');
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const [i, row] of rows.entries()) {
      const rowNum = i + 2;
      try {
        const item_name  = String(row['item_name'] ?? row['품목명'] ?? '').trim();
        const categoryRaw = String(row['category'] ?? row['품종'] ?? '').trim().toUpperCase();
        const unit       = String(row['unit'] ?? row['단위'] ?? 'EA').trim() || 'EA';
        const unit_price = parseFloat(String(row['unit_price'] ?? row['단가'] ?? '0')) || 0;
        const description = String(row['description'] ?? row['설명'] ?? '').trim() || undefined;
        const use_serial = ['1', 'Y', 'TRUE', 'YES'].includes(String(row['use_serial'] ?? '').toUpperCase()) ? 1 : 0;

        const category = ['HW', 'SW', 'NORMAL', 'CON', 'EQUIP'].includes(categoryRaw)
          ? (categoryRaw as ItemCategory) : null;

        if (!item_name || !category) {
          errors.push(`행 ${rowNum}: item_name(품목명)과 category(품종: HW/SW/NORMAL/CON/EQUIP)는 필수입니다`);
          skipped++;
          continue;
        }

        await this.create({ category, item_name, unit, unit_price, description, use_serial }, actor);
        created++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`행 ${rowNum}: ${msg}`);
        skipped++;
      }
    }

    return { created, skipped, errors };
  }
}
