import {
  Entity, Column, PrimaryColumn, ManyToOne, JoinColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { Store } from '../store/store.entity';
import { Item } from '../items/item.entity';
import { Storage } from '../storage/storage.entity';

@Entity('stock_receipt_items')
export class StockReceiptItem {
  @PrimaryColumn({ length: 36 })
  store_item_id: string;

  @Column({ length: 36 })
  store_id: string;

  @Column({ length: 50 })
  item_code: string;

  @Column({ length: 36 })
  storage_code: string;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ length: 100, nullable: true })
  serial_no: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Store, (store) => store.receiptItems)
  @JoinColumn({ name: 'store_id' })
  store: Store;

  @ManyToOne(() => Item)
  @JoinColumn({ name: 'item_code' })
  item: Item;

  @ManyToOne(() => Storage)
  @JoinColumn({ name: 'storage_code' })
  storage: Storage;
}
