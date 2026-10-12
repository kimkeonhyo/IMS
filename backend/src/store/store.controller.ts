import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { StoreService, CreateStoreDto } from './store.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { Permission } from '../common/enums/permission.enum';
import { Employee } from '../employees/employee.entity';

@ApiTags('store')
@ApiBearerAuth('access-token')
@Controller('store')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
export class StoreController {
  constructor(private readonly service: StoreService) {}

  @ApiOperation({ summary: '입고 목록 조회' })
  @Get()
  findAll(@CurrentUser() user: Employee) { return this.service.findAll(user); }

  @ApiOperation({ summary: '입고 단건 조회' })
  @Get(':id')
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @ApiOperation({ summary: '입고 처리' })
  @Post()
  @RequirePermission(Permission.STORE_RECEIVE)
  receive(@Body() dto: CreateStoreDto, @CurrentUser() user: Employee) {
    return this.service.receive(dto, user);
  }

  @ApiOperation({ summary: '입고 취소' })
  @Patch(':id/cancel')
  @RequirePermission(Permission.STORE_CANCEL)
  cancel(
    @Param('id') id: string,
    @Body('serial_number_ids') serialNumberIds: number[] | undefined,
    @CurrentUser() user: Employee,
  ) {
    return this.service.cancel(id, user, serialNumberIds);
  }
}
