import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockUsage } from './stock-usage.entity';
import { StockUsagesController } from './stock-usages.controller';
import { StockUsagesService } from './stock-usages.service';
import { InventoryModule } from '../inventory/inventory.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { Employee } from '../employees/employee.entity';

@Module({
  imports: [TypeOrmModule.forFeature([StockUsage, Employee]), InventoryModule, AuditLogsModule],
  controllers: [StockUsagesController],
  providers: [StockUsagesService],
})
export class StockUsagesModule {}
