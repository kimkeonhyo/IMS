import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { StockMovementsService, CreateStockMovementDto } from './stock-movements.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { Permission } from '../common/enums/permission.enum';
import { Employee } from '../employees/employee.entity';

@ApiTags('stock-movements')
@ApiBearerAuth('access-token')
@Controller('stock-movements')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
export class StockMovementsController {
  constructor(private readonly service: StockMovementsService) {}

  @ApiOperation({ summary: '재고이동 목록' })
  @Get()
  findAll(@CurrentUser() user: Employee) { return this.service.findAll(user); }

  @ApiOperation({ summary: '재고이동 단건 조회' })
  @Get(':id')
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @ApiOperation({ summary: '재고이동 등록' })
  @Post()
  @RequirePermission(Permission.MOVEMENT_CREATE)
  create(@Body() dto: CreateStockMovementDto, @CurrentUser() user: Employee) {
    return this.service.create(dto, user);
  }

  @ApiOperation({ summary: '재고이동 승인' })
  @Patch(':id/approve')
  @RequirePermission(Permission.MOVEMENT_APPROVE)
  approve(@Param('id') id: string, @CurrentUser() user: Employee) {
    return this.service.approve(id, user);
  }

  @ApiOperation({ summary: '재고이동 실행' })
  @Patch(':id/move')
  @RequirePermission(Permission.MOVEMENT_APPROVE)
  move(@Param('id') id: string, @CurrentUser() user: Employee) {
    return this.service.move(id, user);
  }

  @ApiOperation({ summary: '재고이동 취소' })
  @Patch(':id/cancel')
  @RequirePermission(Permission.MOVEMENT_CANCEL)
  cancel(@Param('id') id: string, @CurrentUser() user: Employee) {
    return this.service.cancel(id, user);
  }

  @ApiOperation({ summary: '재고이동 반려' })
  @Patch(':id/reject')
  @RequirePermission(Permission.MOVEMENT_APPROVE)
  reject(@Param('id') id: string, @CurrentUser() user: Employee) {
    return this.service.reject(id, user);
  }
}
