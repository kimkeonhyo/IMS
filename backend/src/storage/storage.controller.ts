import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { StorageService, CreateStorageDto, UpdateStorageDto } from './storage.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { Permission } from '../common/enums/permission.enum';
import { Employee } from '../employees/employee.entity';

@ApiTags('storage')
@ApiBearerAuth('access-token')
@Controller('storage')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
export class StorageController {
  constructor(private readonly service: StorageService) {}

  @ApiOperation({ summary: '창고 목록 조회' })
  @Get()
  findAll() { return this.service.findAll(); }

  @ApiOperation({ summary: '창고 단건 조회' })
  @Get(':storage_code')
  findOne(@Param('storage_code') code: string) { return this.service.findOne(code); }

  @ApiOperation({ summary: '창고 등록' })
  @Post()
  @RequirePermission(Permission.STORAGE_CREATE)
  create(@Body() dto: CreateStorageDto, @CurrentUser() user: Employee) {
    return this.service.create(dto, user);
  }

  @ApiOperation({ summary: '창고 수정' })
  @Patch(':storage_code')
  @RequirePermission(Permission.STORAGE_UPDATE)
  update(@Param('storage_code') code: string, @Body() dto: UpdateStorageDto, @CurrentUser() user: Employee) {
    return this.service.update(code, dto, user);
  }

  @ApiOperation({ summary: '창고 활성/비활성 토글' })
  @Patch(':storage_code/toggle-active')
  @RequirePermission(Permission.STORAGE_UPDATE)
  toggleActive(@Param('storage_code') code: string, @CurrentUser() user: Employee) {
    return this.service.toggleActive(code, user);
  }
}
