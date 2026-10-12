import {
  Injectable, NotFoundException, ConflictException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, IsArray, IsDateString, IsInt } from 'class-validator';
import { StockUsage } from './stock-usage.entity';
import { SerialNumber, SerialStatus } from '../serial-numbers/serial-number.entity';
import { InventoryService } from '../inventory/inventory.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { Employee } from '../employees/employee.entity';
import { generateDocNo } from '../common/utils/doc-no.util';
import { EmailService } from '../email/email.service';

export class CreateStockUsageDto {
  @IsString() @IsNotEmpty() item_code: string;
  @IsString() @IsNotEmpty() storage_code: string;
  @IsNumber() @Min(1) quantity: number;
  @IsOptional() @IsString() purpose?: string;
  /** 사용처 — 창고 코드 또는 'EXTERNAL' */
  @IsOptional() @IsString() use_place_code?: string;
  /** 사용처가 외부일 때 직접 입력한 장소명 */
  @IsOptional() @IsString() use_place_name?: string;
  /** 사용기한 (YYYY-MM-DD). 무기한이면 미입력 + is_indefinite=1 */
  @IsOptional() @IsDateString() use_until?: string;
  /** 무기한 사용 (1이면 use_until 불필요) */
  @IsOptional() @IsInt() is_indefinite?: number;
  /** 등록된 직원 사번 (미입력 시 요청자 본인) */
  @IsOptional() @IsString() use_man_no?: string;
  /** 미가입자 이름 (use_man_no 없을 때 사용) */
  @IsOptional() @IsString() use_name?: string;
  /** S/N 관리 품목: 사용할 serial_number id 배열 */
  @IsOptional() @IsArray() serial_number_ids?: number[];
}

export class CreateBulkStockUsageDto {
  /** 등록된 직원 사번 (공통 적용, 미입력 시 요청자 본인) */
  @IsOptional() @IsString() use_man_no?: string;
  /** 미가입자 이름 (use_man_no 없을 때 사용) */
  @IsOptional() @IsString() use_name?: string;
  @IsOptional() @IsString() purpose?: string;
  /** 사용처 (공통 적용) */
  @IsOptional() @IsString() use_place_code?: string;
  @IsOptional() @IsString() use_place_name?: string;
  /** 사용기한 (공통 적용) */
  @IsOptional() @IsDateString() use_until?: string;
  @IsOptional() @IsInt() is_indefinite?: number;
  @IsArray() items: Array<{
    item_code: string;
    storage_code: string;
    quantity: number;
    serial_number_ids?: number[];
  }>;
}

export class UpdateStockUsageDto {
  @IsOptional() @IsNumber() @Min(1) quantity?: number;
  @IsOptional() @IsString() purpose?: string;
  /** 사용처 수정 */
  @IsOptional() @IsString() use_place_code?: string;
  @IsOptional() @IsString() use_place_name?: string;
  /** 사용기한 수정 — 무기한 전환 시 is_indefinite=1 */
  @IsOptional() @IsDateString() use_until?: string;
  @IsOptional() @IsInt() is_indefinite?: number;
}

export class CancelStockUsageDto {
  @IsOptional() @IsString() cancel_reason?: string;
}

@Injectable()
export class StockUsagesService {
  constructor(
    @InjectRepository(StockUsage) private readonly repo: Repository<StockUsage>,
    @InjectRepository(Employee) private readonly empRepo: Repository<Employee>,
    private readonly inventoryService: InventoryService,
    private readonly auditLogs: AuditLogsService,
    private readonly dataSource: DataSource,
    private readonly emailService: EmailService,
  ) {}

