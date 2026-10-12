import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum ItemCategory {
  HW     = 'HW',
  SW     = 'SW',
  NORMAL = 'NORMAL',
  CON    = 'CON',
  EQUIP  = 'EQUIP',
}

export const CATEGORY_PREFIX: Record<ItemCategory, string> = {
  [ItemCategory.HW]:     'HW',
  [ItemCategory.SW]:     'SW',
  [ItemCategory.NORMAL]: 'Normal',
  [ItemCategory.CON]:    'Con',
  [ItemCategory.EQUIP]:  'Equip',
};

@Entity('items')
export class Item {
  @PrimaryColumn({ length: 50, comment: '품목코드 (자동채번)' })
  item_code: string;

  @Column({ type: 'varchar', length: 20, comment: '품종 (HW/SW/NORMAL/CON/EQUIP)' })
  category: ItemCategory;

  @Column({ length: 200, comment: '품목명' })
  item_name: string;

  @Column({ type: 'text', nullable: true, comment: '설명' })
  description: string;

  @Column({ length: 20, default: 'EA', comment: '단위(EA/BOX/SET/KG/L)' })
  unit: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true, default: 0, comment: '단가' })
  unit_price: number;

  @Column({ type: 'smallint', default: 1, comment: '활성여부' })
  is_active: number;

  @Column({ type: 'varchar', length: 10, default: 'PUBLIC', comment: '공개범위: PUBLIC(전체) | PRIVATE(Master만)' })
  visibility: string;

  @Column({ type: 'smallint', default: 0, comment: 'S/N 관리 여부' })
  use_serial: number;

  @Column({ type: 'jsonb', nullable: true, comment: 'S/N 태그 키 정의 (예: ["CPU","RAM","Storage"])' })
  specs: string[] | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
