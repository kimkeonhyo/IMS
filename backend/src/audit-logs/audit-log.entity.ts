import {
  Entity, Column, PrimaryGeneratedColumn, ManyToOne,
  JoinColumn, CreateDateColumn,
} from 'typeorm';
import { Employee } from '../employees/employee.entity';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  log_id: number;

  @Column({ length: 20 })
  man_no: string;

  @Column({ length: 30 })
  action: string;

  @Column({ length: 100 })
  table_name: string;

  @Column({ length: 100, nullable: true })
  field: string;

  @Column({ type: 'text', nullable: true })
  old_value: string;

  @Column({ type: 'text', nullable: true })
  new_value: string;

  @Column({ default: () => 'CURRENT_TIMESTAMP' })
  performed_at: Date;

  @Column({ length: 45, nullable: true })
  ip_address: string;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => Employee)
  @JoinColumn({ name: 'man_no' })
  performer: Employee;
}
