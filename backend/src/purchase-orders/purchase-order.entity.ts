import {
  Entity, Column, PrimaryColumn, ManyToOne, OneToMany,
  JoinColumn, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { Employee } from '../employees/employee.entity';
import { PurchaseRequest } from '../purchase-requests/purchase-request.entity';
import { PurchaseOrderItem } from './purchase-order-item.entity';

@Entity('purchase_orders')
export class PurchaseOrder {
  @PrimaryColumn({ length: 30 })
  order_id: string;

  @Column({ length: 20, default: 'PENDING' })
  status: string;

  @Column({ length: 200 })
  supplier: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  total_amount: number;

  @Column({ nullable: true })
  ordered_at: Date;

  @Column({ type: 'date', nullable: true })
  expected_date: string;

  @Column({ type: 'text', nullable: true })
  note: string;

  @Column({ length: 30 })
  request_id: string;

  @Column({ length: 20 })
  order_man_no: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => PurchaseRequest)
  @JoinColumn({ name: 'request_id' })
  purchaseRequest: PurchaseRequest;

  @ManyToOne(() => Employee)
  @JoinColumn({ name: 'order_man_no' })
  orderedBy: Employee;

  @OneToMany(() => PurchaseOrderItem, (item) => item.purchaseOrder, { cascade: true })
  items: PurchaseOrderItem[];
}
