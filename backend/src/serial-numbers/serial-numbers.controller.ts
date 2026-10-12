import { Controller, Get, Patch, Param, Query, Body, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Employee } from '../employees/employee.entity';
import { SerialNumbersService } from './serial-numbers.service';

@ApiTags('serial-numbers')
@ApiBearerAuth('access-token')
@Controller('serial-numbers')
@UseGuards(JwtAuthGuard)
export class SerialNumbersController {
  constructor(private readonly service: SerialNumbersService) {}

  /** GET /serial-numbers?item_code=X&storage_code=Y — STOCK 상태 S/N 목록 */
  @ApiOperation({ summary: 'STOCK 상태 S/N 목록 조회' })
  @Get()
  findAvailable(
    @Query('item_code') item_code: string,
    @Query('storage_code') storage_code?: string,
    @Query('include_in_use') includeInUse?: string,
  ) {
    return this.service.findAvailable(item_code, storage_code, includeInUse === 'true');
  }

  /** GET /serial-numbers/search?q=xxx — S/N 번호·태그 값 검색 (납품현황 필터용) */
  @ApiOperation({ summary: 'S/N 검색 (태그 포함)' })
  @Get('search')
  search(@Query('q') q: string) {
    if (!q || q.trim().length < 2) return [];
    return this.service.search(q.trim());
  }

  /** GET /serial-numbers/by-item/:item_code — 해당 품목 전체 S/N (재고현황용) */
  @ApiOperation({ summary: '품목별 S/N 전체 조회' })
  @Get('by-item/:item_code')
  findByItem(@Param('item_code') item_code: string, @CurrentUser() user: Employee) {
    return this.service.findByItem(item_code, user);
  }

  /** GET /serial-numbers/by-shipment-item/:id — 납품 품목별 S/N */
  @ApiOperation({ summary: '납품 품목별 S/N 조회' })
  @Get('by-shipment-item/:shipment_item_id')
  findByShipmentItem(@Param('shipment_item_id') shipment_item_id: string) {
    return this.service.findByShipmentItem(shipment_item_id);
  }

  /** GET /serial-numbers/by-store-item/:store_item_id — 입고 품목별 S/N */
  @ApiOperation({ summary: '입고 품목별 S/N 조회' })
  @Get('by-store-item/:store_item_id')
  findByStoreItem(@Param('store_item_id') store_item_id: string) {
    return this.service.findByStoreItem(store_item_id);
  }

  /** GET /serial-numbers/by-usage/:usage_no — 재고사용 건별 S/N */
  @ApiOperation({ summary: '재고사용 건별 S/N 조회' })
  @Get('by-usage/:usage_no')
  findByUsage(@Param('usage_no') usage_no: string) {
    return this.service.findByUsage(usage_no);
  }

  /** PATCH /serial-numbers/:id — S/N serial_no, asset_no, tags 수정 */
  @ApiOperation({ summary: 'S/N 수정' })
  @Patch(':id')
  updateOne(
    @Param('id') id: string,
    @Body() body: { serial_no?: string; asset_no?: string | null; tags?: Record<string, string> | null },
  ) {
    return this.service.updateOne(Number(id), body);
  }
}
