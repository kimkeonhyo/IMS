import {
  Injectable, NotFoundException, ConflictException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { IsString, IsNotEmpty, IsOptional, IsArray, IsNumber, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PurchaseOrder } from './purchase-order.entity';
import { PurchaseOrderItem } from './purchase-order-item.entity';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { Employee } from '../employees/employee.entity';
import { generateDocNo } from '../common/utils/doc-no.util';

class POItemDto {
  @IsString() @IsNotEmpty() item_code: string;
  @IsString() @IsNotEmpty() storage_code: string;
  @IsNumber() @Min(1) quantity: number;
  @IsNumber() @Min(0) unit_price: number;
  @IsOptional() @IsString() supplier?: string;
}

export class CreatePurchaseOrderDto {
  @IsString() @IsNotEmpty()
  request_id: string;

  @IsOptional() @IsString()
  supplier?: string;

  @IsOptional() @IsString()
  expected_date?: string;

  @IsOptional() @IsString()
  note?: string;

  @IsArray() @ValidateNested({ each: true }) @Type(() => POItemDto)
  items: POItemDto[];
}

@Injectable()
export class PurchaseOrdersService {
  constructor(
    @InjectRepository(PurchaseOrder) private readonly repo: Repository<PurchaseOrder>,
    private readonly auditLogs: AuditLogsService,
    private readonly dataSource: DataSource,
  ) {}

  findAll(user: Employee) {
    const qb = this.repo.createQueryBuilder('po')
      .leftJoinAndSelect('po.items', 'items')
      .leftJoinAndSelect('po.purchaseRequest', 'pr')
      .leftJoinAndSelect('po.orderedBy', 'orderedBy')
      .orderBy('po.created_at', 'DESC');

    return qb.getMany();
  }

  async findOne(order_id: string) {
    const po = await this.repo.findOne({
      where: { order_id },
      relations: ['items', 'items.item', 'purchaseRequest', 'orderedBy'],
    });
    if (!po) throw new NotFoundException('ERR_RES_001');
    return po;
  }

  async create(dto: CreatePurchaseOrderDto, user: Employee) {
    // 구매요청 SUBMITTED 또는 APPROVED 확인 (승인 단계 제거 후 SUBMITTED에서 직접 발주 가능)
    const prCheck = await this.dataSource.query(
      `SELECT status FROM purchase_requests WHERE request_id = $1`, [dto.request_id],
    );
    if (!prCheck.length || !['SUBMITTED', 'APPROVED'].includes(prCheck[0].status)) {
      throw new BadRequestException('ERR_FLOW_001: SUBMITTED 상태의 구매요청만 발주 가능합니다');
    }
    // 중복 발주 방지
    const dup = await this.repo.findOne({ where: { request_id: dto.request_id } });
    if (dup) throw new ConflictException('ERR_FLOW_002: 이미 발주가 생성된 구매요청입니다');

    return this.dataSource.transaction(async (manager) => {
      const order_id = await generateDocNo(this.dataSource, 'purchase_orders', 'order_id', 'PO');
      const total = dto.items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);

      // 공급업체: 명시적으로 전달되면 사용, 없으면 품목별 공급업체에서 집계
      const uniqueSuppliers = [...new Set(dto.items.map(i => i.supplier).filter(Boolean))];
      const derivedSupplier = dto.supplier || uniqueSuppliers.join(', ') || '';

      const po = manager.create(PurchaseOrder, {
        order_id, supplier: derivedSupplier,
        expected_date: dto.expected_date, note: dto.note,
        request_id: dto.request_id, order_man_no: user.man_no,
        total_amount: total, status: 'PENDING',
      });
      await manager.save(po);

      for (const i of dto.items) {
        await manager.save(manager.create(PurchaseOrderItem, {
          order_item_id: uuidv4(), order_id,
          item_code: i.item_code, storage_code: i.storage_code,
          quantity: i.quantity, unit_price: i.unit_price,
          supplier: i.supplier ?? undefined,
        }));
      }

      // 구매요청 상태 ORDERED로 변경
      await manager.query(
        `UPDATE purchase_requests SET status = 'ORDERED' WHERE request_id = $1`, [dto.request_id],
      );

      await this.auditLogs.log(manager, {
        man_no: user.man_no, action: 'CREATE', table_name: 'purchase_orders', new_value: order_id,
      });
      return this.repo.findOne({ where: { order_id }, relations: ['items'] });
    });
  }

  async confirm(order_id: string, user: Employee) {
    return this.changeStatus(order_id, 'PENDING', 'CONFIRMED', user);
  }

  async cancel(order_id: string, user: Employee) {
    const po = await this.findOne(order_id);
    if (['RECEIVED'].includes(po.status)) {
      throw new BadRequestException('ERR_FLOW_001: 입고 완료된 발주는 취소 불가합니다');
    }
    return this.changeStatus(order_id, po.status, 'CANCELLED', user);
  }

  private async changeStatus(order_id: string, fromStatus: string, toStatus: string, user: Employee) {
    const po = await this.repo.findOne({ where: { order_id } });
    if (!po) throw new NotFoundException('ERR_RES_001');
    if (po.status !== fromStatus) {
      throw new ConflictException(`ERR_FLOW_001: ${po.status} → ${toStatus} 전이 불가`);
    }
    return this.dataSource.transaction(async (manager) => {
      const old = po.status;
      po.status = toStatus;
      if (toStatus === 'CONFIRMED') po.ordered_at = new Date();
      const saved = await manager.save(po);
      await this.auditLogs.log(manager, {
        man_no: user.man_no, action: 'STATUS_CHANGE', table_name: 'purchase_orders',
        field: 'status', old_value: old, new_value: toStatus,
      });
      return saved;
    });
  }
}
