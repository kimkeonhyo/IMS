import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockMovement } from './stock-movement.entity';
import { StockMovementsController } from './stock-movements.controller';
import { StockMovementsService } from './stock-movements.service';
import { InventoryModule } from '../inventory/inventory.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [TypeOrmModule.forFeature([StockMovement]), InventoryModule, AuditLogsModule],
  controllers: [StockMovementsController],
  providers: [StockMovementsService],
})
export class StockMovementsModule {}
