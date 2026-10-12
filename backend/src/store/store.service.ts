import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { IsString, IsNotEmpty, IsArray, IsNumber, Min, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { Store } from './store.entity';
import { StockReceiptItem } from '../stock-receipt-items/stock-receipt-item.entity';
import { SerialNumber, SerialStatus } from '../serial-numbers/serial-number.entity';
import { InventoryService } from '../inventory/inventory.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { Employee } from '../employees/employee.entity';
import { generateDocNo } from '../common/utils/doc-no.util';
import { EmailService } from '../email/email.service';

class SerialEntryDto {
  @IsString() @IsNotEmpty() serial_no: string;
  @IsOptional() @IsString() asset_no?: string;
  @IsOptional() tags?: Record<string, string>;
}

class StoreItemDto {
  @IsString() @IsNotEmpty() item_code: string;
  @IsString() @IsNotEmpty() storage_code: string;
  @IsNumber() @Min(1) quantity: number;
  /** S/N 관리 품목: 수량만큼 {serial_no, tags} 배열 전달 */
  @IsOptional() @IsArray() serials?: SerialEntryDto[];
}

export class CreateStoreDto {
  @IsString() @IsNotEmpty() title: string;         // 입고 제목 (필수)
  @IsOptional() @IsString() request_id?: string;
  @IsOptional() @IsString() requester_man_no?: string;  // 입고 요청자
  @IsOptional() @IsString() note?: string;
  @IsArray() @Type(() => StoreItemDto) items: StoreItemDto[];
}

@Injectable()
export class StoreService {
  constructor(
    @InjectRepository(Store) private readonly repo: Repository<Store>,
    @InjectRepository(Employee) private readonly empRepo: Repository<Employee>,
    private readonly inventoryService: InventoryService,
    private readonly auditLogs: AuditLogsService,
    private readonly dataSource: DataSource,
    private readonly emailService: EmailService,
  ) {}

  findAll(user: Employee) {
    const qb = this.repo.createQueryBuilder('s')
      .leftJoinAndSelect('s.receiptItems', 'receiptItems')
      .leftJoinAndSelect('receiptItems.item', 'item')
      .leftJoinAndSelect('s.receiver', 'receiver')
      .leftJoinAndSelect('s.requester', 'requester')
      .orderBy('s.created_at', 'DESC');

    // PRIVATE 품목이 포함된 입고: MASTER가 아니면 본인이 입고자 또는 요청자인 건만
    if (user.man_roll !== 'MASTER') {
      qb.andWhere(
        `NOT EXISTS (
          SELECT 1 FROM stock_receipt_items sri2
          JOIN items it2 ON it2.item_code = sri2.item_code
          WHERE sri2.store_id = s.store_id
            AND it2.visibility = 'PRIVATE'
        ) OR s.order_man_no = :u OR s.requester_man_no = :u`,
        { u: user.man_no },
      );
    }
    return qb.getMany();
  }

  async findOne(store_id: string) {
    const s = await this.repo.findOne({
      where: { store_id },
      relations: ['receiptItems', 'receiptItems.item', 'receiptItems.storage', 'purchaseOrder', 'purchaseRequest', 'receiver', 'requester'],
    });
    if (!s) throw new NotFoundException('ERR_RES_001');
    return s;
  }

  async receive(dto: CreateStoreDto, user: Employee) {
    // S/N 유효성 사전 검증
    for (const i of dto.items) {
      const [itemRow] = await this.dataSource.query(
        `SELECT use_serial FROM items WHERE item_code = $1`, [i.item_code],
      );
      if (itemRow?.use_serial) {
        if (!i.serials || i.serials.length !== i.quantity) {
          throw new BadRequestException(
            `ERR_VALID_007: ${i.item_code} 품목은 S/N 관리 품목입니다. 수량(${i.quantity})만큼 S/N을 입력해야 합니다.`,
          );
        }
        for (const entry of i.serials) {
          const dup = await this.dataSource.getRepository(SerialNumber).findOne({
            where: { serial_no: entry.serial_no, item_code: i.item_code },
          });
          if (dup) {
            throw new ConflictException(
              `ERR_VALID_008: S/N [${entry.serial_no}] (품목: ${i.item_code})은 이미 등록된 시리얼 번호입니다.`,
            );
          }
        }
      }
    }

    return this.dataSource.transaction(async (manager) => {
      const store_id = await generateDocNo(this.dataSource, 'store', 'store_id', 'PI');
      const createdSerials: { id: number; serial_no: string }[] = [];  // 입고 사진을 붙일 대상 — 프론트가 응답으로 바로 알 수 있게 돌려준다

      const store = manager.create(Store, {
        store_id,
        title: dto.title,
        request_id: dto.request_id ?? null,
        order_id: null,
        order_man_no: user.man_no,
        requester_man_no: dto.requester_man_no ?? null,
        received_at: new Date(), note: dto.note,
        status: 'RECEIVED',
      });
      await manager.save(store);

      for (const i of dto.items) {
        const store_item_id = uuidv4();
        await manager.save(manager.create(StockReceiptItem, {
          store_item_id, store_id,
          item_code: i.item_code, storage_code: i.storage_code, quantity: i.quantity,
        }));
        await this.inventoryService.increaseQty(manager, i.storage_code, i.item_code, i.quantity);

        if (i.serials?.length) {
          for (const entry of i.serials) {
            const savedSn = await manager.save(manager.create(SerialNumber, {
              serial_no: entry.serial_no,
              asset_no: entry.asset_no?.trim() || null,
              item_code: i.item_code,
              status: SerialStatus.STOCK,
              storage_code: i.storage_code,
              store_item_id,
              tags: entry.tags ?? null,
            }));
            createdSerials.push({ id: Number(savedSn.id), serial_no: savedSn.serial_no });
          }
        }
      }

      await this.auditLogs.log(manager, { man_no: user.man_no, action: 'CREATE', table_name: 'store', new_value: store_id });
      return Object.assign(store, { created_serials: createdSerials });
    }).then(async (store) => {
      // 입고 완료 이메일 알림: 요청자 + 경영지원팀
      try {
        const appUrl = process.env.APP_URL ?? 'https://ims.example.com';
        const allEmp = await this.empRepo.find({ where: { is_active: 1 } });
        const notifiedSet = new Set<string>();
        const notify = (e: Employee) => {
          if (!e.email || notifiedSet.has(e.man_no)) return;
          notifiedSet.add(e.man_no);
          void this.emailService.sendStoreReceived(e.email, e.name, store.title ?? store.store_id, store.store_id, appUrl);
        };
        // 입고 요청자
        if (store.requester_man_no) {
          const requester = allEmp.find(e => e.man_no === store.requester_man_no);
          if (requester) notify(requester);
        }
        // 경영지원팀
        for (const e of allEmp) {
          if (e.man_team === '경영지원팀') notify(e);
        }
      } catch (_) { /* fire-and-forget, ignore errors */ }
      return store;
    });
  }

  async cancel(store_id: string, user: Employee, serialNumberIds?: number[]) {
    const store = await this.repo.findOne({ where: { store_id }, relations: ['receiptItems'] });
    if (!store) throw new NotFoundException('ERR_RES_001');
    if (store.status === 'CANCELLED') throw new ConflictException('ERR_FLOW_001: 이미 취소된 입고입니다');

    // ── 부분 취소: 선택한 S/N만 취소 ──
    const storeItemIds = store.receiptItems.map(r => r.store_item_id);
    const stockSerials = await this.dataSource.getRepository(SerialNumber).find({
      where: { store_item_id: In(storeItemIds), status: SerialStatus.STOCK },
    });
    const wantPartial = !!serialNumberIds?.length && stockSerials.length > 0
      && serialNumberIds.length < stockSerials.length;

    if (wantPartial) {
      const selSet = new Set(serialNumberIds);
      const selected = stockSerials.filter(s => selSet.has(s.id));
      if (selected.length === 0) {
        throw new ConflictException('ERR_FLOW_004: 취소할 S/N을 선택해주세요 (재고 상태만 취소 가능)');
      }
      return this.dataSource.transaction(async (manager) => {
        const byStoreItem = new Map<string, SerialNumber[]>();
        for (const sn of selected) {
          const arr = byStoreItem.get(sn.store_item_id) ?? [];
          arr.push(sn);
          byStoreItem.set(sn.store_item_id, arr);
        }
        for (const [siid, sns] of byStoreItem) {
          const item = store.receiptItems.find(r => r.store_item_id === siid);
          if (!item) continue;
          await this.inventoryService.decreaseQty(manager, item.storage_code, item.item_code, sns.length);
          item.quantity = Math.max(0, item.quantity - sns.length);
          await manager.save(item);
        }
        await manager.update(
          SerialNumber,
          { id: In(selected.map(s => s.id)) },
          { status: SerialStatus.CANCELLED, storage_code: null },
        );
        // 남은 재고 S/N 없으면 입고 자체를 취소 처리
        const remaining = stockSerials.length - selected.length;
        if (remaining <= 0) {
          store.status = 'CANCELLED';
          store.cancelled_at = new Date();
        }
        const saved = await manager.save(store);
        await this.auditLogs.log(manager, {
          man_no: user.man_no, action: 'STATUS_CHANGE', table_name: 'store',
          field: 'partial_cancel',
          new_value: `S/N ${selected.length}개 부분 입고취소 (잔여 ${Math.max(remaining, 0)})`,
        });
        return saved;
      });
    }

    return this.dataSource.transaction(async (manager) => {
      for (const item of store.receiptItems) {
        await this.inventoryService.decreaseQty(manager, item.storage_code, item.item_code, item.quantity);

        // STOCK 상태 S/N만 CANCELLED 처리 (이미 납품/사용된 건은 건드리지 않음)
        await manager.update(
          SerialNumber,
          { store_item_id: item.store_item_id, status: SerialStatus.STOCK },
          { status: SerialStatus.CANCELLED, storage_code: null },
        );
      }
      // 구매요청 상태 복원 (PR 기반인 경우)
      if (store.request_id) {
        await manager.query(
          `UPDATE purchase_requests SET status = 'SUBMITTED' WHERE request_id = $1`, [store.request_id],
        );
      }
      // 기존 PO 기반 입고 취소 호환
      if (store.order_id) {
        await manager.query(`UPDATE purchase_orders SET status = 'CONFIRMED' WHERE order_id = $1`, [store.order_id]);
        await manager.query(
          `UPDATE purchase_requests SET status = 'APPROVED'
           FROM purchase_orders po
           WHERE purchase_requests.request_id = po.request_id AND po.order_id = $1`, [store.order_id],
        );
      }
      store.status = 'CANCELLED';
      store.cancelled_at = new Date();
      const saved = await manager.save(store);
      await this.auditLogs.log(manager, { man_no: user.man_no, action: 'STATUS_CHANGE', table_name: 'store', new_value: store_id });
      return saved;
    });
  }
}
