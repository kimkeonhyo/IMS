import { Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { NetboxSyncService } from './netbox-sync.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Employee } from '../employees/employee.entity';

@ApiTags('netbox')
@ApiBearerAuth('access-token')
@Controller('netbox-sync')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
export class NetboxSyncController {
  constructor(private readonly service: NetboxSyncService) {}

  @Post('run')
  @ApiOperation({
    summary: 'IMS ↔ NetBox 수동 동기화 (관리자 전용)',
    description:
      '시리얼 자산 → NetBox 디바이스 upsert 후 보강 동기화 수행: ' +
      '① 마스터데이터(창고→Region, 팀→Group/OwnerGroup/Owner, 직원→User) ' +
      '② dc-infra 장비 owner 규칙 지정(비어있는 경우만) ' +
      '③ 케이블 연결 기반 재고사용 자동 등록/반납',
  })
  run(@CurrentUser() user: Employee) {
    return this.service.runManual(user);
  }
}
