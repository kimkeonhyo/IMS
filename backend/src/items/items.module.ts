import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Item } from './item.entity';
import { ItemsController } from './items.controller';
import { ItemsService } from './items.service';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { Employee } from '../employees/employee.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Item, Employee]), AuditLogsModule],
  controllers: [ItemsController],
  providers: [ItemsService],
  exports: [ItemsService],
})
export class ItemsModule {}
