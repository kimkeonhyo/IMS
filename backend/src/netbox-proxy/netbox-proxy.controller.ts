import { Body, Controller, Get, HttpException, Param, Patch, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Response } from 'express';
import { NetboxProxyService } from './netbox-proxy.service';
import { MoveDeviceDto } from './dto/move-device.dto';
import { UpdateNetboxDeviceDto } from './dto/update-device.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

@ApiTags('netbox')
@ApiBearerAuth('access-token')
@Controller('netbox-proxy')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
export class NetboxProxyController {
  constructor(private readonly service: NetboxProxyService) {}

  @Get('status')
  @ApiOperation({ summary: 'NetBox 연동 설정 여부' })
  getStatus() {
    return this.service.getStatus();
  }

  @Get('racks')
  @ApiOperation({ summary: 'NetBox 랙 목록 조회 (읽기 전용 프록시, site slug 필터)' })
  getRacks(@Query('site') site?: string, @Query('region') region?: string) {
    return this.service.getRacks(site, region);
  }

  @Get('sites')
  @ApiOperation({ summary: 'NetBox Site 목록 (필터 드롭다운용)' })
  getSites() {
    return this.service.getSites();
  }

  @Get('device-ports')
  @ApiOperation({ summary: 'IP로 NetBox 장비 포트+연결상대 조회 (연결도 패널용)' })
  getDevicePorts(@Query('ip') ip: string) {
    return this.service.getDevicePorts(ip);
  }

  @Get('device-roles')
  @ApiOperation({ summary: 'NetBox 장비 역할·색상 (랙 배치도 범례용)' })
  getDeviceRoles() {
    return this.service.getDeviceRoles();
  }

  @Get('topology-filter')
  @ApiOperation({ summary: '토폴로지 뷰용 공유 저장 필터 목록' })
  getTopologyFilter() {
    return this.service.getTopologyFilters();
  }

  @Get('racks/:id/devices')
  @ApiOperation({ summary: 'NetBox 랙 장비 목록 조회 (배치 편집용)' })
  getRackDevices(@Param('id') id: string) {
    return this.service.getRackDevices(Number(id));
  }

  @Patch('devices/:id/position')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'NetBox 장비 U 위치/랙 이동 (MASTER/ADMIN 전용)' })
  async moveDevice(@Param('id') id: string, @Body() dto: MoveDeviceDto) {
    const result = await this.service.moveDevice(Number(id), dto);
    if (!result.ok) {
      throw new HttpException({ message: result.message }, result.status >= 400 ? result.status : 502);
    }
    return { ok: true };
  }

  @Get('owners')
  @ApiOperation({ summary: 'NetBox Owner(담당팀) 목록 (속성 편집 폼용)' })
  getOwners() {
    return this.service.getOwners();
  }

  @Get('device-types')
  @ApiOperation({ summary: 'NetBox 장비 타입 목록 (속성 편집 폼용)' })
  getDeviceTypes() {
    return this.service.getDeviceTypes();
  }

  @Get('devices/:id')
  @ApiOperation({ summary: 'NetBox 장비 속성 단건 조회 (속성 편집 폼 초기값)' })
  async getDevice(@Param('id') id: string) {
    const result = await this.service.getDevice(Number(id));
    if (!result.ok) throw new HttpException({ message: result.message }, 502);
    return result.device;
  }

  @Patch('devices/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'NetBox 장비 속성 수정 (MASTER/ADMIN 전용)' })
  async updateDevice(@Param('id') id: string, @Body() dto: UpdateNetboxDeviceDto) {
    const result = await this.service.updateDevice(Number(id), dto);
    if (!result.ok) {
      throw new HttpException({ message: result.message }, result.status >= 400 ? result.status : 502);
    }
    return { ok: true };
  }

  @Get('racks/:id/elevation')
  @ApiOperation({ summary: 'NetBox 랙 엘리베이션 SVG 프록시' })
  async getElevation(
    @Param('id') id: string,
    @Query('face') face: string | undefined,
    @Res() res: Response,
  ) {
    if (!this.service.configured) {
      res.status(503).json({ configured: false });
      return;
    }
    const safeFace: 'front' | 'rear' = face === 'rear' ? 'rear' : 'front';
    const result = await this.service.getElevationSvg(Number(id), safeFace);
    if (!result.ok) {
      res.status(502).json({ configured: true, message: result.message });
      return;
    }
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(result.svg);
  }
}
