import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ShipmentsService, CreateShipmentDto, ServiceInfoDto } from './shipments.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { Permission } from '../common/enums/permission.enum';
import { Employee } from '../employees/employee.entity';

@ApiTags('shipments')
@ApiBearerAuth('access-token')
@Controller('shipments')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
export class ShipmentsController {
  constructor(private readonly service: ShipmentsService) {}

  @Get()
  @ApiOperation({ summary: '납품 목록 조회' })
  findAll(@CurrentUser() user: Employee) { return this.service.findAll(user); }

  @Get(':shipment_id')
  @ApiOperation({ summary: '납품 단건 조회' })
  findOne(@Param('shipment_id') shipment_id: string) { return this.service.findOne(shipment_id); }

  @Post()
  @RequirePermission(Permission.SHIPMENT_CREATE)
  @ApiOperation({ summary: '납품 등록' })
  create(@Body() dto: CreateShipmentDto, @CurrentUser() user: Employee) {
    return this.service.create(dto, user);
  }

  @Patch(':shipment_id')
  @RequirePermission(Permission.SHIPMENT_UPDATE)
  @ApiOperation({ summary: '납품 수정' })
  update(@Param('shipment_id') shipment_id: string, @Body() dto: CreateShipmentDto, @CurrentUser() user: Employee) {
    return this.service.update(shipment_id, dto, user);
  }

  @Patch(':shipment_id/service-info')
  @RequirePermission(Permission.SHIPMENT_UPDATE)
  @ApiOperation({ summary: '서비스 납품 정보 수정 (상태 무관)' })
  updateServiceInfo(@Param('shipment_id') shipment_id: string, @Body() dto: ServiceInfoDto, @CurrentUser() user: Employee) {
    return this.service.updateServiceInfo(shipment_id, dto, user);
  }

  @Patch(':shipment_id/confirm')
  @RequirePermission(Permission.SHIPMENT_CONFIRM)
  @ApiOperation({ summary: '납품 완료 (DRAFT → CONFIRMED, 재고 차감)' })
  confirm(@Param('shipment_id') shipment_id: string, @CurrentUser() user: Employee) {
    return this.service.confirm(shipment_id, user);
  }

  @Patch(':shipment_id/cancel')
  @RequirePermission(Permission.SHIPMENT_CANCEL)
  @ApiOperation({ summary: '납품 취소 (취소 사유 필수)' })
  cancel(
    @Param('shipment_id') shipment_id: string,
    @Body('reason') reason: string,
    @CurrentUser() user: Employee,
  ) {
    return this.service.cancel(shipment_id, reason, user);
  }

  @Patch(':shipment_id/retrieve')
  @RequirePermission(Permission.SHIPMENT_RETRIEVE)
  @ApiOperation({ summary: '납품 회수 (CONFIRMED → RETRIEVED)' })
  retrieve(
    @Param('shipment_id') shipment_id: string,
    @Body('reason') reason: string,
    @Body('return_storage_code') returnStorageCode: string,
    @Body('serial_number_ids') serialNumberIds: number[] | undefined,
    @CurrentUser() user: Employee,
  ) {
    return this.service.retrieve(shipment_id, reason, user, returnStorageCode, serialNumberIds);
  }

  @Patch(':shipment_id/assignee')
  @ApiOperation({ summary: '납품 담당자 지정' })
  setAssignee(
    @Param('shipment_id') shipment_id: string,
    @Body('assignee_man_no') assignee_man_no: string | null,
  ) {
    return this.service.setAssignee(shipment_id, assignee_man_no ?? null);
  }
}
