import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('shipment_service_images')
export class ShipmentServiceImage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', comment: 'shipment_services.id' })
  service_id: string;

  @Column({ type: 'varchar', comment: '이미지명' })
  image_name: string;

  @Column({ type: 'varchar', comment: '버전' })
  version: string;
}