  /**
   * 재고사용 이메일 알림 발송
   * @param usage  저장된 StockUsage (item relation 필요)
   * @param status 상태 문자열
   * @param scope  'all' = 사용자+팀원+경영지원팀 / 'self_mgmt' = 사용자+경영지원팀
   */
  private async notifyStockUsage(
    usage: StockUsage & { item?: { item_name?: string } },
    status: string,
    scope: 'all' | 'self_mgmt',
  ) {
    try {
      const appUrl = process.env.APP_URL ?? 'https://ims.example.com';
      const itemName = usage.item?.item_name ?? usage.item_code;
      const allEmp = await this.empRepo.find({ where: { is_active: 1 } });
      const userEmp = usage.use_man_no ? allEmp.find(e => e.man_no === usage.use_man_no) : undefined;
      const notifiedSet = new Set<string>();
      const notify = (e: Employee) => {
        if (!e.email || notifiedSet.has(e.man_no)) return;
        notifiedSet.add(e.man_no);
        void this.emailService.sendStockUsageStatusChanged(
          e.email, e.name, itemName, usage.quantity, usage.usage_no, status, appUrl,
        );
      };
      // 사용자 본인
      if (userEmp) notify(userEmp);
      for (const e of allEmp) {
        const isTeammate = scope === 'all' && userEmp && e.man_team === userEmp.man_team;
        const isMgmt = e.man_team === '경영지원팀';
        if (isTeammate || isMgmt) notify(e);
      }
    } catch (_) { /* fire-and-forget */ }
  }

  async findAll(user: Employee) {
    const qb = this.repo.createQueryBuilder('su')
      .leftJoinAndSelect('su.item', 'item')
      .leftJoinAndSelect('su.storage', 'storage')
      .leftJoinAndSelect('su.user', 'user')
      .where('item.is_active = 1')  // 비활성 품목 제외
      .orderBy('su.created_at', 'DESC');

    // PRIVATE 품목: MASTER가 아니면 본인 사용 건만 표시
    if (user.man_roll !== 'MASTER') {
      qb.andWhere(
        `(item.visibility = 'PUBLIC' OR item.visibility IS NULL OR su.use_man_no = :userManNo)`,
        { userManNo: user.man_no },
      );
    }

    const usages = await qb.getMany();
    if (!usages.length) return usages;

    // 사용된 S/N 태그를 한 번의 쿼리로 로드 (N+1 방지)
    const usageNos = usages.map(u => u.usage_no);
    const sns: Array<{ usage_no: string; serial_no: string; tags: Record<string, string> | null }> =
      await this.dataSource.query(
        `SELECT usage_no, serial_no, tags FROM serial_numbers WHERE usage_no = ANY($1)`,
        [usageNos],
      );

    const snMap = new Map<string, typeof sns>();
    for (const sn of sns) {
      if (!snMap.has(sn.usage_no)) snMap.set(sn.usage_no, []);
      snMap.get(sn.usage_no)!.push(sn);
    }

    return usages.map(u => Object.assign(u, { serialNumbers: snMap.get(u.usage_no) ?? [] }));
  }

  async findOne(usage_no: string) {
    const u = await this.repo.findOne({
      where: { usage_no },
      relations: ['item', 'storage', 'user', 'canceller'],
    });
    if (!u) throw new NotFoundException('ERR_RES_001');
    return u;
  }

  private checkWritePermission(usage: StockUsage & { user?: Employee }, actor: Employee, action: string) {
    if (actor.man_roll === 'USER' && usage.use_man_no !== actor.man_no) {
      throw new ForbiddenException(`ERR_AUTH_006: 본인 등록 건만 ${action} 가능합니다`);
    }
    if (actor.man_roll === 'ADMIN' && usage.user?.man_team !== actor.man_team) {
      throw new ForbiddenException(`ERR_AUTH_006: 소속팀 등록 건만 ${action} 가능합니다`);
    }
  }

  /** 사용기한 필수 검증 — 무기한이 아니면 날짜가 있어야 한다 */
  private resolveUseUntil(dto: { use_until?: string; is_indefinite?: number }): { use_until: string | null; is_indefinite: number } {
    const indefinite = Number(dto.is_indefinite) === 1;
    if (indefinite) return { use_until: null, is_indefinite: 1 };
    if (!dto.use_until) {
      throw new ConflictException('ERR_VALID_009: 사용기한을 입력하거나 무기한을 선택해주세요.');
    }
    return { use_until: dto.use_until, is_indefinite: 0 };
  }

