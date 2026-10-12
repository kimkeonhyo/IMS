import {
  Injectable, NotFoundException, ConflictException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Employee } from './employee.entity';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class EmployeesService {
  constructor(
    @InjectRepository(Employee)
    private readonly repo: Repository<Employee>,
    private readonly auditLogs: AuditLogsService,
    private readonly dataSource: DataSource,
    private readonly emailService: EmailService,
  ) {}

  async findAll(): Promise<Omit<Employee, 'password'>[]> {
    const list = await this.repo.find({ order: { man_no: 'ASC' } });
    return list.map(({ password: _, ...e }) => e);
  }

  /** 드롭다운용 — 모든 로그인 사용자에게 제공 (민감 정보 제외) */
  async findActiveList(): Promise<{ man_no: string; name: string; man_team: string; man_roll: string }[]> {
    const list = await this.repo.find({
      where: { is_active: 1 },
      select: ['man_no', 'name', 'man_team', 'man_roll'],
      order: { name: 'ASC' },
    });
    return list;
  }

  async findOne(man_no: string): Promise<Omit<Employee, 'password'>> {
    const emp = await this.repo.findOne({ where: { man_no } });
    if (!emp) throw new NotFoundException('ERR_RES_001');
    const { password: _, ...result } = emp;
    return result;
  }

  /** 사번 자동 채번: EMP-0001, EMP-0002 ... */
  private async generateManNo(): Promise<string> {
    const rows = await this.dataSource.query(
      `SELECT man_no FROM employees WHERE man_no LIKE $1 ORDER BY man_no DESC LIMIT 1`,
      ['EMP-%'],
    );
    let nextNum = 1;
    if (rows.length > 0) {
      const lastNum = parseInt(rows[0].man_no.split('-').pop() ?? '0', 10);
      if (!isNaN(lastNum)) nextNum = lastNum + 1;
    }
    return `EMP-${String(nextNum).padStart(4, '0')}`;
  }

  async create(dto: CreateEmployeeDto, actor: Employee): Promise<Omit<Employee, 'password'>> {
    // ADMIN은 USER 계정만, 본인 소속팀만 생성 가능
    if (actor.man_roll === 'ADMIN') {
      if (dto.man_roll !== 'USER') {
        throw new ForbiddenException('ERR_AUTH_008: ADMIN은 USER 계정만 생성할 수 있습니다');
      }
      if (dto.man_team !== actor.man_team) {
        throw new ForbiddenException('ERR_AUTH_009: 본인 소속팀 계정만 생성할 수 있습니다');
      }
    }

    const idExists = await this.repo.findOne({ where: { man_id: dto.man_id } });
    if (idExists) throw new ConflictException('ERR_RES_002: 이미 존재하는 로그인 ID입니다');

    // 수동 사번 입력 시 중복 체크
    if (dto.man_no) {
      const noExists = await this.repo.findOne({ where: { man_no: dto.man_no } });
      if (noExists) throw new ConflictException('ERR_RES_003: 이미 존재하는 사번입니다');
    }

    const hashed = await bcrypt.hash(dto.password, 12);
    const man_no = dto.man_no ?? await this.generateManNo();

    return this.dataSource.transaction(async (manager) => {
      const emp = manager.create(Employee, { ...dto, man_no, password: hashed });
      const saved = await manager.save(emp);

      // 미가입자 재고사용 기록 자동 연동 (use_name이 동일한 이름인 경우)
      const linked = await manager.query(
        `UPDATE stock_usages
         SET use_man_no = $1, use_name = NULL
         WHERE use_man_no IS NULL
           AND use_name = $2
           AND is_cancelled = 0`,
        [man_no, dto.name],
      );
      if (linked.rowCount > 0) {
        await this.auditLogs.log(manager, {
          man_no: actor.man_no,
          action: 'UPDATE',
          table_name: 'stock_usages',
          field: 'use_man_no',
          new_value: `미가입자 ${dto.name} → ${man_no} 연동 (${linked.rowCount}건)`,
        });
      }

      await this.auditLogs.log(manager, {
        man_no: actor.man_no,
        action: 'CREATE',
        table_name: 'employees',
        new_value: saved.man_no,
      });

      const { password: _, ...result } = saved;
      return result;
    });
  }

  /** CSV / Excel 파일로 직원 일괄 등록 */
  async importFromFile(
    buffer: Buffer,
    mimetype: string,
    actor: Employee,
  ): Promise<{ created: number; skipped: number; errors: string[] }> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const XLSX = require('xlsx');
    let rows: Record<string, string>[];

    if (mimetype === 'text/csv' || mimetype === 'application/csv') {
      const wb = XLSX.read(buffer, { type: 'buffer', raw: false });
      const ws = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    } else {
      const wb = XLSX.read(buffer, { type: 'buffer' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    }

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const [i, row] of rows.entries()) {
      const rowNum = i + 2;
      try {
        const man_id   = String(row['man_id'] ?? row['아이디'] ?? '').trim();
        const name     = String(row['name'] ?? row['이름'] ?? '').trim();
        const password = String(row['password'] ?? row['비밀번호'] ?? '').trim();
        const man_roll = String(row['man_roll'] ?? row['역할'] ?? 'USER').trim().toUpperCase();
        const man_team = String(row['man_team'] ?? row['팀'] ?? '').trim();
        const email    = String(row['email'] ?? row['이메일'] ?? '').trim() || undefined;
        const phone    = String(row['phone'] ?? row['연락처'] ?? '').trim() || undefined;
        const man_no   = String(row['man_no'] ?? row['사번'] ?? '').trim() || undefined;

        if (!man_id || !name || !password || !man_team) {
          errors.push(`행 ${rowNum}: man_id, name, password, man_team은 필수입니다`);
          skipped++;
          continue;
        }

        const idExists = await this.repo.findOne({ where: { man_id } });
        if (idExists) { skipped++; continue; }

        if (man_no) {
          const noExists = await this.repo.findOne({ where: { man_no } });
          if (noExists) {
            errors.push(`행 ${rowNum}: 사번 ${man_no} 이미 존재 — 건너뜀`);
            skipped++;
            continue;
          }
        }

        const hashed = await bcrypt.hash(password, 12);
        const finalNo = man_no ?? await this.generateManNo();

        await this.dataSource.transaction(async (manager) => {
          const emp = manager.create(Employee, {
            man_no: finalNo, man_id, name, password: hashed,
            man_roll: ['MASTER', 'ADMIN', 'USER'].includes(man_roll) ? man_roll : 'USER',
            man_team, email, phone, is_active: 1, permissions: [],
          });
          await manager.save(emp);
          await this.auditLogs.log(manager, {
            man_no: actor.man_no, action: 'CREATE',
            table_name: 'employees', new_value: finalNo,
          });
        });
        created++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`행 ${rowNum}: ${msg}`);
        skipped++;
      }
    }

    return { created, skipped, errors };
  }

  async update(man_no: string, dto: UpdateEmployeeDto, actor: Employee): Promise<Omit<Employee, 'password'>> {
    const emp = await this.repo.findOne({ where: { man_no } });
    if (!emp) throw new NotFoundException('ERR_RES_001');

    // ADMIN은 MASTER 계정 수정 불가
    if (actor.man_roll === 'ADMIN' && emp.man_roll === 'MASTER') {
      throw new ForbiddenException('ERR_AUTH_006: MASTER 계정은 수정할 수 없습니다');
    }
    // 역할 변경은 MASTER만 가능
    if (dto.man_roll !== undefined && actor.man_roll !== 'MASTER') {
      throw new ForbiddenException('ERR_AUTH_007: 역할 변경은 MASTER만 가능합니다');
    }

    // 비밀번호 변경 시 해싱
    if (dto.password) {
      dto.password = await bcrypt.hash(dto.password, 12);
    }

    const result = await this.dataSource.transaction(async (manager) => {
      const before = { man_roll: emp.man_roll, man_team: emp.man_team, is_active: emp.is_active };
      Object.assign(emp, dto);
      const saved = await manager.save(emp);

      // 이름 기준으로 미가입자 재고사용 기록 연동 (이름이 동일한 경우)
      const targetName = dto.name ?? emp.name;
      const linked = await manager.query(
        `UPDATE stock_usages
         SET use_man_no = $1, use_name = NULL
         WHERE use_man_no IS NULL
           AND use_name = $2
           AND is_cancelled = 0`,
        [man_no, targetName],
      );
      if (linked.rowCount > 0) {
        await this.auditLogs.log(manager, {
          man_no: actor.man_no,
          action: 'UPDATE',
          table_name: 'stock_usages',
          field: 'use_man_no',
          new_value: `미가입자 ${targetName} → ${man_no} 연동 (${linked.rowCount}건)`,
        });
      }

      await this.auditLogs.log(manager, {
        man_no: actor.man_no,
        action: 'UPDATE',
        table_name: 'employees',
        field: Object.keys(dto).join(','),
        old_value: JSON.stringify(before),
        new_value: JSON.stringify(dto),
      });

      const { password: _, ...res } = saved;
      return res;
    });
    // 해당 직원 본인에게 설정 변경 알림
    if (emp.email) {
      const appUrl = process.env.APP_URL ?? 'https://ims.example.com';
      const changedFields = Object.keys(dto).filter(k => k !== 'password').join(', ');
      if (changedFields) {
        void this.emailService.sendEmployeeSettingsChanged(emp.email, emp.name, `정보 변경 (${changedFields})`, appUrl);
      }
    }
    return result;
  }

  async toggleActive(man_no: string, actor: Employee): Promise<Omit<Employee, 'password'>> {
    const emp = await this.repo.findOne({ where: { man_no } });
    if (!emp) throw new NotFoundException('ERR_RES_001');

    return this.dataSource.transaction(async (manager) => {
      emp.is_active = emp.is_active === 1 ? 0 : 1;
      const saved = await manager.save(emp);
      await this.auditLogs.log(manager, {
        man_no: actor.man_no, action: 'UPDATE',
        table_name: 'employees', field: 'is_active',
        new_value: String(emp.is_active),
      });
      const { password: _, ...result } = saved;
      return result;
    });
  }
}
