import {
  Entity, Column, PrimaryColumn, ManyToOne, JoinColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { Employee } from '../employees/employee.entity';
import { Item } from '../items/item.entity';
import { Storage } from '../storage/storage.entity';

@Entity('stock_usages')
export class StockUsage {
  @PrimaryColumn({ length: 30 })
  usage_no: string;

  @Column({ length: 50 })
  item_code: string;

  @Column({ length: 36 })
  storage_code: string;

  @Column({ type: 'int' })
  quantity: number;

  /** 사용된 S/N id 목록 — 반납/이력 조회 시에도 어떤 장비였는지 보존 (역참조와 무관) */
  @Column({ type: 'jsonb', nullable: true })
  serial_number_ids: number[] | null;

  @Column({ type: 'text', nullable: true })
  purpose: string;

  /** 사용처 — 창고 코드이거나 'EXTERNAL'(외부) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  use_place_code: string | null;

  /** 사용처가 외부일 때 직접 입력한 장소명 */
  @Column({ type: 'varchar', length: 100, nullable: true })
  use_place_name: string | null;

  /** 사용기한 (date). null이면 무기한 — is_indefinite로 구분 */
  @Column({ type: 'date', nullable: true })
  use_until: string | null;

  /** 무기한 사용 여부 (1이면 use_until 무시) */
  @Column({ type: 'smallint', default: 0 })
  is_indefinite: number;

  @Column({ length: 20, default: 'PENDING' })
  status: string;  // PENDING | COMPLETED | RETURNED | CANCELLED

  @Column({ type: 'smallint', default: 0 })
  is_cancelled: number;

  @Column({ nullable: true })
  cancelled_at: Date;

  @Column({ type: 'text', nullable: true })
  cancel_reason: string;

  /** 등록된 직원 사번 (미가입자인 경우 null) */
  @Column({ type: 'varchar', length: 20, nullable: true })
  use_man_no: string | null;

  /** 미가입자 이름 (use_man_no가 없을 때 사용) */
  @Column({ type: 'varchar', length: 50, nullable: true })
  use_name: string | null;

  @Column({ length: 20, nullable: true })
  cancel_man_no: string;

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
  @JoinColumn({ name: 'use_man_no' })
  user: Employee;

  @ManyToOne(() => Employee)
  @JoinColumn({ name: 'cancel_man_no' })
  canceller: Employee;
}
