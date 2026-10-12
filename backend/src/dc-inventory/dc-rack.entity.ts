import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('dc_racks')
export class DcRack {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  name: string;

  /** references existing storage.storage_code (no FK) */
  @Column({ type: 'varchar', length: 50, nullable: true })
  site_storage_code: string | null;

  @Column({ type: 'int', default: 42 })
  u_height: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
