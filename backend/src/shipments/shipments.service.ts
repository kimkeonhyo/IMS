import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { IsString, IsNotEmpty, IsOptional, IsArray, IsNumber, IsIn, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { Shipment } from './shipment.entity';
import { ShipmentItem } from './shipment-item.entity';
import { ShipmentService as ShipmentServiceEntity } from './shipment-service.entity';
import { ShipmentServiceImage } from './shipment-service-image.entity';
import { SerialNumber, SerialStatus } from '../serial-numbers/serial-number.entity';
import { InventoryService } from '../inventory/inventory.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { Employee } from '../employees/employee.entity';
import { generateDocNo } from '../common/utils/doc-no.util';
import { EmailService } from '../email/email.service';

class ShipmentItemDto {
  @IsString() @IsNotEmpty() item_code: string;
  @IsString() @IsNotEmpty() storage_code: string;
  @IsNumber() @Min(1) quantity: number;
  /** S/N 관리 품목: 선택한 serial_number id 배열 */
  @IsOptional() @IsArray() serial_number_ids?: number[];
}

class ShipmentServiceImageDto {
  @IsString() @IsNotEmpty() image_name: string;
  @IsString() @IsNotEmpty() version: string;
}

export class ServiceInfoDto {
  @IsString() @IsNotEmpty() service: string; // VMS | NVR | ETC
  @IsOptional() @IsString() service_custom_name?: string;
  @IsString() @IsNotEmpty() deploy_mode: string; // BUNDLE | MANUAL
  @IsOptional() @IsIn(['REMOTE', 'CLOSED']) access_mode?: string; // 원격(VPN) | 폐쇄망(현장 로컬)
  @IsOptional() @IsString() bundle_version?: string;
  @IsOptional() @IsString() delivery_ip?: string;
  @IsOptional() @IsString() user_name?: string;
  @IsOptional() @IsString() password?: string;
  @IsOptional() @IsString() vip?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ShipmentServiceImageDto)
  images?: ShipmentServiceImageDto[];
}

export class CreateShipmentDto {
  @IsString() @IsNotEmpty() title: string;
  @IsString() @IsNotEmpty() customer_name: string;
  @IsOptional() @IsString() delivery_date?: string;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsString() assignee_man_no?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => ShipmentItemDto) items: ShipmentItemDto[];
  @IsOptional() @ValidateNested() @Type(() => ServiceInfoDto) service_info?: ServiceInfoDto;
}

// 직접 납품하므로 발송 단계가 없다: 납품일정 등록(DRAFT) → 납품완료(CONFIRMED)
const TRANSITIONS: Record<string, string[]> = {
  DRAFT:      ['CONFIRMED', 'CANCELLED'],
  CONFIRMED:  ['RETRIEVED'],
  RETRIEVED:  [],
  CANCELLED: [],
};

@Injectable()
export class ShipmentsService {
  constructor(
    @InjectRepository(Shipment) private readonly repo: Repository<Shipment>,
    @InjectRepository(Employee) private readonly empRepo: Repository<Employee>,
    private readonly inventoryService: InventoryService,
    private readonly auditLogs: AuditLogsService,
    private readonly dataSource: DataSource,
    private readonly emailService: EmailService,
  ) {}

  /** 납품 상태 변경 이메일 — 담당자, 담당팀, 경영지원팀에게 발송 */
  private async notifyShipmentStatus(shipment: Shipment, status: string) {
    try {
      const appUrl = process.env.APP_URL ?? 'https://ims.example.com';
      const allEmp = await this.empRepo.find({ where: { is_active: 1 } });
      const notifiedSet = new Set<string>();
      const notify = (e: Employee) => {
        if (!e.email || notifiedSet.has(e.man_no)) return;
        notifiedSet.add(e.man_no);
        void this.emailService.sendShipmentStatusChanged(e.email, e.name, shipment.shipment_id, status, appUrl);
      };
      // 담당자(assignee)
      if (shipment.assignee?.email) notify(shipment.assignee);
      // 담당자 팀원 + 경영지원팀
      const assigneeTeam = shipment.assignee?.man_team;
      for (const e of allEmp) {
        if ((assigneeTeam && e.man_team === assigneeTeam) || e.man_team === '경영지원팀') notify(e);
      }
    } catch (_) { /* fire-and-forget */ }
  }

