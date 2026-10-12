import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PurchaseRequestsService } from './purchase-requests.service';
import { CreatePurchaseRequestDto } from './dto/create-purchase-request.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { Employee } from '../employees/employee.entity';

@ApiTags('purchase-requests')
@ApiBearerAuth('access-token')
@Controller('purchase-requests')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
export class PurchaseRequestsController {
  constructor(private readonly service: PurchaseRequestsService) {}

  @ApiOperation({ summary: '구매요청 목록' })
  @Get()
  findAll(@CurrentUser() user: Employee) { return this.service.findAll(user); }

  @ApiOperation({ summary: '구매요청 단건' })
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: Employee) {
    return this.service.findOne(id, user);
  }

  @ApiOperation({ summary: '구매요청 등록' })
  @Post()
  @Roles(Role.MASTER)
  create(@Body() dto: CreatePurchaseRequestDto, @CurrentUser() user: Employee) {
    return this.service.create(dto, user);
  }

  @ApiOperation({ summary: '구매요청 수정' })
  @Patch(':id')
  @Roles(Role.MASTER)
  update(@Param('id') id: string, @Body() dto: CreatePurchaseRequestDto, @CurrentUser() user: Employee) {
    return this.service.update(id, dto, user);
  }

  @ApiOperation({ summary: '구매요청 제출' })
  @Patch(':id/submit')
  submit(@Param('id') id: string, @CurrentUser() user: Employee) {
    return this.service.submit(id, user);
  }

  @ApiOperation({ summary: '구매요청 승인' })
  @Patch(':id/approve')
  @Roles(Role.MASTER)
  approve(@Param('id') id: string, @CurrentUser() user: Employee) {
    return this.service.approve(id, user);
  }

  @ApiOperation({ summary: '구매요청 반려' })
  @Patch(':id/reject')
  @Roles(Role.MASTER)
  reject(@Param('id') id: string, @Body('reason') reason: string, @CurrentUser() user: Employee) {
    return this.service.reject(id, reason, user);
  }

  @ApiOperation({ summary: '구매요청 취소' })
  @Patch(':id/cancel')
  @Roles(Role.MASTER)
  cancel(@Param('id') id: string, @Body('reason') reason: string, @CurrentUser() user: Employee) {
    return this.service.cancel(id, reason, user);
  }
}
