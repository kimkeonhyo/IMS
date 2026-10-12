import {
  Entity, Column, PrimaryColumn, ManyToOne, JoinColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { Employee } from '../employees/employee.entity';
import { Item } from '../items/item.entity';
import { Storage } from '../storage/storage.entity';

@Entity('stock_movements')
export class StockMovement {
  @PrimaryColumn({ length: 30 })
  movement_no: string;

  @Column({ length: 20, default: 'PENDING' })
  status: string;

  @Column({ length: 50 })
  item_code: string;

  @Column({ length: 36 })
  from_storage_code: string;

  @Column({ length: 36 })
  to_storage_code: string;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'text', nullable: true })
  note: string;

  /** S/N 관리 품목의 이동 대상 serial_number id 배열 */
  @Column({ type: 'jsonb', nullable: true })
  serial_number_ids: number[] | null;

  @Column({ length: 20 })
  move_man_no: string;

  @Column({ length: 20, nullable: true })
  approved_man_no: string;

  @Column({ length: 20, nullable: true })
  to_man_no: string;  // 인수자 man_no

  @Column({ nullable: true })
  approved_at: Date;

  @Column({ nullable: true })
  moved_at: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Item)
  @JoinColumn({ name: 'item_code' })
  item: Item;

  @ManyToOne(() => Storage)
  @JoinColumn({ name: 'from_storage_code' })
  fromStorage: Storage;

  @ManyToOne(() => Storage)
  @JoinColumn({ name: 'to_storage_code' })
  toStorage: Storage;

  @ManyToOne(() => Employee)
  @JoinColumn({ name: 'move_man_no' })
  mover: Employee;

  @ManyToOne(() => Employee)
  @JoinColumn({ name: 'approved_man_no' })
  approver: Employee;

  @ManyToOne(() => Employee)
  @JoinColumn({ name: 'to_man_no' })
  receiver: Employee;  // 인수자
}