  /** service_info upsert (delete+insert images) within a transaction manager */
  private async upsertServiceInfo(manager: any, shipment_id: string, info: ServiceInfoDto) {
    let svc = await manager.findOne(ShipmentServiceEntity, { where: { shipment_id } });
    if (!svc) {
      svc = manager.create(ShipmentServiceEntity, { shipment_id });
    }
    svc.service = info.service;
    svc.service_custom_name = info.service_custom_name ?? null;
    svc.deploy_mode = info.deploy_mode;
    svc.access_mode = info.access_mode ?? 'REMOTE';
    svc.bundle_version = info.bundle_version ?? null;
    svc.delivery_ip = info.delivery_ip ?? null;
    svc.user_name = info.user_name ?? null;
    svc.password = info.password ?? null;
    svc.vip = info.vip ?? null;
    const saved = await manager.save(ShipmentServiceEntity, svc);

    await manager.delete(ShipmentServiceImage, { service_id: saved.id });
    for (const img of info.images ?? []) {
      await manager.save(manager.create(ShipmentServiceImage, {
        service_id: saved.id, image_name: img.image_name, version: img.version,
      }));
    }
  }

  /** service_info + images 조회 */
  private async loadServiceInfo(shipment_id: string) {
    const svc = await this.dataSource.getRepository(ShipmentServiceEntity)
      .findOne({ where: { shipment_id } });
    if (!svc) return null;
    const images = await this.dataSource.getRepository(ShipmentServiceImage)
      .find({ where: { service_id: svc.id } });
    return { ...svc, images };
  }

  /** 서비스 납품 정보만 수정 — 납품 상태와 무관하게 언제든 추가/수정 가능 (기존 등록 건 보완용) */
  async updateServiceInfo(shipment_id: string, info: ServiceInfoDto, user: Employee) {
    const s = await this.repo.findOne({ where: { shipment_id } });
    if (!s) throw new NotFoundException('ERR_RES_001');
    await this.dataSource.transaction(async (manager) => {
      await this.upsertServiceInfo(manager, shipment_id, info);
      await this.auditLogs.log(manager, {
        man_no: user.man_no, action: 'UPDATE', table_name: 'shipment_services',
        field: 'service_info', new_value: shipment_id,
      });
    });
    return this.loadServiceInfo(shipment_id);
  }

  findAll(user: Employee) {
    const qb = this.repo.createQueryBuilder('sh')
      .leftJoinAndSelect('sh.items', 'items')
      .leftJoinAndSelect('items.item', 'item')
      .leftJoinAndSelect('items.storage', 'storage')
      .leftJoinAndSelect('sh.createdBy', 'createdBy')
      .leftJoinAndSelect('sh.confirmedBy', 'confirmedBy')
      .leftJoinAndSelect('sh.assignee', 'assignee')
      .leftJoinAndSelect('sh.retrievedBy', 'retrievedBy')
      .orderBy('sh.created_at', 'DESC');

    // PRIVATE 품목이 포함된 납품: MASTER가 아니면 본인이 담당자(assignee)인 건만
    if (user.man_roll !== 'MASTER') {
      qb.andWhere(
        `NOT EXISTS (
          SELECT 1 FROM shipment_items si2
          JOIN items it2 ON it2.item_code = si2.item_code
          WHERE si2.shipment_id = sh.shipment_id
            AND it2.visibility = 'PRIVATE'
        ) OR sh.assignee_man_no = :u`,
        { u: user.man_no },
      );
    }
    return qb.getMany();
  }

  async findOne(shipment_id: string) {
    const s = await this.repo.findOne({
      where: { shipment_id },
      relations: ['items', 'items.item', 'items.storage', 'createdBy', 'confirmedBy', 'retrievedBy'],
    });
    if (!s) throw new NotFoundException('ERR_RES_001');
    const service_info = await this.loadServiceInfo(shipment_id);
    return { ...s, service_info };
  }

  async create(dto: CreateShipmentDto, user: Employee) {
    return this.dataSource.transaction(async (manager) => {
      const shipment_id = await generateDocNo(this.dataSource, 'shipments', 'shipment_id', 'SHP');
      const shipment = manager.create(Shipment, {
        shipment_id, title: dto.title, customer_name: dto.customer_name,
        delivery_date: dto.delivery_date, note: dto.note,
        status: 'DRAFT', man_no: user.man_no,
        assignee_man_no: dto.assignee_man_no ?? null,
      });
      await manager.save(shipment);

      for (const i of dto.items) {
        await manager.save(manager.create(ShipmentItem, {
          shipment_item_id: uuidv4(), shipment_id,
          item_code: i.item_code, storage_code: i.storage_code, quantity: i.quantity,
          serial_number_ids: i.serial_number_ids ?? null,
        }));
      }

      if (dto.service_info) {
        await this.upsertServiceInfo(manager, shipment_id, dto.service_info);
      }

      await this.auditLogs.log(manager, {
        man_no: user.man_no, action: 'CREATE',
        table_name: 'shipments', new_value: shipment_id,
      });
      return this.repo.findOne({ where: { shipment_id }, relations: ['items'] });
    });
  }