  /** 재고사용 등록 — PENDING 상태로 등록 (재고 차감 없음) */
  async create(dto: CreateStockUsageDto, user: Employee) {
    const term = this.resolveUseUntil(dto);
    const saved = await this.dataSource.transaction(async (manager) => {
      const usage_no = await generateDocNo(manager, 'stock_usages', 'usage_no', 'USE');
      const usage = manager.create(StockUsage, {
        usage_no, item_code: dto.item_code, storage_code: dto.storage_code,
        quantity: dto.quantity, purpose: dto.purpose,
        use_until: term.use_until, is_indefinite: term.is_indefinite,
        use_place_code: dto.use_place_code ?? null,
        use_place_name: dto.use_place_code === 'EXTERNAL' ? (dto.use_place_name ?? null) : null,
        serial_number_ids: dto.serial_number_ids?.length ? dto.serial_number_ids : null,
        use_man_no: dto.use_man_no || (dto.use_name ? null : user.man_no),
        use_name: dto.use_name ?? null,
        is_cancelled: 0,
        status: 'PENDING',
      });
      const result = await manager.save(usage);

      if (dto.serial_number_ids?.length) {
        await manager.update(
          SerialNumber,
          { id: In(dto.serial_number_ids) },
          { usage_no },
        );
      }

      await this.auditLogs.log(manager, { man_no: user.man_no, action: 'CREATE', table_name: 'stock_usages', new_value: usage_no });
      return result;
    });
    // 등록 알림: 사용자 본인 + 팀원 + 경영지원팀
    const usageWithItem = await this.repo.findOne({ where: { usage_no: saved.usage_no }, relations: ['item'] });
    if (usageWithItem) void this.notifyStockUsage(usageWithItem as any, 'PENDING', 'all');
    return saved;
  }

  /** 재고사용 일괄 등록 — 여러 품목을 하나의 트랜잭션으로 처리 */
  async createBulk(dto: CreateBulkStockUsageDto, user: Employee) {
    const term = this.resolveUseUntil(dto);
    // 트랜잭션 밖에서 시작 번호를 먼저 채번 (동시 요청 경쟁 방지용 FOR UPDATE 락 포함)
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = 'USE';

    const lockResult = await this.dataSource.query(
      `SELECT "${'usage_no'}" FROM "stock_usages" WHERE "usage_no" LIKE $1 ORDER BY "usage_no" DESC LIMIT 1`,
      [`${prefix}-${dateStr}-%`],
    );
    let startSeq = 1;
    if (lockResult.length > 0) {
      startSeq = parseInt(lockResult[0]['usage_no'].split('-').pop() || '0', 10) + 1;
    }

    return this.dataSource.transaction(async (manager) => {
      const saved: StockUsage[] = [];
      for (let i = 0; i < dto.items.length; i++) {
        const item = dto.items[i];
        const usage_no = `${prefix}-${dateStr}-${String(startSeq + i).padStart(4, '0')}`;

        const usage = manager.create(StockUsage, {
          usage_no,
          item_code: item.item_code,
          storage_code: item.storage_code,
          quantity: item.quantity,
          purpose: dto.purpose,
          use_until: term.use_until,
          is_indefinite: term.is_indefinite,
          use_place_code: dto.use_place_code ?? null,
          use_place_name: dto.use_place_code === 'EXTERNAL' ? (dto.use_place_name ?? null) : null,
          serial_number_ids: item.serial_number_ids?.length ? item.serial_number_ids : null,
          use_man_no: dto.use_man_no || (dto.use_name ? null : user.man_no),
          use_name: dto.use_name ?? null,
          is_cancelled: 0,
          status: 'PENDING',
        });
        const s = await manager.save(usage);

        if (item.serial_number_ids?.length) {
          await manager.update(
            SerialNumber,
            { id: In(item.serial_number_ids) },
            { usage_no },
          );
        }

        await this.auditLogs.log(manager, { man_no: user.man_no, action: 'CREATE', table_name: 'stock_usages', new_value: usage_no });
        saved.push(s);
      }
      return saved;
    });
  }

