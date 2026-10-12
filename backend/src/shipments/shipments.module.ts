import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Shipment } from './shipment.entity';
import { ShipmentItem } from './shipment-item.entity';
import { ShipmentService as ShipmentServiceEntity } from './shipment-service.entity';
import { ShipmentServiceImage } from './shipment-service-image.entity';
import { ShipmentsController } from './shipments.controller';
import { ShipmentsService } from './shipments.service';
import { InventoryModule } from '../inventory/inventory.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { Employee } from '../employees/employee.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Shipment, ShipmentItem, ShipmentServiceEntity, ShipmentServiceImage, Employee]), InventoryModule, AuditLogsModule],
  controllers: [ShipmentsController],
  providers: [ShipmentsService],
})
export class ShipmentsModule {}