  /** DRAFT 상태에서만 수정 */
  async update(shipment_id: string, dto: CreateShipmentDto, user: Employee) {
    const s = await this.repo.findOne({ where: { shipment_id } });
    if (!s) throw new NotFoundException('ERR_RES_001');
    if (s.status !== 'DRAFT') throw new ConflictException('ERR_FLOW_001: DRAFT 상태에서만 수정 가능합니다');

    return this.dataSource.transaction(async (manager) => {
      s.title = dto.title;
      s.customer_name = dto.customer_name;
      s.delivery_date = dto.delivery_date ?? null;
      s.note = dto.note ?? null;
      s.assignee_man_no = dto.assignee_man_no ?? null;
      await manager.save(s);

      await manager.delete(ShipmentItem, { shipment_id });
      for (const i of dto.items) {
        await manager.save(manager.create(ShipmentItem, {
          shipment_item_id: uuidv4(), shipment_id,
          item_code: i.item_code, storage_code: i.storage_code, quantity: i.quantity,
          serial_number_ids: i.serial_number_ids ?? null,
        }));
      }

      if (dto.service_info) {
        await this.upsertServiceInfo(manager, shipment_id, dto.service_info);
      }

      await this.auditLogs.log(manager, { man_no: user.man_no, action: 'UPDATE', table_name: 'shipments', new_value: shipment_id });
      return this.repo.findOne({ where: { shipment_id }, relations: ['items', 'items.item', 'items.storage'] });
    });
  }

  /** DRAFT → CONFIRMED: 납품 완료 — 이 시점에 재고가 차감된다 */
  async confirm(shipment_id: string, user: Employee) {
    const s = await this.repo.findOne({ where: { shipment_id }, relations: ['items', 'assignee'] });
    if (!s) throw new NotFoundException('ERR_RES_001');
    if (!TRANSITIONS[s.status]?.includes('CONFIRMED')) {
      throw new ConflictException(`ERR_FLOW_001: ${s.status} → CONFIRMED 전이 불가`);
    }
    const prevStatus = s.status;

    // S/N 유효성 검증
    for (const item of s.items) {
      if (item.serial_number_ids?.length) {
        if (item.serial_number_ids.length !== item.quantity) {
          throw new BadRequestException(
            `ERR_VALID_007: S/N 관리 품목(${item.item_code})의 S/N 개수(${item.serial_number_ids.length})와 수량(${item.quantity})이 다릅니다.`,
          );
        }
        const serials = await this.dataSource.getRepository(SerialNumber).find({
          where: { id: In(item.serial_number_ids) },
        });
        const notStock = serials.filter(sn => sn.status !== SerialStatus.STOCK);
        if (notStock.length) {
          throw new BadRequestException(
            `ERR_VALID_007: S/N [${notStock.map(x => x.serial_no).join(', ')}]은 이미 출고/사용된 상태입니다.`,
          );
        }
      }
    }

    const result = await this.dataSource.transaction(async (manager) => {
      for (const item of s.items) {
        await this.inventoryService.decreaseQty(manager, item.storage_code, item.item_code, item.quantity);

        if (item.serial_number_ids?.length) {
          await manager.update(
            SerialNumber,
            { id: In(item.serial_number_ids) },
            { status: SerialStatus.SHIPPED, storage_code: null, shipment_item_id: item.shipment_item_id },
          );
        }
      }
      s.status = 'CONFIRMED';
      s.confirmed_man_no = user.man_no;
      s.confirmed_at = new Date();
      const saved = await manager.save(s);
      await this.auditLogs.log(manager, {
        man_no: user.man_no, action: 'STATUS_CHANGE',
        table_name: 'shipments', old_value: prevStatus, new_value: 'CONFIRMED',
      });
      return saved;
    });
    void this.notifyShipmentStatus(s, 'CONFIRMED');
    return result;
  }

  /** DRAFT → CANCELLED: 아직 재고가 차감되기 전이라 복구할 것이 없다 */
  async cancel(shipment_id: string, reason: string, user: Employee) {
    const s = await this.repo.findOne({ where: { shipment_id }, relations: ['items', 'assignee'] });
    if (!s) throw new NotFoundException('ERR_RES_001');
    if (!TRANSITIONS[s.status]?.includes('CANCELLED')) {
      throw new ConflictException(`ERR_FLOW_001: ${s.status} → CANCELLED 전이 불가`);
    }
    const prevStatus = s.status;
    const result = await this.dataSource.transaction(async (manager) => {
      s.status = 'CANCELLED';
      s.cancel_reason = reason?.trim() || null;
      s.cancelled_at = new Date();
      const saved = await manager.save(s);
      await this.auditLogs.log(manager, {
        man_no: user.man_no, action: 'STATUS_CHANGE',
        table_name: 'shipments', old_value: prevStatus, new_value: 'CANCELLED',
      });
      return saved;
    });
    void this.notifyShipmentStatus(s, 'CANCELLED');
    return result;
  }