  /** 재고사용 수정 — purpose / quantity / 사용기한 수정 가능 */
  async update(usage_no: string, dto: UpdateStockUsageDto, user: Employee) {
    const usage = await this.repo.findOne({ where: { usage_no }, relations: ['user'] });
    if (!usage) throw new NotFoundException('ERR_RES_001');
    if (usage.is_cancelled) throw new ConflictException('ERR_FLOW_003: 취소된 내역은 수정할 수 없습니다');
    this.checkWritePermission(usage as any, user, '수정');

    return this.dataSource.transaction(async (manager) => {
      if (dto.quantity !== undefined && dto.quantity !== usage.quantity) {
        const diff = dto.quantity - usage.quantity;
        if (diff > 0) {
          await this.inventoryService.decreaseQty(manager, usage.storage_code, usage.item_code, diff);
        } else {
          await this.inventoryService.increaseQty(manager, usage.storage_code, usage.item_code, -diff);
        }
      }
      if (dto.quantity !== undefined) usage.quantity = dto.quantity;
      if (dto.purpose !== undefined) usage.purpose = dto.purpose;
      // 사용처: 외부가 아니면 직접입력 장소명은 비움
      if (dto.use_place_code !== undefined) {
        usage.use_place_code = dto.use_place_code || null;
        usage.use_place_name = dto.use_place_code === 'EXTERNAL'
          ? (dto.use_place_name ?? usage.use_place_name ?? null)
          : null;
      } else if (dto.use_place_name !== undefined && usage.use_place_code === 'EXTERNAL') {
        usage.use_place_name = dto.use_place_name || null;
      }
      // 사용기한: 무기한 전환 시 날짜 비움, 날짜 입력 시 무기한 해제
      if (dto.is_indefinite !== undefined || dto.use_until !== undefined) {
        const term = this.resolveUseUntil({
          use_until: dto.use_until ?? (usage.use_until ?? undefined),
          is_indefinite: dto.is_indefinite ?? usage.is_indefinite,
        });
        usage.use_until = term.use_until;
        usage.is_indefinite = term.is_indefinite;
      }
      const saved = await manager.save(usage);
      await this.auditLogs.log(manager, { man_no: user.man_no, action: 'UPDATE', table_name: 'stock_usages', new_value: usage_no });
      return saved;
    });
  }

  /** 재고사용 취소 */
  async cancel(usage_no: string, dto: CancelStockUsageDto, user: Employee) {
    const usage = await this.repo.findOne({ where: { usage_no }, relations: ['user', 'item'] });
    if (!usage) throw new NotFoundException('ERR_RES_001');
    if (usage.is_cancelled || usage.status === 'CANCELLED') throw new ConflictException('ERR_FLOW_003: 이미 취소된 사용 내역입니다');
    this.checkWritePermission(usage as any, user, '취소');

    const saved = await this.dataSource.transaction(async (manager) => {
      const prevStatus = usage.status;
      // COMPLETED 상태만 재고 복원
      if (usage.status === 'COMPLETED') {
        await this.inventoryService.increaseQty(manager, usage.storage_code, usage.item_code, usage.quantity);
        await manager.update(
          SerialNumber,
          { usage_no, status: SerialStatus.USED },
          { status: SerialStatus.STOCK, storage_code: usage.storage_code, usage_no: null },
        );
      }
      usage.status = 'CANCELLED';
      usage.is_cancelled = 1;
      usage.cancel_man_no = user.man_no;
      usage.cancelled_at = new Date();
      usage.cancel_reason = dto.cancel_reason ?? '';
      const result = await manager.save(usage);
      await this.auditLogs.log(manager, { man_no: user.man_no, action: 'STATUS_CHANGE', table_name: 'stock_usages', field: 'status', old_value: prevStatus, new_value: 'CANCELLED' });
      return result;
    });
    void this.notifyStockUsage(usage as any, 'CANCELLED', 'self_mgmt');
    return saved;
  }

  /** PENDING → COMPLETED: 재고 차감 + S/N USED 처리 */
  async complete(usage_no: string, user: Employee) {
    const usage = await this.repo.findOne({ where: { usage_no }, relations: ['user', 'item'] });
    if (!usage) throw new NotFoundException('ERR_RES_001');
    if (usage.status !== 'PENDING') throw new ConflictException('ERR_FLOW_001: PENDING 상태만 사용완료 처리 가능합니다');
    this.checkWritePermission(usage as any, user, '사용완료');

    const saved = await this.dataSource.transaction(async (manager) => {
      await this.inventoryService.decreaseQty(manager, usage.storage_code, usage.item_code, usage.quantity);

      // S/N 관리 품목이면 USED 처리
      const sn_rows = await manager.find(SerialNumber, { where: { usage_no } });
      if (sn_rows.length) {
        await manager.update(
          SerialNumber,
          { usage_no },
          { status: SerialStatus.USED, storage_code: null },
        );
      }

      usage.status = 'COMPLETED';
      const result = await manager.save(usage);
      await this.auditLogs.log(manager, { man_no: user.man_no, action: 'STATUS_CHANGE', table_name: 'stock_usages', field: 'status', old_value: 'PENDING', new_value: 'COMPLETED' });
      return result;
    });
    void this.notifyStockUsage(usage as any, 'COMPLETED', 'self_mgmt');
    return saved;
  }

