import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DcRack } from './dc-rack.entity';
import { DcDevice } from './dc-device.entity';
import { DcIpAddress } from './dc-ip-address.entity';
import { DcConnection } from './dc-connection.entity';
import { Employee } from '../employees/employee.entity';
import { DcInventoryController } from './dc-inventory.controller';
import { DcInventoryService } from './dc-inventory.service';

@Module({
  imports: [TypeOrmModule.forFeature([DcRack, DcDevice, DcIpAddress, DcConnection, Employee])],
  controllers: [DcInventoryController],
  providers: [DcInventoryService],
})
export class DcInventoryModule {}