  /** CONFIRMED → RETRIEVED: 재고 복구 + S/N STOCK 복원
   *  - returnStorageCode 미지정: 원래 납품 출고 창고로 복원
   *  - returnStorageCode 지정: 지정 창고로 복원
   */
  async retrieve(shipment_id: string, reason: string, user: Employee, returnStorageCode?: string, serialNumberIds?: number[]) {
    const s = await this.repo.findOne({ where: { shipment_id }, relations: ['items', 'assignee'] });
    if (!s) throw new NotFoundException('ERR_RES_001');
    if (!TRANSITIONS[s.status]?.includes('RETRIEVED')) {
      throw new ConflictException(`ERR_FLOW_001: ${s.status} → RETRIEVED 전이 불가`);
    }

    // ── 부분 회수: 선택한 S/N만 회수 ──
    const allSnIds = s.items.flatMap(i => i.serial_number_ids ?? []);
    const wantPartial = allSnIds.length > 0 && !!serialNumberIds?.length
      && serialNumberIds.length < allSnIds.length;

    if (wantPartial) {
      const selSet = new Set(serialNumberIds!.filter(id => allSnIds.includes(id)));
      if (selSet.size === 0) {
        throw new ConflictException('ERR_FLOW_004: 회수할 S/N을 선택해주세요');
      }
      const result = await this.dataSource.transaction(async (manager) => {
        for (const item of s.items) {
          const itemSel = (item.serial_number_ids ?? []).filter(id => selSet.has(id));
          if (itemSel.length === 0) continue;
          const targetStorage = returnStorageCode || item.storage_code;
          await this.inventoryService.increaseQty(manager, targetStorage, item.item_code, itemSel.length);
          await manager.update(
            SerialNumber,
            { id: In(itemSel) },
            { status: SerialStatus.STOCK, storage_code: targetStorage, shipment_item_id: null },
          );
          item.serial_number_ids = (item.serial_number_ids ?? []).filter(id => !selSet.has(id));
          item.quantity = Math.max(0, item.quantity - itemSel.length);
          await manager.save(item);
        }
        // 남은 S/N 없으면 회수 완료 처리
        const remaining = allSnIds.length - selSet.size;
        if (remaining <= 0) {
          s.status = 'RETRIEVED';
          s.retrieved_at = new Date();
          s.retrieve_reason = reason?.trim() || null;
          s.retrieved_man_no = user.man_no;
        }
        const saved = await manager.save(s);
        await this.auditLogs.log(manager, {
          man_no: user.man_no, action: 'STATUS_CHANGE', table_name: 'shipments',
          old_value: 'CONFIRMED',
          new_value: `S/N ${selSet.size}개 부분 회수 (잔여 ${Math.max(remaining, 0)})`,
        });
        return saved;
      });
      void this.notifyShipmentStatus(s, 'RETRIEVED');
      return result;
    }

    const result = await this.dataSource.transaction(async (manager) => {
      for (const item of s.items) {
        const targetStorage = returnStorageCode || item.storage_code;
        // 재고 복구 (지정 창고)
        await this.inventoryService.increaseQty(manager, targetStorage, item.item_code, item.quantity);
        // S/N STOCK 복원 (지정 창고)
        if (item.serial_number_ids?.length) {
          await manager.update(
            SerialNumber,
            { id: In(item.serial_number_ids) },
            { status: SerialStatus.STOCK, storage_code: targetStorage, shipment_item_id: null },
          );
        }
      }
      s.status = 'RETRIEVED';
      s.retrieved_at = new Date();
      s.retrieve_reason = reason?.trim() || null;
      s.retrieved_man_no = user.man_no;
      const saved = await manager.save(s);
      await this.auditLogs.log(manager, {
        man_no: user.man_no, action: 'STATUS_CHANGE',
        table_name: 'shipments', old_value: 'CONFIRMED', new_value: 'RETRIEVED',
      });
      return saved;
    });
    void this.notifyShipmentStatus(s, 'RETRIEVED');
    return result;
  }

  /** 담당자 지정/변경 */
  async setAssignee(shipment_id: string, assignee_man_no: string | null) {
    const s = await this.repo.findOne({ where: { shipment_id } });
    if (!s) throw new NotFoundException('ERR_RES_001');
    s.assignee_man_no = assignee_man_no;
    return this.repo.save(s);
  }
}
