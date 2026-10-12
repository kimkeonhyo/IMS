import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { StockUsagesService, CreateStockUsageDto, CreateBulkStockUsageDto, UpdateStockUsageDto, CancelStockUsageDto } from './stock-usages.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { Permission } from '../common/enums/permission.enum';
import { Employee } from '../employees/employee.entity';

@ApiTags('stock-usages')
@ApiBearerAuth('access-token')
@Controller('stock-usages')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
export class StockUsagesController {
  constructor(private readonly service: StockUsagesService) {}

  @ApiOperation({ summary: '재고사용 목록' })
  @Get()
  findAll(@CurrentUser() user: Employee) { return this.service.findAll(user); }

  @ApiOperation({ summary: '재고사용 단건 조회' })
  @Get(':id')
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @ApiOperation({ summary: '재고사용 등록' })
  @Post()
  @RequirePermission(Permission.USAGE_CREATE)
  create(@Body() dto: CreateStockUsageDto, @CurrentUser() user: Employee) {
    return this.service.create(dto, user);
  }

  @ApiOperation({ summary: '재고사용 일괄 등록' })
  @Post('bulk')
  @RequirePermission(Permission.USAGE_CREATE)
  createBulk(@Body() dto: CreateBulkStockUsageDto, @CurrentUser() user: Employee) {
    return this.service.createBulk(dto, user);
  }

  @ApiOperation({ summary: '재고사용 수정' })
  @Patch(':id')
  @RequirePermission(Permission.USAGE_UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdateStockUsageDto, @CurrentUser() user: Employee) {
    return this.service.update(id, dto, user);
  }

  @ApiOperation({ summary: '재고사용 취소' })
  @Patch(':id/cancel')
  @RequirePermission(Permission.USAGE_CANCEL)
  cancel(@Param('id') id: string, @Body() dto: CancelStockUsageDto, @CurrentUser() user: Employee) {
    return this.service.cancel(id, dto, user);
  }

  @ApiOperation({ summary: '재고사용 완료 (재고 차감)' })
  @Patch(':id/complete')
  @RequirePermission(Permission.USAGE_UPDATE)
  complete(@Param('id') id: string, @CurrentUser() user: Employee) {
    return this.service.complete(id, user);
  }

  @ApiOperation({ summary: '재고사용 반납' })
  @Patch(':id/return')
  @RequirePermission(Permission.USAGE_UPDATE)
  returnStock(
    @Param('id') id: string,
    @Body('return_storage_code') returnStorageCode: string,
    @Body('serial_number_ids') serialNumberIds: number[] | undefined,
    @CurrentUser() user: Employee,
  ) {
    return this.service.returnStock(id, user, returnStorageCode, serialNumberIds);
  }
}
