import { Entity, Column, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** 역할별 권한 — 사용자 개인이 아니라 역할(MASTER/ADMIN/USER)에 권한을 붙인다 */
@Entity('role_permissions')
export class RolePermission {
  @PrimaryColumn({ length: 20 })
  role: string;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  permissions: string[];

  @Column({ type: 'varchar', length: 20, nullable: true })
  updated_by: string | null;

  @UpdateDateColumn()
  updated_at: Date;
}
