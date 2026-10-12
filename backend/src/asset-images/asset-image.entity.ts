import {
  Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index,
} from 'typeorm';

/** 사진을 남긴 업무 이벤트 — 담당자가 바뀌어도 언제/왜 찍힌 사진인지 알 수 있게 한다 */
export enum AssetImageEvent {
  STORE  = 'STORE',   // 입고 등록
  SHIP   = 'SHIP',    // 납품 완료
  USAGE  = 'USAGE',   // 재고사용 등록
  RETURN = 'RETURN',  // 회수 / 반납
  MOVE   = 'MOVE',    // 재고이동
  MANUAL = 'MANUAL',  // 재고상세 등에서 직접 등록
}

/** 장비 실물 사진 — S/N에 귀속시키고 이벤트로 태깅해 한 장비의 이력을 이어서 본다.
 *  실제 파일은 GCS(비공개 버킷)에 있고 여기엔 경로·메타만 저장한다. */
@Entity('asset_images')
@Index(['serial_number_id', 'created_at'])
@Index(['event_type', 'event_no'])
export class AssetImage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 대상 S/N (serial_numbers.id) */
  @Column({ type: 'int' })
  serial_number_id: number;

  /** 어떤 업무 이벤트에서 찍었는지 */
  @Column({ type: 'varchar', length: 20 })
  event_type: string;

  /** 해당 이벤트 문서번호 (입고 store_id / 납품 shipment_id / 사용 usage_no / 이동 movement_no) */
  @Column({ type: 'varchar', length: 30, nullable: true })
  event_no: string | null;

  /** GCS 객체 경로 (원본, 리사이즈된 webp) */
  @Column({ type: 'varchar', length: 300 })
  object_path: string;

  /** GCS 객체 경로 (썸네일) */
  @Column({ type: 'varchar', length: 300 })
  thumb_path: string;

  /** 업로드 당시 원본 파일명 (사용자 확인용) */
  @Column({ type: 'varchar', length: 255, nullable: true })
  original_name: string | null;

  /** 변환 후 저장 용량(byte) */
  @Column({ type: 'int', default: 0 })
  size: number;

  /** 촬영/등록자 사번 */
  @Column({ type: 'varchar', length: 20, nullable: true })
  uploaded_by: string | null;

  /** 등록자 이름 (직원 데이터가 바뀌어도 남도록 비정규화) */
  @Column({ type: 'varchar', length: 50, nullable: true })
  uploaded_by_name: string | null;

  /** 메모 (예: '전면 파손 확인') */
  @Column({ type: 'varchar', length: 200, nullable: true })
  note: string | null;

  @CreateDateColumn()
  created_at: Date;
}
