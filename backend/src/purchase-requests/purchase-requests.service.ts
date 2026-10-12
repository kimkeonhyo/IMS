import {
  Injectable, NotFoundException, ForbiddenException,
  ConflictException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { PurchaseRequest } from './purchase-request.entity';
import { PurchaseRequestItem } from './purchase-request-item.entity';
import { CreatePurchaseRequestDto } from './dto/create-purchase-request.dto';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { Employee } from '../employees/employee.entity';
import { generateDocNo } from '../common/utils/doc-no.util';
import { EmailService } from '../email/email.service';
import { RolePermissionsService } from '../role-permissions/role-permissions.service';

const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT:     ['SUBMITTED'],
  SUBMITTED: ['ORDERED'],   // 승인 단계 없이 발주 시 직접 전이
  APPROVED:  ['ORDERED'],   // 기존 APPROVED 데이터 호환
  ORDERED:   ['RECEIVED'],
  RECEIVED:  [],
  CANCELLED: [],
};

@Injectable()
export class PurchaseRequestsService {
  constructor(
    @InjectRepository(PurchaseRequest) private readonly repo: Repository<PurchaseRequest>,
    @InjectRepository(Employee) private readonly empRepo: Repository<Employee>,
    private readonly auditLogs: AuditLogsService,
    private readonly dataSource: DataSource,
    private readonly emailService: EmailService,
    private readonly rolePermissions: RolePermissionsService,
  ) {}

  findAll(user: Employee) {
    const qb = this.repo.createQueryBuilder('pr')
      .leftJoinAndSelect('pr.items', 'items')
      .leftJoinAndSelect('items.item', 'item')
      .leftJoinAndSelect('pr.requester', 'requester')
      .orderBy('pr.created_at', 'DESC');

    return qb.getMany();
  }

  async findOne(request_id: string, user: Employee) {
    const pr = await this.repo.findOne({
      where: { request_id },
      relations: ['items', 'items.item', 'requester', 'approver'],
    });
    if (!pr) throw new NotFoundException('ERR_RES_001');
    this.checkTeamScope(pr, user);
    return pr;
  }

  async create(dto: CreatePurchaseRequestDto, user: Employee) {
    return this.dataSource.transaction(async (manager) => {
      const request_id = await generateDocNo(this.dataSource, 'purchase_requests', 'request_id', 'PR');

      const pr = manager.create(PurchaseRequest, {
        request_id,
        title:       dto.title,
        description: dto.note,           // 목적
        background:  dto.background,
        supplier:     dto.supplier,
        fund_source:  dto.fund_source,
        fund_budget:  dto.fund_budget,
        fund_project: dto.fund_project,
        flex_link:   dto.flex_link ?? undefined,
        status: 'DRAFT',
        request_man_no: user.man_no,
      });
      await manager.save(pr);

      for (const itemDto of dto.items) {
        const item = manager.create(PurchaseRequestItem, {
          request_item_id: uuidv4(),
          request_id,
          item_code:    itemDto.item_code,
          storage_code: itemDto.storage_code,
          quantity:     itemDto.quantity,
          unit_price:   itemDto.unit_price ?? 0,
          spec:         itemDto.spec,
          supplier:     itemDto.supplier,
          note:         itemDto.note,
        });
        await manager.save(item);
      }

      await this.auditLogs.log(manager, {
        man_no: user.man_no, action: 'CREATE',
        table_name: 'purchase_requests', new_value: request_id,
      });

      return this.repo.findOne({ where: { request_id }, relations: ['items'] });
    });
  }

  /** DRAFT 상태에서만 수정 */
  async update(request_id: string, dto: CreatePurchaseRequestDto, user: Employee) {
    const pr = await this.repo.findOne({ where: { request_id }, relations: ['requester'] });
    if (!pr) throw new NotFoundException('ERR_RES_001');
    if (pr.status !== 'DRAFT') throw new BadRequestException('ERR_FLOW_001: DRAFT 상태에서만 수정 가능합니다');
    this.checkTeamScope(pr, user);

    return this.dataSource.transaction(async (manager) => {
      pr.title       = dto.title;
      pr.description = dto.note        ?? pr.description;
      pr.background  = dto.background  ?? pr.background;
      pr.supplier     = dto.supplier     ?? pr.supplier;
      pr.fund_source  = dto.fund_source  ?? pr.fund_source;
      pr.fund_budget  = dto.fund_budget  ?? pr.fund_budget;
      pr.fund_project = dto.fund_project ?? pr.fund_project;
      pr.flex_link   = dto.flex_link   ?? pr.flex_link;
      await manager.save(pr);

      await manager.delete(PurchaseRequestItem, { request_id });
      for (const itemDto of dto.items) {
        await manager.save(manager.create(PurchaseRequestItem, {
          request_item_id: uuidv4(), request_id,
          item_code: itemDto.item_code, storage_code: itemDto.storage_code,
          quantity: itemDto.quantity, unit_price: itemDto.unit_price ?? 0,
          spec: itemDto.spec,
          supplier: itemDto.supplier, note: itemDto.note,
        }));
      }

      await this.auditLogs.log(manager, { man_no: user.man_no, action: 'UPDATE', table_name: 'purchase_requests', new_value: request_id });
      return this.repo.findOne({ where: { request_id }, relations: ['items', 'items.item', 'requester', 'approver'] });
    });
  }

