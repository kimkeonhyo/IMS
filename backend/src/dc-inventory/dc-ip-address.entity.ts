import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('dc_ip_addresses')
export class DcIpAddress {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 64 })
  address: string;

  /** e.g. '192.0.2.0/24' (example) */
  @Column({ type: 'varchar', length: 64, nullable: true })
  prefix: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  role: string | null;

  /** USED | RESERVED | AVAILABLE */
  @Column({ length: 20, default: 'USED' })
  status: string;

  /** links dc_devices */
  @Column({ type: 'uuid', nullable: true })
  device_id: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
