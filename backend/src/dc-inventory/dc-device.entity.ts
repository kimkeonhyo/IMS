import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('dc_devices')
export class DcDevice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  name: string;

  /** router | switch | server | pdu | patch | other */
  @Column({ length: 20 })
  role: string;

  @Column({ type: 'uuid', nullable: true })
  rack_id: string | null;

  /** bottom U slot */
  @Column({ type: 'int', nullable: true })
  position_u: number | null;

  @Column({ type: 'int', default: 1 })
  u_size: number;

  @Column({ type: 'varchar', length: 64, nullable: true })
  mgmt_ip: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  model: string | null;

  /** free-text link to a serial_numbers.serial_no */
  @Column({ type: 'varchar', length: 100, nullable: true })
  serial_no: string | null;

  /**
   * 옛 IMS 네트워크 관제(SNMP)가 쓰던 링크. 관제는 외부 모니터링 시스템로 이관돼
   * 더 이상 읽지 않는다. synchronize:true 라 컬럼을 지우면 DROP 되므로 남겨 둔다.
   */
  @Column({ type: 'uuid', nullable: true })
  network_device_id: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
