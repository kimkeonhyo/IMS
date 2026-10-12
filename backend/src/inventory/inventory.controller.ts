import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Employee } from '../employees/employee.entity';

@ApiTags('inventory')
@ApiBearerAuth('access-token')
@Controller('inventory')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class InventoryController {
  constructor(private readonly service: InventoryService) {}

  @ApiOperation({ summary: '재고현황 조회 (전체 로그인 사용자 접근 가능)' })
  @Get()
  findAll(@CurrentUser() user: Employee) {
    return this.service.findAll(user);
  }

  @ApiOperation({ summary: '재고현황 단건 조회' })
  @Get(':storage_code/:item_code')
  findOne(
    @Param('storage_code') storage_code: string,
    @Param('item_code') item_code: string,
  ) {
    return this.service.findOne(storage_code, item_code);
  }
}
