import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Store } from './store.entity';
import { StockReceiptItem } from '../stock-receipt-items/stock-receipt-item.entity';
import { StoreController } from './store.controller';
import { StoreService } from './store.service';
import { InventoryModule } from '../inventory/inventory.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { Employee } from '../employees/employee.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Store, StockReceiptItem, Employee]), InventoryModule, AuditLogsModule],
  controllers: [StoreController],
  providers: [StoreService],
})
export class StoreModule {}