  /** PENDING → RETURNED: 반납 처리
   *  - returnStorageCode 미지정: 원래 창고에 재고 유지 (변동 없음)
   *  - returnStorageCode 지정: 원래 창고 차감 → 반납 창고 증가 + S/N storage_code 이동
   *  - serialNumberIds 지정(S/N 품목): 선택한 S/N만 부분 반납 → 수량 차감, 잔여 있으면 PENDING 유지
   */
  async returnStock(usage_no: string, user: Employee, returnStorageCode?: string, serialNumberIds?: number[]) {
    const usage = await this.repo.findOne({ where: { usage_no }, relations: ['user', 'item'] });
    if (!usage) throw new NotFoundException('ERR_RES_001');
    if (usage.status !== 'PENDING') throw new ConflictException('ERR_FLOW_001: PENDING 상태만 반납 처리 가능합니다');
    this.checkWritePermission(usage as any, user, '반납');

    const targetStorage = returnStorageCode || usage.storage_code;
    const storageChanged = !!returnStorageCode && returnStorageCode !== usage.storage_code;

    const saved = await this.dataSource.transaction(async (manager) => {
      const attached = await manager.find(SerialNumber, { where: { usage_no } });
      const isSerial = attached.length > 0;
      const wantPartial =
        isSerial && !!serialNumberIds?.length && serialNumberIds.length < attached.length;

      if (wantPartial) {
        // ── 부분 반납: 선택한 S/N만 반납 ──
        const attachedIds = new Set(attached.map(s => s.id));
        const selectedIds = serialNumberIds!.filter(id => attachedIds.has(id));
        if (selectedIds.length === 0) {
          throw new ConflictException('ERR_FLOW_004: 반납할 S/N을 선택해주세요');
        }
        const cnt = selectedIds.length;

        if (storageChanged) {
          await this.inventoryService.decreaseQty(manager, usage.storage_code, usage.item_code, cnt);
          await this.inventoryService.increaseQty(manager, targetStorage, usage.item_code, cnt);
        }
        // 선택 S/N만 재고 복원 + usage 연결 해제 (남은 사용건은 계속 PENDING)
        await manager.update(
          SerialNumber,
          { id: In(selectedIds) },
          { status: SerialStatus.STOCK, storage_code: targetStorage, usage_no: null },
        );
        usage.quantity = Math.max(0, usage.quantity - cnt);
        const remaining = attached.length - cnt;
        if (remaining <= 0) usage.status = 'RETURNED';
        const result = await manager.save(usage);
        await this.auditLogs.log(manager, {
          man_no: user.man_no, action: 'STATUS_CHANGE', table_name: 'stock_usages',
          field: 'partial_return',
          new_value: `S/N ${cnt}개 부분반납 → ${targetStorage} (잔여 ${Math.max(remaining, 0)})`,
        });
        return result;
      }

      // ── 전체 반납 ──
      if (storageChanged) {
        // 창고 변경 시: 원래 창고 차감 → 반납 창고 증가
        await this.inventoryService.decreaseQty(manager, usage.storage_code, usage.item_code, usage.quantity);
        await this.inventoryService.increaseQty(manager, targetStorage, usage.item_code, usage.quantity);
      }
      // S/N STOCK 복원 + 반납 창고 설정 (usage_no는 이력 보존용으로 유지)
      await manager.update(
        SerialNumber,
        { usage_no },
        { status: SerialStatus.STOCK, storage_code: targetStorage },
      );
      usage.status = 'RETURNED';
      const result = await manager.save(usage);
      await this.auditLogs.log(manager, { man_no: user.man_no, action: 'STATUS_CHANGE', table_name: 'stock_usages', field: 'status', old_value: 'PENDING', new_value: 'RETURNED' });
      return result;
    });
    void this.notifyStockUsage(usage as any, 'RETURNED', 'self_mgmt');
    return saved;
  }
}
