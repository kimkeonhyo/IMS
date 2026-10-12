import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SerialNumber } from '../serial-numbers/serial-number.entity';
import { Team } from '../teams/team.entity';
import { Storage } from '../storage/storage.entity';
import { Employee } from '../employees/employee.entity';
import { StockUsage } from '../stock-usages/stock-usage.entity';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { NetboxSyncController } from './netbox-sync.controller';
import { NetboxSyncService } from './netbox-sync.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SerialNumber, Team, Storage, Employee, StockUsage]),
    AuditLogsModule,
  ],
  controllers: [NetboxSyncController],
  providers: [NetboxSyncService],
})
export class NetboxSyncModule {}
