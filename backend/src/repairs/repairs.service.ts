import {
  Injectable, NotFoundException, BadRequestException, ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Repair, RepairStatus } from './repair.entity';
import { SerialNumber, SerialStatus } from '../serial-numbers/serial-number.entity';
import { Employee } from '../employees/employee.entity';
import { InventoryService } from '../inventory/inventory.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { generateDocNo } from '../common/utils/doc-no.util';

export interface CreateRepairDto {
  item_code: string;
  storage_code: string;
  serial_number_ids?: number[];
  quantity?: number;
  symptom: string;
  occurred_at?: string;
  vendor_name?: string;
  received_at?: string;
}

export interface RegisterRepairDto {
  repair_vendor: string;
  is_paid?: number;
  is_taken_out?: number;
  expected_done_at: string;
}

export interface CompleteRepairDto {
  repair_content: string;
  return_storage_code?: string;
}

@Injectable()
export class RepairsService {
  constructor(
    @InjectRepository(Repair) private readonly repo: Repository<Repair>,
    private readonly dataSource: DataSource,
    private readonly inventoryService: InventoryService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  findAll() {
    return this.repo.find({
      relations: ['item', 'storage', 'returnStorage', 'reporter'],
      order: { created_at: 'DESC' },
    });
  }

  async findOne(repair_no: string) {
    const r = await this.repo.findOne({
      where: { repair_no },
      relations: ['item', 'storage', 'returnStorage', 'reporter'],
    });
    if (!r) throw new NotFoundException('ERR_RES_001');
    const serials = r.serial_number_ids?.length
      ? await this.dataSource.getRepository(SerialNumber).find({
          where: { id: In(r.serial_number_ids) },
          order: { serial_no: 'ASC' },
        })
      : [];
    return { ...r, serials };
  }

  /** 고장 신고 — 대상 S/N을 수리중으로 묶어 재고 선택에서 빠지게 한다 */
  async create(dto: CreateRepairDto, user: Employee) {
    if (!dto.symptom?.trim()) {
      throw new BadRequestException('ERR_VALID_010: 고장 현상을 입력해주세요.');
    }
    const ids = dto.serial_number_ids ?? [];
    if (ids.length) {
      const serials = await this.dataSource.getRepository(SerialNumber).find({ where: { id: In(ids) } });
      const notStock = serials.filter(sn => sn.status !== SerialStatus.STOCK);
      if (notStock.length) {
        throw new ConflictException(
          `ERR_VALID_007: S/N [${notStock.map(sn => sn.serial_no).join(', ')}]은 재고 상태가 아니어서 고장 신고할 수 없습니다.`,
        );
      }
    }

    return this.dataSource.transaction(async (manager) => {
      const repair_no = await generateDocNo(this.dataSource, 'repairs', 'repair_no', 'RP');
      const saved = await manager.save(manager.create(Repair, {
        repair_no,
        item_code: dto.item_code,
        storage_code: dto.storage_code,
        quantity: ids.length || dto.quantity || 1,
        serial_number_ids: ids.length ? ids.map(Number) : null,
        symptom: dto.symptom.trim(),
        occurred_at: dto.occurred_at || null,
        vendor_name: dto.vendor_name?.trim() || null,
        received_at: dto.received_at || null,
        report_man_no: user.man_no,
        status: RepairStatus.REPORTED,
      }));

      if (ids.length) {
        await manager.update(SerialNumber, { id: In(ids) }, { status: SerialStatus.BROKEN });
      }
      await this.auditLogs.log(manager, {
        man_no: user.man_no, action: 'CREATE', table_name: 'repairs', new_value: repair_no,
      });
      return saved;
    });
  }

  /** 수리 등록 — 업체 접수 정보를 채운다 */
  async register(repair_no: string, dto: RegisterRepairDto, user: Employee) {
    const r = await this.repo.findOne({ where: { repair_no } });
    if (!r) throw new NotFoundException('ERR_RES_001');
    if (r.status !== RepairStatus.REPORTED) {
      throw new ConflictException(`ERR_FLOW_001: ${r.status} 상태에서는 수리를 등록할 수 없습니다`);
    }
    if (!dto.repair_vendor?.trim()) {
      throw new BadRequestException('ERR_VALID_010: 수리업체를 입력해주세요.');
    }
    if (!dto.expected_done_at) {
      throw new BadRequestException('ERR_VALID_010: 수리완료 예정일을 입력해주세요.');
    }

    r.repair_vendor = dto.repair_vendor.trim();
    r.is_paid = Number(dto.is_paid) === 1 ? 1 : 0;
    r.is_taken_out = Number(dto.is_taken_out) === 1 ? 1 : 0;
    r.expected_done_at = dto.expected_done_at;
    r.repair_registered_at = new Date();
    r.status = RepairStatus.REPAIRING;

    return this.dataSource.transaction(async (manager) => {
      // 업체로 반출하면 창고에 물건이 없으므로 재고에서 뺀다 (수리 완료 시 다시 넣는다)
      if (r.is_taken_out) {
        await this.inventoryService.decreaseQty(manager, r.storage_code, r.item_code, r.quantity);
      }
      if (r.serial_number_ids?.length) {
        await manager.update(
          SerialNumber,
          { id: In(r.serial_number_ids) },
          { status: SerialStatus.REPAIR },
        );
      }
      const saved = await manager.save(r);
      await this.auditLogs.log(manager, {
        man_no: user.man_no, action: 'STATUS_CHANGE', table_name: 'repairs',
        old_value: RepairStatus.REPORTED, new_value: RepairStatus.REPAIRING,
      });
      return saved;
    });
  }

  /** 수리 완료 — S/N을 재고로 되돌린다. 입고 창고가 바뀌면 재고 수량도 옮긴다. */
  async complete(repair_no: string, dto: CompleteRepairDto, user: Employee) {
    const r = await this.repo.findOne({ where: { repair_no } });
    if (!r) throw new NotFoundException('ERR_RES_001');
    if (r.status !== RepairStatus.REPAIRING) {
      throw new ConflictException(`ERR_FLOW_001: ${r.status} 상태에서는 완료 처리할 수 없습니다`);
    }
    if (!dto.repair_content?.trim()) {
      throw new BadRequestException('ERR_VALID_010: 수리 내용을 입력해주세요.');
    }

    const target = dto.return_storage_code || r.storage_code;

    return this.dataSource.transaction(async (manager) => {
      if (r.is_taken_out) {
        // 반출 시 이미 차감했으므로 입고 창고로 다시 넣기만 한다
        await this.inventoryService.increaseQty(manager, target, r.item_code, r.quantity);
      } else if (target !== r.storage_code) {
        await this.inventoryService.decreaseQty(manager, r.storage_code, r.item_code, r.quantity);
        await this.inventoryService.increaseQty(manager, target, r.item_code, r.quantity);
      }
      if (r.serial_number_ids?.length) {
        await manager.update(
          SerialNumber,
          { id: In(r.serial_number_ids) },
          { status: SerialStatus.STOCK, storage_code: target },
        );
      }
      r.repair_content = dto.repair_content.trim();
      r.return_storage_code = target;
      r.completed_at = new Date();
      r.complete_man_no = user.man_no;
      r.status = RepairStatus.DONE;
      const saved = await manager.save(r);
      await this.auditLogs.log(manager, {
        man_no: user.man_no, action: 'STATUS_CHANGE', table_name: 'repairs',
        old_value: RepairStatus.REPAIRING, new_value: RepairStatus.DONE,
      });
      return saved;
    });
  }

  /** 신고 취소 — 원래 창고의 재고로 되돌린다 */
  async cancel(repair_no: string, reason: string | undefined, user: Employee) {
    const r = await this.repo.findOne({ where: { repair_no } });
    if (!r) throw new NotFoundException('ERR_RES_001');
    if (r.status === RepairStatus.DONE || r.status === RepairStatus.CANCELLED) {
      throw new ConflictException(`ERR_FLOW_001: ${r.status} 상태에서는 취소할 수 없습니다`);
    }

    return this.dataSource.transaction(async (manager) => {
      // 반출된 상태로 취소되면 차감분을 원래 창고로 되돌린다
      if (r.status === RepairStatus.REPAIRING && r.is_taken_out) {
        await this.inventoryService.increaseQty(manager, r.storage_code, r.item_code, r.quantity);
      }
      if (r.serial_number_ids?.length) {
        await manager.update(
          SerialNumber,
          { id: In(r.serial_number_ids) },
          { status: SerialStatus.STOCK, storage_code: r.storage_code },
        );
      }
      const prev = r.status;
      r.status = RepairStatus.CANCELLED;
      r.cancelled_at = new Date();
      r.cancel_reason = reason?.trim() || null;
      const saved = await manager.save(r);
      await this.auditLogs.log(manager, {
        man_no: user.man_no, action: 'STATUS_CHANGE', table_name: 'repairs',
        old_value: prev, new_value: RepairStatus.CANCELLED,
      });
      return saved;
    });
  }
}
