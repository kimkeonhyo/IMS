import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn,
  CreateDateColumn, UpdateDateColumn, Unique,
} from 'typeorm';
import { Item } from '../items/item.entity';
import { Storage } from '../storage/storage.entity';
import { StockReceiptItem } from '../stock-receipt-items/stock-receipt-item.entity';

export enum SerialStatus {
  STOCK     = 'STOCK',
  SHIPPED   = 'SHIPPED',
  USED      = 'USED',
  BROKEN    = 'BROKEN',     // 고장 신고됨 — 창고에 있으나 재고에서 선택되지 않는다
  REPAIR    = 'REPAIR',     // 수리 업체 접수됨 (반출이면 창고에도 없다)
  CANCELLED = 'CANCELLED',
}

@Entity('serial_numbers')
@Unique(['serial_no', 'item_code'])
export class SerialNumber {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ length: 100 })
  serial_no: string;

  @Column({ type: 'varchar', length: 100, nullable: true, comment: '장비번호(자산번호)' })
  asset_no: string | null;

  @Column({ length: 50 })
  item_code: string;

  @Column({ type: 'varchar', length: 20, default: SerialStatus.STOCK })
  status: SerialStatus;

  /** 현재 위치 — STOCK 상태일 때만 값 있음 */
  @Column({ type: 'varchar', length: 36, nullable: true })
  storage_code: string | null;

  /** 입고 출처 */
  @Column({ length: 36 })
  store_item_id: string;

  /** 납품 시 설정 */
  @Column({ type: 'varchar', length: 36, nullable: true })
  shipment_item_id: string | null;

  /** 사용 시 설정 */
  @Column({ type: 'varchar', length: 30, nullable: true })
  usage_no: string | null;

  /** 입고 시 등록한 스펙 태그값 (예: {CPU: "i7-14700K", RAM: "32GB"}) */
  @Column({ type: 'jsonb', nullable: true })
  tags: Record<string, string> | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Item)
  @JoinColumn({ name: 'item_code' })
  item: Item;

  @ManyToOne(() => Storage)
  @JoinColumn({ name: 'storage_code' })
  storage: Storage;

  @ManyToOne(() => StockReceiptItem)
  @JoinColumn({ name: 'store_item_id' })
  storeReceiptItem: StockReceiptItem;
}
