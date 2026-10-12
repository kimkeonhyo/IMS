import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RepairsService } from './repairs.service';
import type { CreateRepairDto, RegisterRepairDto, CompleteRepairDto } from './repairs.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { Permission } from '../common/enums/permission.enum';
import { Employee } from '../employees/employee.entity';

@ApiTags('repairs')
@ApiBearerAuth('access-token')
@Controller('repairs')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
export class RepairsController {
  constructor(private readonly service: RepairsService) {}

  @ApiOperation({ summary: '고장/수리 목록' })
  @Get()
  findAll() { return this.service.findAll(); }

  @ApiOperation({ summary: '고장/수리 단건 조회' })
  @Get(':repair_no')
  findOne(@Param('repair_no') repair_no: string) { return this.service.findOne(repair_no); }

  @ApiOperation({ summary: '고장 신고' })
  @Post()
  @RequirePermission(Permission.REPAIR_CREATE)
  create(@Body() dto: CreateRepairDto, @CurrentUser() user: Employee) {
    return this.service.create(dto, user);
  }

  @ApiOperation({ summary: '수리 등록 (업체 접수)' })
  @Patch(':repair_no/register')
  @RequirePermission(Permission.REPAIR_UPDATE)
  register(@Param('repair_no') repair_no: string, @Body() dto: RegisterRepairDto, @CurrentUser() user: Employee) {
    return this.service.register(repair_no, dto, user);
  }

  @ApiOperation({ summary: '수리 완료' })
  @Patch(':repair_no/complete')
  @RequirePermission(Permission.REPAIR_UPDATE)
  complete(@Param('repair_no') repair_no: string, @Body() dto: CompleteRepairDto, @CurrentUser() user: Employee) {
    return this.service.complete(repair_no, dto, user);
  }

  @ApiOperation({ summary: '고장 신고 취소' })
  @Patch(':repair_no/cancel')
  @RequirePermission(Permission.REPAIR_CANCEL)
  cancel(@Param('repair_no') repair_no: string, @Body() body: { reason?: string }, @CurrentUser() user: Employee) {
    return this.service.cancel(repair_no, body?.reason, user);
  }
}
