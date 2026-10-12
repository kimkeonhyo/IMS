import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('dc_connections')
export class DcConnection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  a_device_id: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  a_port: string | null;

  @Column({ type: 'uuid' })
  b_device_id: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  b_port: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  cable_type: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
