import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('shipment_services')
export class ShipmentService {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 30, unique: true, comment: '납품번호 (shipments.shipment_id, 1:1)' })
  shipment_id: string;

  @Column({ type: 'varchar', length: 20, comment: '서비스 VMS/NVR/ETC' })
  service: string;

  @Column({ type: 'varchar', nullable: true, comment: 'ETC일 때 서비스명' })
  service_custom_name: string | null;

  @Column({ type: 'varchar', length: 20, comment: '배포 방식 BUNDLE/MANUAL' })
  deploy_mode: string;

  /** 접속 방식 — REMOTE(원격: VPN IP/VIP) | CLOSED(폐쇄망: 현장 로컬 IP/VIP) */
  @Column({ type: 'varchar', length: 20, default: 'REMOTE', comment: '접속 방식 REMOTE/CLOSED' })
  access_mode: string;

  @Column({ type: 'varchar', nullable: true, comment: '번들 버전' })
  bundle_version: string | null;

  @Column({ type: 'varchar', nullable: true, comment: '납품 IP' })
  delivery_ip: string | null;

  @Column({ type: 'varchar', nullable: true, comment: '사용자명' })
  user_name: string | null;

  @Column({ type: 'varchar', nullable: true, comment: '비밀번호 (평문 - 제품 결정)' })
  password: string | null;

  @Column({ type: 'varchar', nullable: true, comment: 'VIP' })
  vip: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
