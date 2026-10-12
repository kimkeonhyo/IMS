import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PurchaseOrdersService, CreatePurchaseOrderDto } from './purchase-orders.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { Employee } from '../employees/employee.entity';

@ApiTags('purchase-orders')
@ApiBearerAuth('access-token')
@Controller('purchase-orders')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
export class PurchaseOrdersController {
  constructor(private readonly service: PurchaseOrdersService) {}

  @ApiOperation({ summary: '발주 목록' })
  @Get()
  findAll(@CurrentUser() user: Employee) { return this.service.findAll(user); }

  @ApiOperation({ summary: '발주 단건' })
  @Get(':id')
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @ApiOperation({ summary: '발주 등록' })
  @Post()
  @Roles(Role.MASTER)
  create(@Body() dto: CreatePurchaseOrderDto, @CurrentUser() user: Employee) {
    return this.service.create(dto, user);
  }

  @ApiOperation({ summary: '발주 확정' })
  @Patch(':id/confirm')
  @Roles(Role.MASTER)
  confirm(@Param('id') id: string, @CurrentUser() user: Employee) {
    return this.service.confirm(id, user);
  }

  @ApiOperation({ summary: '발주 취소' })
  @Patch(':id/cancel')
  @Roles(Role.MASTER)
  cancel(@Param('id') id: string, @CurrentUser() user: Employee) {
    return this.service.cancel(id, user);
  }
}
