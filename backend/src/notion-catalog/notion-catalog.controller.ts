import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { NotionCatalogService } from './notion-catalog.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionGuard } from '../common/guards/permission.guard';

@ApiTags('notion')
@ApiBearerAuth('access-token')
@Controller('notion')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
export class NotionCatalogController {
  constructor(private readonly service: NotionCatalogService) {}

  @Get('bundles')
  @ApiOperation({ summary: 'Notion 번들 카탈로그 조회' })
  getBundles() {
    return this.service.getBundles();
  }

  @Get('images')
  @ApiOperation({ summary: 'Notion 컴포넌트 이미지 버전 카탈로그 조회' })
  getImages() {
    return this.service.getImages();
  }
}
