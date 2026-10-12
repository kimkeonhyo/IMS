import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export type RegistrationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

@Entity('registration_requests')
export class RegistrationRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  azure_name: string;

  @Column({ default: 'PENDING' })
  status: RegistrationStatus;

  @Column({ nullable: true, type: 'text' })
  reject_reason: string | null;

  @Column({ type: 'varchar', nullable: true, length: 20 })
  reviewed_by: string | null;

  @CreateDateColumn()
  requested_at: Date;

  @UpdateDateColumn()
  reviewed_at: Date;
}
