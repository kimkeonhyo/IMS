import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Repair } from './repair.entity';
import { RepairsController } from './repairs.controller';
import { RepairsService } from './repairs.service';
import { InventoryModule } from '../inventory/inventory.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [TypeOrmModule.forFeature([Repair]), InventoryModule, AuditLogsModule],
  controllers: [RepairsController],
  providers: [RepairsService],
})
export class RepairsModule {}
