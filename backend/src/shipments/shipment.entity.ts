import {
  Entity, Column, PrimaryColumn, ManyToOne, OneToMany,
  JoinColumn, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { Employee } from '../employees/employee.entity';
import { ShipmentItem } from './shipment-item.entity';

@Entity('shipments')
export class Shipment {
  @PrimaryColumn({ length: 30, comment: '납품번호' })
  shipment_id: string;

  @Column({ length: 300, comment: '납품명' })
  title: string;

  @Column({ length: 200, comment: '고객사명' })
  customer_name: string;

  @Column({ length: 20, default: 'DRAFT', comment: '상태 DRAFT(납품예정)/CONFIRMED(납품완료)/CANCELLED/RETRIEVED — SHIPPED는 발송 단계 폐지 전 문서' })
  status: string;

  @Column({ type: 'date', nullable: true, comment: '납품 예정일' })
  delivery_date: string | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ length: 20 })
  man_no: string;

  @Column({ length: 20, nullable: true })
  confirmed_man_no: string;

  @Column({ nullable: true })
  shipped_at: Date;

  @Column({ nullable: true })
  confirmed_at: Date;

  @Column({ type: 'timestamp', nullable: true, comment: '취소일시' })
  cancelled_at: Date | null;

  @Column({ type: 'text', nullable: true, comment: '취소 사유' })
  cancel_reason: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true, comment: '담당자 사번' })
  assignee_man_no: string | null;

  @Column({ type: 'timestamp', nullable: true, comment: '회수일시' })
  retrieved_at: Date | null;

  @Column({ type: 'text', nullable: true, comment: '회수 사유' })
  retrieve_reason: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true, comment: '회수 처리자 사번' })
  retrieved_man_no: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Employee)
  @JoinColumn({ name: 'man_no' })
  createdBy: Employee;

  @ManyToOne(() => Employee)
  @JoinColumn({ name: 'confirmed_man_no' })
  confirmedBy: Employee;

  @ManyToOne(() => Employee, { nullable: true })
  @JoinColumn({ name: 'assignee_man_no' })
  assignee: Employee | null;

  @ManyToOne(() => Employee, { nullable: true })
  @JoinColumn({ name: 'retrieved_man_no' })
  retrievedBy: Employee | null;

  @OneToMany(() => ShipmentItem, (i) => i.shipment, { cascade: true })
  items: ShipmentItem[];
}
