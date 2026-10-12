import {
  Entity, Column, PrimaryColumn, ManyToOne, JoinColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { Employee } from '../employees/employee.entity';
import { Item } from '../items/item.entity';
import { Storage } from '../storage/storage.entity';

/** 고장 신고 → 수리 등록 → 수리 완료로 이어지는 한 건의 흐름 */
export enum RepairStatus {
  REPORTED  = 'REPORTED',    // 고장 신고됨 (수리 미등록)
  REPAIRING = 'REPAIRING',   // 수리 등록됨 (업체 접수)
  DONE      = 'DONE',        // 수리 완료 (재고 복귀)
  CANCELLED = 'CANCELLED',   // 신고 취소
}

@Entity('repairs')
export class Repair {
  @PrimaryColumn({ length: 30 })
  repair_no: string;

  @Column({ length: 50 })
  item_code: string;

  /** 고장 신고 시점의 보관 창고 */
  @Column({ length: 36 })
  storage_code: string;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  /** 고장난 S/N id 목록 */
  @Column({ type: 'jsonb', nullable: true })
  serial_number_ids: number[] | null;

  /* ── 고장 신고 ─────────────────────────────────────────── */

  /** 고장 현상 (필수) */
  @Column({ type: 'text' })
  symptom: string;

  /** 고장이 발생한 날 (선택) — 신고일과 다를 수 있어 따로 받는다 */
  @Column({ type: 'date', nullable: true })
  occurred_at: string | null;

  /** 거래처 — 구매처·납품처 등 (선택) */
  @Column({ type: 'varchar', length: 100, nullable: true })
  vendor_name: string | null;

  /** 입고일 — 장비를 들여온 날 (선택) */
  @Column({ type: 'date', nullable: true })
  received_at: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  report_man_no: string | null;

  /* ── 수리 등록 ─────────────────────────────────────────── */

  /** 수리업체 (수리 등록 시 필수) */
  @Column({ type: 'varchar', length: 100, nullable: true })
  repair_vendor: string | null;

  /** 유상 수리 여부 (0=무상, 1=유상) */
  @Column({ type: 'smallint', default: 0 })
  is_paid: number;

  /** 장비를 업체로 반출했는지 */
  @Column({ type: 'smallint', default: 0 })
  is_taken_out: number;

  /** 수리 완료 예정일 (수리 등록 시 필수) */
  @Column({ type: 'date', nullable: true })
  expected_done_at: string | null;

  @Column({ type: 'timestamp', nullable: true })
  repair_registered_at: Date | null;

  /* ── 수리 완료 ─────────────────────────────────────────── */

  /** 수리 내용 (완료 시 필수) */
  @Column({ type: 'text', nullable: true })
  repair_content: string | null;

  /** 수리 후 입고 창고 — 미지정 시 신고 시점 창고로 복귀 */
  @Column({ type: 'varchar', length: 36, nullable: true })
  return_storage_code: string | null;

  @Column({ type: 'timestamp', nullable: true })
  completed_at: Date | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  complete_man_no: string | null;

  /* ── 상태 ──────────────────────────────────────────────── */

  @Column({ length: 20, default: RepairStatus.REPORTED })
  status: string;

  @Column({ type: 'timestamp', nullable: true })
  cancelled_at: Date | null;

  @Column({ type: 'text', nullable: true })
  cancel_reason: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Item, { nullable: true })
  @JoinColumn({ name: 'item_code' })
  item: Item;

  @ManyToOne(() => Storage, { nullable: true })
  @JoinColumn({ name: 'storage_code' })
  storage: Storage;

  @ManyToOne(() => Storage, { nullable: true })
  @JoinColumn({ name: 'return_storage_code' })
  returnStorage: Storage;

  @ManyToOne(() => Employee, { nullable: true })
  @JoinColumn({ name: 'report_man_no' })
  reporter: Employee;
}
