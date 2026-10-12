import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { AssetInstancesService, CreateAssetInstanceDto, UpdateAssetInstanceDto } from './asset-instances.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Employee } from '../employees/employee.entity';

@Controller('asset-instances')
@UseGuards(JwtAuthGuard)
export class AssetInstancesController {
  constructor(private readonly service: AssetInstancesService) {}

  @Get()
  findAll(@Query('item_code') item_code?: string) {
    return this.service.findAll(item_code);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateAssetInstanceDto, @CurrentUser() user: Employee) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAssetInstanceDto, @CurrentUser() user: Employee) {
    return this.service.update(id, dto, user);
  }
}
