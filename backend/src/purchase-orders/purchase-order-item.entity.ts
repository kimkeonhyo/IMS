import {
  Entity, Column, PrimaryColumn, ManyToOne, JoinColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { PurchaseOrder } from './purchase-order.entity';
import { Item } from '../items/item.entity';
import { Storage } from '../storage/storage.entity';

@Entity('purchase_order_items')
export class PurchaseOrderItem {
  @PrimaryColumn({ length: 36 })
  order_item_id: string;

  @Column({ length: 30 })
  order_id: string;

  @Column({ length: 50 })
  item_code: string;

  @Column({ length: 36 })
  storage_code: string;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  unit_price: number;

  @Column({ length: 200, nullable: true })
  supplier: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => PurchaseOrder, (po) => po.items)
  @JoinColumn({ name: 'order_id' })
  purchaseOrder: PurchaseOrder;

  @ManyToOne(() => Item)
  @JoinColumn({ name: 'item_code' })
  item: Item;

  @ManyToOne(() => Storage)
  @JoinColumn({ name: 'storage_code' })
  storage: Storage;
}
