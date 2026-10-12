import {
  Entity, Column, PrimaryColumn, ManyToOne, JoinColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { Storage } from '../storage/storage.entity';
import { Item } from '../items/item.entity';

@Entity('inventory')
export class Inventory {
  @PrimaryColumn({ length: 36 })
  storage_code: string;

  @PrimaryColumn({ length: 50 })
  item_code: string;

  @Column({ type: 'int', default: 0, comment: '현재 수량' })
  quantity: number;

  @ManyToOne(() => Storage)
  @JoinColumn({ name: 'storage_code' })
  storage: Storage;

  @ManyToOne(() => Item)
  @JoinColumn({ name: 'item_code' })
  item: Item;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
