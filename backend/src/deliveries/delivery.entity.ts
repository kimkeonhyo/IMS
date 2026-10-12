import {
  Entity, Column, PrimaryColumn, ManyToOne, OneToMany,
  JoinColumn, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { Employee } from '../employees/employee.entity';
import { DeliveryItem } from './delivery-item.entity';

@Entity('deliveries')
export class Delivery {
  @PrimaryColumn({ length: 30 })
  delivery_no: string;

  @Column({ length: 20, default: 'PENDING' })
  status: string;

  @Column({ length: 300 })
  title: string;

  @Column({ nullable: true })
  approved_at: Date;

  @Column({ nullable: true })
  delivered_at: Date;

  @Column({ type: 'text', nullable: true })
  note: string;

  @Column({ length: 20 })
  delivery_man_no: string;

  @Column({ length: 20, nullable: true })
  approved_man_no: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Employee)
  @JoinColumn({ name: 'delivery_man_no' })
  deliveryMan: Employee;

  @ManyToOne(() => Employee)
  @JoinColumn({ name: 'approved_man_no' })
  approver: Employee;

  @OneToMany(() => DeliveryItem, (item) => item.delivery, { cascade: true })
  items: DeliveryItem[];
}
