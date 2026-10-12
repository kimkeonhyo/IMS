import {
  Entity, Column, PrimaryColumn, ManyToOne, OneToMany,
  JoinColumn, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { Employee } from '../employees/employee.entity';
import { PurchaseOrder } from '../purchase-orders/purchase-order.entity';
import { PurchaseRequest } from '../purchase-requests/purchase-request.entity';
import { StockReceiptItem } from '../stock-receipt-items/stock-receipt-item.entity';

@Entity('store')
export class Store {
  @PrimaryColumn({ length: 36 })
  store_id: string;

  @Column({ type: 'varchar', length: 200, nullable: true, comment: '입고 제목' })
  title: string | null;

  @Column({ length: 20, default: 'RECEIVED' })
  status: string;

  @Column({ nullable: true })
  received_at: Date;

  @Column({ nullable: true })
  cancelled_at: Date;

  @Column({ type: 'text', nullable: true })
  note: string;

  @Column({ length: 20 })
  order_man_no: string;

  /** 입고 요청자 (입고 완료 시 이메일 수신) */
  @Column({ type: 'varchar', length: 20, nullable: true })
  requester_man_no: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  order_id: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  request_id: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Employee)
  @JoinColumn({ name: 'order_man_no' })
  receiver: Employee;

  @ManyToOne(() => Employee, { nullable: true })
  @JoinColumn({ name: 'requester_man_no' })
  requester: Employee | null;

  @ManyToOne(() => PurchaseOrder, { nullable: true })
  @JoinColumn({ name: 'order_id' })
  purchaseOrder: PurchaseOrder | null;

  @ManyToOne(() => PurchaseRequest, { nullable: true })
  @JoinColumn({ name: 'request_id' })
  purchaseRequest: PurchaseRequest | null;

  @OneToMany(() => StockReceiptItem, (item) => item.store, { cascade: true })
  receiptItems: StockReceiptItem[];
}
