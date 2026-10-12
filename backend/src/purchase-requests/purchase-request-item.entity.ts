import {
  Entity, Column, PrimaryColumn, ManyToOne, JoinColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { PurchaseRequest } from './purchase-request.entity';
import { Item } from '../items/item.entity';

@Entity('purchase_request_items')
export class PurchaseRequestItem {
  @PrimaryColumn({ length: 36 })
  request_item_id: string;

  @Column({ length: 30 })
  request_id: string;

  @Column({ length: 50 })
  item_code: string;

  @Column({ length: 36, nullable: true })
  storage_code: string;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  unit_price: number;

  @Column({ length: 200, nullable: true })
  spec: string;       // 규격

  @Column({ length: 200, nullable: true })
  supplier: string;

  @Column({ type: 'text', nullable: true })
  note: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => PurchaseRequest, (pr) => pr.items)
  @JoinColumn({ name: 'request_id' })
  purchaseRequest: PurchaseRequest;

  @ManyToOne(() => Item)
  @JoinColumn({ name: 'item_code' })
  item: Item;
}
