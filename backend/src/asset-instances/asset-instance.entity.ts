import {
  Entity, Column, PrimaryColumn, ManyToOne, JoinColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { Item } from '../items/item.entity';
import { Storage } from '../storage/storage.entity';
import { Employee } from '../employees/employee.entity';

export type AssetStatus = 'IN_STOCK' | 'IN_USE' | 'DISPOSED';

@Entity('asset_instances')
export class AssetInstance {
  @PrimaryColumn({ length: 36, comment: 'UUID' })
  asset_id: string;

  @Column({ length: 50, comment: '품목코드' })
  item_code: string;

  @Column({ length: 100, unique: true, comment: '시리얼넘버' })
  serial_no: string;

  @Column({ length: 50, comment: '현재 창고코드' })
  storage_code: string;

  @Column({ length: 20, default: 'IN_STOCK', comment: 'IN_STOCK/IN_USE/DISPOSED' })
  status: AssetStatus;

  @Column({ type: 'date', nullable: true, comment: '취득일' })
  acquired_at: string | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ length: 20, comment: '등록자' })
  man_no: string;

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

  @ManyToOne(() => Employee)
  @JoinColumn({ name: 'man_no' })
  registeredBy: Employee;
}
