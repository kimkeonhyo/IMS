import { Controller, Get, Post, Patch, Param, Body, UseGuards, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ItemsService } from './items.service';
import { CreateItemDto } from './dto/create-item.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { Permission } from '../common/enums/permission.enum';
import { Employee } from '../employees/employee.entity';

@ApiTags('items')
@ApiBearerAuth('access-token')
@Controller('items')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
export class ItemsController {
  constructor(private readonly service: ItemsService) {}

  @ApiOperation({ summary: '품목 목록 조회' })
  @Get()
  findAll(@CurrentUser() user: Employee) { return this.service.findAll(user); }

  @ApiOperation({ summary: '품목 단건 조회' })
  @Get(':item_code')
  findOne(@Param('item_code') item_code: string) { return this.service.findOne(item_code); }

  @ApiOperation({ summary: '품목 등록' })
  @Post()
  @RequirePermission(Permission.ITEM_CREATE)
  create(@Body() dto: CreateItemDto, @CurrentUser() user: Employee) {
    return this.service.create(dto, user);
  }

  @ApiOperation({ summary: '품목 수정' })
  @Patch(':item_code')
  @RequirePermission(Permission.ITEM_UPDATE)
  update(@Param('item_code') item_code: string, @Body() dto: Partial<CreateItemDto>, @CurrentUser() user: Employee) {
    return this.service.update(item_code, dto, user);
  }

  @ApiOperation({ summary: '품목 활성/비활성 토글' })
  @Patch(':item_code/toggle-active')
  @RequirePermission(Permission.ITEM_UPDATE)
  toggleActive(@Param('item_code') item_code: string, @CurrentUser() user: Employee) {
    return this.service.toggleActive(item_code, user);
  }

  @ApiOperation({ summary: 'CSV/Excel 품목 일괄 등록' })
  @Post('import')
  @RequirePermission(Permission.ITEM_CREATE)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  importFile(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: Employee,
  ) {
    if (!file) throw new BadRequestException('파일이 없습니다');
    return this.service.importFromFile(file.buffer, file.mimetype, user);
  }
}