  /** DRAFT → SUBMITTED */
  async submit(request_id: string, user: Employee) {
    const result = await this.transition(request_id, 'SUBMITTED', user, async (_manager, pr) => {
      if (pr.request_man_no !== user.man_no && user.man_roll === 'USER') {
        throw new ForbiddenException('ERR_AUTH_003');
      }
    });

    // 요청자 본인 + 팀원 + 경영지원팀 + pr:approve 권한자에게 알림
    const pr = await this.repo.findOne({ where: { request_id }, relations: ['requester'] });
    if (pr) {
      const appUrl = process.env.APP_URL ?? 'https://ims.example.com';
      const link = `${appUrl}/purchase-requests?search=${request_id}`;
      const allEmployees = await this.empRepo.find({ where: { is_active: 1 } });

      const notifiedSet = new Set<string>();
      const notify = (e: Employee) => {
        if (!e.email || notifiedSet.has(e.man_no)) return;
        notifiedSet.add(e.man_no);
        void this.emailService.sendPurchaseRequestApprovalNeeded(
          e.email, e.name, user.name, pr.title, request_id, link,
        );
      };

      // 결재 권한은 역할에 붙어 있다 — 해당 권한을 가진 역할을 먼저 추린다
      const approverRoles = new Set<string>();
      for (const rp of await this.rolePermissions.findAll()) {
        if (rp.permissions?.includes('pr:approve')) approverRoles.add(rp.role);
      }
      approverRoles.add('MASTER');   // MASTER는 항상 결재 가능

      // 요청자 본인
      if (pr.requester) notify(pr.requester);

      for (const e of allEmployees) {
        const isTeammate = pr.requester && e.man_team === pr.requester.man_team;
        const isMgmt = e.man_team === '경영지원팀';
        const isApprover = approverRoles.has(e.man_roll);
        if (isTeammate || isMgmt || isApprover) notify(e);
      }
    }
    return result;
  }

  /** SUBMITTED → APPROVED */
  async approve(request_id: string, user: Employee) {
    return this.transition(request_id, 'APPROVED', user, async (_manager, pr) => {
      pr.approved_man_no = user.man_no;
      pr.approved_at = new Date();
    });
  }

  /** SUBMITTED → DRAFT (반려) */
  async reject(request_id: string, reason: string, user: Employee) {
    return this.transition(request_id, 'DRAFT', user, async (_manager, pr) => {
      pr.cancel_reason = reason;
    });
  }

  /** PENDING 이하 → CANCELLED */
  async cancel(request_id: string, reason: string, user: Employee) {
    const pr = await this.findOne(request_id, user);
    if (!['DRAFT', 'SUBMITTED'].includes(pr.status)) {
      throw new BadRequestException('ERR_FLOW_001: 제출 이하 상태만 취소 가능합니다');
    }
    return this.dataSource.transaction(async (manager) => {
      pr.status = 'CANCELLED';
      pr.cancel_reason = reason;
      pr.cancelled_at = new Date();
      const saved = await manager.save(pr);
      await this.auditLogs.log(manager, {
        man_no: user.man_no, action: 'STATUS_CHANGE', table_name: 'purchase_requests',
        field: 'status', old_value: pr.status, new_value: 'CANCELLED',
      });
      return saved;
    });
  }

  // ── 내부 헬퍼 ─────────────────────────────
  private async transition(
    request_id: string,
    toStatus: string,
    user: Employee,
    beforeSave?: (manager: any, pr: PurchaseRequest) => Promise<void>,
  ) {
    const pr = await this.repo.findOne({ where: { request_id } });
    if (!pr) throw new NotFoundException('ERR_RES_001');

    if (!VALID_TRANSITIONS[pr.status]?.includes(toStatus)) {
      throw new ConflictException(`ERR_FLOW_001: ${pr.status} → ${toStatus} 전이 불가`);
    }

    return this.dataSource.transaction(async (manager) => {
      const oldStatus = pr.status;
      if (beforeSave) await beforeSave(manager, pr);
      pr.status = toStatus;
      const saved = await manager.save(pr);

      await this.auditLogs.log(manager, {
        man_no: user.man_no, action: 'STATUS_CHANGE', table_name: 'purchase_requests',
        field: 'status', old_value: oldStatus, new_value: toStatus,
      });
      return saved;
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private checkTeamScope(_pr: PurchaseRequest, _user: Employee) {
    // 전사 공개 — 팀 스코프 제거
  }
}
