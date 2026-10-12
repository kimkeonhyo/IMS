import {
  Entity, Column, PrimaryColumn, ManyToOne, JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Shipment } from './shipment.entity';
import { Item } from '../items/item.entity';
import { Storage } from '../storage/storage.entity';

@Entity('shipment_items')
export class ShipmentItem {
  @PrimaryColumn({ length: 36 })
  shipment_item_id: string;

  @Column({ length: 30 })
  shipment_id: string;

  @Column({ length: 50 })
  item_code: string;

  @Column({ length: 36 })
  storage_code: string;

  @Column({ type: 'int' })
  quantity: number;

  /** S/N 관리 품목의 선택된 serial_number id 배열 */
  @Column({ type: 'jsonb', nullable: true })
  serial_number_ids: number[] | null;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => Shipment, (s) => s.items)
  @JoinColumn({ name: 'shipment_id' })
  shipment: Shipment;

  @ManyToOne(() => Item)
  @JoinColumn({ name: 'item_code' })
  item: Item;

  @ManyToOne(() => Storage)
  @JoinColumn({ name: 'storage_code' })
  storage: Storage;
}
