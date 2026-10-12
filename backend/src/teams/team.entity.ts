import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('teams')
export class Team {
  @PrimaryColumn({ length: 50, comment: '팀코드' })
  team_code: string;

  @Column({ length: 100, comment: '팀명' })
  team_name: string;

  @Column({ type: 'text', nullable: true, comment: '설명' })
  description: string;

  @Column({ type: 'smallint', default: 1, comment: '활성여부' })
  is_active: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
