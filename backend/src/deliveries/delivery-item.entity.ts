import {
  Entity, Column, PrimaryColumn, ManyToOne, JoinColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { Delivery } from './delivery.entity';
import { Item } from '../items/item.entity';
import { Storage } from '../storage/storage.entity';

@Entity('delivery_items')
export class DeliveryItem {
  @PrimaryColumn({ length: 36 })
  delivery_item_id: string;

  @Column({ length: 30 })
  delivery_no: string;

  @Column({ length: 50 })
  item_code: string;

  @Column({ length: 36 })
  storage_code: string;

  @Column({ type: 'int' })
  quantity: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Delivery, (d) => d.items)
  @JoinColumn({ name: 'delivery_no' })
  delivery: Delivery;

  @ManyToOne(() => Item)
  @JoinColumn({ name: 'item_code' })
  item: Item;

  @ManyToOne(() => Storage)
  @JoinColumn({ name: 'storage_code' })
  storage: Storage;
}
