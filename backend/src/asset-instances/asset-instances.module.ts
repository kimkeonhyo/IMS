import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssetInstance } from './asset-instance.entity';
import { AssetInstancesService } from './asset-instances.service';
import { AssetInstancesController } from './asset-instances.controller';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [TypeOrmModule.forFeature([AssetInstance]), AuditLogsModule],
  controllers: [AssetInstancesController],
  providers: [AssetInstancesService],
})
export class AssetInstancesModule {}
