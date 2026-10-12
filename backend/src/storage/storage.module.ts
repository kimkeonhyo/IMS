import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Storage } from './storage.entity';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { Employee } from '../employees/employee.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Storage, Employee]), AuditLogsModule],
  controllers: [StorageController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
