import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolePermission } from './role-permission.entity';
import { RolePermissionsController } from './role-permissions.controller';
import { RolePermissionsService } from './role-permissions.service';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

/** PermissionGuard가 모든 모듈에서 주입받으므로 전역으로 둔다 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([RolePermission]), AuditLogsModule],
  controllers: [RolePermissionsController],
  providers: [RolePermissionsService],
  exports: [RolePermissionsService],
})
export class RolePermissionsModule {}
