import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  DcInventoryService,
  CreateDcRackDto, UpdateDcRackDto,
  CreateDcDeviceDto, UpdateDcDeviceDto,
  CreateDcIpAddressDto, UpdateDcIpAddressDto,
  CreateDcConnectionDto, UpdateDcConnectionDto,
} from './dc-inventory.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Employee } from '../employees/employee.entity';

@ApiTags('dc-inventory')
@ApiBearerAuth('access-token')
@Controller('dc')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
export class DcInventoryController {
  constructor(private readonly service: DcInventoryService) {}

  // ─────────────────────────── Racks ───────────────────────────

  @ApiOperation({ summary: 'DC 랙 목록' })
  @Get('racks')
  findAllRacks() {
    return this.service.findAllRacks();
  }

  @ApiOperation({ summary: 'DC 랙 상세 (탑재 장비 포함)' })
  @Get('racks/:id')
  findOneRack(@Param('id') id: string) {
    return this.service.findOneRack(id);
  }

  @ApiOperation({ summary: 'DC 랙 등록' })
  @Post('racks')
  createRack(@Body() dto: CreateDcRackDto, @CurrentUser() user: Employee) {
    return this.service.createRack(dto, user);
  }

  @ApiOperation({ summary: 'DC 랙 수정' })
  @Patch('racks/:id')
  updateRack(@Param('id') id: string, @Body() dto: UpdateDcRackDto, @CurrentUser() user: Employee) {
    return this.service.updateRack(id, dto, user);
  }

  @ApiOperation({ summary: 'DC 랙 삭제' })
  @Delete('racks/:id')
  removeRack(@Param('id') id: string, @CurrentUser() user: Employee) {
    return this.service.removeRack(id, user);
  }

  // ─────────────────────────── Devices ───────────────────────────

  @ApiOperation({ summary: 'DC 장비 목록' })
  @Get('devices')
  findAllDevices(@Query('rack_id') rackId?: string) {
    const rid = rackId !== undefined && rackId !== '' ? rackId : undefined;
    return this.service.findAllDevices(rid);
  }

  @ApiOperation({ summary: 'DC 장비 상세 (연결·IP 포함)' })
  @Get('devices/:id')
  findOneDevice(@Param('id') id: string) {
    return this.service.findOneDevice(id);
  }

  @ApiOperation({ summary: 'DC 장비 등록' })
  @Post('devices')
  createDevice(@Body() dto: CreateDcDeviceDto, @CurrentUser() user: Employee) {
    return this.service.createDevice(dto, user);
  }

  @ApiOperation({ summary: 'DC 장비 수정' })
  @Patch('devices/:id')
  updateDevice(@Param('id') id: string, @Body() dto: UpdateDcDeviceDto, @CurrentUser() user: Employee) {
    return this.service.updateDevice(id, dto, user);
  }

  @ApiOperation({ summary: 'DC 장비 삭제' })
  @Delete('devices/:id')
  removeDevice(@Param('id') id: string, @CurrentUser() user: Employee) {
    return this.service.removeDevice(id, user);
  }

  // ─────────────────────────── IPs ───────────────────────────

  @ApiOperation({ summary: 'DC IP 목록' })
  @Get('ips')
  findAllIps(@Query('device_id') deviceId?: string) {
    const did = deviceId !== undefined && deviceId !== '' ? deviceId : undefined;
    return this.service.findAllIps(did);
  }

  @ApiOperation({ summary: 'DC IP 등록' })
  @Post('ips')
  createIp(@Body() dto: CreateDcIpAddressDto, @CurrentUser() user: Employee) {
    return this.service.createIp(dto, user);
  }

  @ApiOperation({ summary: 'DC IP 수정' })
  @Patch('ips/:id')
  updateIp(@Param('id') id: string, @Body() dto: UpdateDcIpAddressDto, @CurrentUser() user: Employee) {
    return this.service.updateIp(id, dto, user);
  }

  @ApiOperation({ summary: 'DC IP 삭제' })
  @Delete('ips/:id')
  removeIp(@Param('id') id: string, @CurrentUser() user: Employee) {
    return this.service.removeIp(id, user);
  }

  // ─────────────────────────── Connections ───────────────────────────

  @ApiOperation({ summary: 'DC 연결 목록' })
  @Get('connections')
  findAllConnections(@Query('device_id') deviceId?: string) {
    const did = deviceId !== undefined && deviceId !== '' ? deviceId : undefined;
    return this.service.findAllConnections(did);
  }

  @ApiOperation({ summary: 'DC 연결 등록' })
  @Post('connections')
  createConnection(@Body() dto: CreateDcConnectionDto, @CurrentUser() user: Employee) {
    return this.service.createConnection(dto, user);
  }

  @ApiOperation({ summary: 'DC 연결 수정' })
  @Patch('connections/:id')
  updateConnection(@Param('id') id: string, @Body() dto: UpdateDcConnectionDto, @CurrentUser() user: Employee) {
    return this.service.updateConnection(id, dto, user);
  }

  @ApiOperation({ summary: 'DC 연결 삭제' })
  @Delete('connections/:id')
  removeConnection(@Param('id') id: string, @CurrentUser() user: Employee) {
    return this.service.removeConnection(id, user);
  }
}
