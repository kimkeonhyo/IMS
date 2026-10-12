import {
  Controller, Get, Post, Delete, Param, Query, Body, Res,
  UseGuards, UseInterceptors, UploadedFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AssetImagesService } from './asset-images.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Employee } from '../employees/employee.entity';

@ApiTags('asset-images')
@ApiBearerAuth('access-token')
@Controller('asset-images')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssetImagesController {
  constructor(private readonly service: AssetImagesService) {}

  @ApiOperation({ summary: '장비 사진 업로드' })
  @ApiConsumes('multipart/form-data')
  @Post()
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
  }))
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { serial_number_id: string; event_type: string; event_no?: string; note?: string },
    @CurrentUser() user: Employee,
  ) {
    return this.service.upload(file, {
      serial_number_id: Number(body.serial_number_id),
      event_type: body.event_type,
      event_no: body.event_no,
      note: body.note,
    }, user);
  }

  @ApiOperation({ summary: 'S/N 사진 이력' })
  @Get('serial/:serialNumberId')
  bySerial(@Param('serialNumberId') id: string) {
    return this.service.findBySerial(Number(id));
  }

  @ApiOperation({ summary: '이벤트 문서에 등록된 사진' })
  @Get('event/:eventType/:eventNo')
  byEvent(@Param('eventType') eventType: string, @Param('eventNo') eventNo: string) {
    return this.service.findByEvent(eventType, eventNo);
  }

  @ApiOperation({ summary: '여러 S/N의 최신 사진 1장씩 (ids=1,2,3)' })
  @Get('latest')
  latest(@Query('ids') ids?: string) {
    const list = (ids ?? '').split(',').map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0);
    return this.service.latestBySerials(list);
  }

  @ApiOperation({ summary: '이미지 바이너리 (비공개 버킷 프록시)' })
  @Get(':id/raw')
  async raw(
    @Param('id') id: string,
    @Query('thumb') thumb: string | undefined,
    @Res() res: Response,
  ) {
    const { buffer, contentType } = await this.service.getBinary(id, thumb === '1');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.end(buffer);
  }

  @ApiOperation({ summary: '사진 삭제' })
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: Employee) {
    return this.service.remove(id, user);
  }
}
