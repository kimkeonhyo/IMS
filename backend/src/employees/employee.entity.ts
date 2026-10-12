import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('employees')
export class Employee {
  @PrimaryColumn({ length: 20, comment: '사번' })
  man_no: string;

  @Column({ length: 50, unique: true, comment: '로그인 ID' })
  man_id: string;

  @Column({ length: 100, comment: '이름' })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '비밀번호(해시) — Azure AD 전용 계정은 null' })
  password: string | null;

  @Column({ length: 10, comment: '역할: MASTER(0)/ADMIN(1)/USER(2)' })
  man_roll: string;

  @Column({ length: 50, comment: '소속팀' })
  man_team: string;

  @Column({ length: 200, nullable: true, unique: true, comment: '이메일 (로그인 식별자로 사용 가능)' })
  email: string;

  @Column({ length: 30, nullable: true, comment: '연락처' })
  phone: string;

  @Column({ type: 'smallint', default: 1, comment: '활성여부' })
  is_active: number;

  @Column({ type: 'jsonb', default: '[]', comment: '기능 권한 목록' })
  permissions: string[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
