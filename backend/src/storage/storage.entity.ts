import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('storage')
export class Storage {
  @PrimaryColumn({ length: 50, comment: '창고코드' })
  storage_code: string;

  @Column({ length: 100, comment: '창고명' })
  storage_name: string;

  @Column({ length: 200, nullable: true, comment: '위치' })
  location: string;

  @Column({ type: 'smallint', default: 1, comment: '활성여부' })
  is_active: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
