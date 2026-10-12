import {
  Entity, Column, PrimaryColumn, ManyToOne, OneToMany,
  JoinColumn, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { Employee } from '../employees/employee.entity';
import { PurchaseRequestItem } from './purchase-request-item.entity';

@Entity('purchase_requests')
export class PurchaseRequest {
  @PrimaryColumn({ length: 30, comment: '요청번호' })
  request_id: string;

  @Column({ length: 20, default: 'DRAFT' })
  status: string;

  @Column({ length: 300 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;   // 목적 (purpose)

  @Column({ type: 'text', nullable: true })
  background: string;    // 추진배경

  @Column({ length: 200, nullable: true })
  supplier: string;      // 거래처

  @Column({ length: 50, nullable: true })
  fund_source: string;   // 지출재원: 자체자금 | 정부사업 | 투자금

  @Column({ length: 300, nullable: true })
  fund_budget: string;   // 소요예산 (정부사업 시): (관)사업비 (항)...

  @Column({ length: 300, nullable: true })
  fund_project: string;  // 정부사업명 (자유 입력)

  @Column({ type: 'text', nullable: true })
  cancel_reason: string;

  @Column({ length: 500, nullable: true, comment: 'Flex 지출결의서 링크' })
  flex_link: string;

  @Column({ nullable: true })
  approved_at: Date;

  @Column({ nullable: true })
  cancelled_at: Date;

  @Column({ length: 20 })
  request_man_no: string;

  @Column({ length: 20, nullable: true })
  approved_man_no: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Employee)
  @JoinColumn({ name: 'request_man_no' })
  requester: Employee;

  @ManyToOne(() => Employee)
  @JoinColumn({ name: 'approved_man_no' })
  approver: Employee;

  @OneToMany(() => PurchaseRequestItem, (item) => item.purchaseRequest, { cascade: true })
  items: PurchaseRequestItem[];
}
