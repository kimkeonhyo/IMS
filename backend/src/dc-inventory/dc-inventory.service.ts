import {
  Injectable, NotFoundException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  IsString, IsNotEmpty, IsOptional, IsInt, Min, IsUUID,
} from 'class-validator';
import { DcRack } from './dc-rack.entity';
import { DcDevice } from './dc-device.entity';
import { DcIpAddress } from './dc-ip-address.entity';
import { DcConnection } from './dc-connection.entity';
import { Employee } from '../employees/employee.entity';

const WRITE_ROLES = ['MASTER', 'ADMIN'];

// ─────────────────────────── DTOs ───────────────────────────

export class CreateDcRackDto {
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsString() site_storage_code?: string;
  @IsOptional() @IsInt() @Min(1) u_height?: number;
  @IsOptional() @IsString() note?: string;
}

export class UpdateDcRackDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() site_storage_code?: string;
  @IsOptional() @IsInt() @Min(1) u_height?: number;
  @IsOptional() @IsString() note?: string;
}

export class CreateDcDeviceDto {
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsNotEmpty() role: string;
  @IsOptional() @IsUUID() rack_id?: string;
  @IsOptional() @IsInt() @Min(0) position_u?: number;
  @IsOptional() @IsInt() @Min(1) u_size?: number;
  @IsOptional() @IsString() mgmt_ip?: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsString() serial_no?: string;
  @IsOptional() @IsString() note?: string;
}

export class UpdateDcDeviceDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() role?: string;
  @IsOptional() @IsUUID() rack_id?: string | null;
  @IsOptional() @IsInt() @Min(0) position_u?: number | null;
  @IsOptional() @IsInt() @Min(1) u_size?: number;
  @IsOptional() @IsString() mgmt_ip?: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsString() serial_no?: string;
  @IsOptional() @IsString() note?: string;
}

export class CreateDcIpAddressDto {
  @IsString() @IsNotEmpty() address: string;
  @IsOptional() @IsString() prefix?: string;
  @IsOptional() @IsString() role?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsUUID() device_id?: string;
  @IsOptional() @IsString() description?: string;
}

export class UpdateDcIpAddressDto {
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() prefix?: string;
  @IsOptional() @IsString() role?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsUUID() device_id?: string | null;
  @IsOptional() @IsString() description?: string;
}

export class CreateDcConnectionDto {
  @IsUUID() a_device_id: string;
  @IsOptional() @IsString() a_port?: string;
  @IsUUID() b_device_id: string;
  @IsOptional() @IsString() b_port?: string;
  @IsOptional() @IsString() cable_type?: string;
  @IsOptional() @IsString() note?: string;
}

export class UpdateDcConnectionDto {
  @IsOptional() @IsUUID() a_device_id?: string;
  @IsOptional() @IsString() a_port?: string;
  @IsOptional() @IsUUID() b_device_id?: string;
  @IsOptional() @IsString() b_port?: string;
  @IsOptional() @IsString() cable_type?: string;
  @IsOptional() @IsString() note?: string;
}

// ─────────────────────────── Enriched shapes ───────────────────────────

export type EnrichedDcDevice = DcDevice & {
  rack_name: string | null;
};

export type EnrichedDcIpAddress = DcIpAddress & { device_name: string | null };

export type EnrichedDcConnection = DcConnection & {
  a_device_name: string | null;
  b_device_name: string | null;
};

@Injectable()
export class DcInventoryService {
  constructor(
    @InjectRepository(DcRack) private readonly rackRepo: Repository<DcRack>,
    @InjectRepository(DcDevice) private readonly deviceRepo: Repository<DcDevice>,
    @InjectRepository(DcIpAddress) private readonly ipRepo: Repository<DcIpAddress>,
    @InjectRepository(DcConnection) private readonly connRepo: Repository<DcConnection>,
    private readonly dataSource: DataSource,
  ) {}

  private assertWrite(user: Employee) {
    if (!WRITE_ROLES.includes(user.man_roll)) {
      throw new ForbiddenException('ERR_AUTH_006: 관리자만 수행할 수 있습니다');
    }
  }

  // ─────────────────────────── Racks ───────────────────────────

  findAllRacks(): Promise<DcRack[]> {
    return this.rackRepo.find({ order: { created_at: 'DESC' } });
  }

  private async getRackOrThrow(id: string): Promise<DcRack> {
    const rack = await this.rackRepo.findOne({ where: { id } });
    if (!rack) throw new NotFoundException('ERR_RES_001');
    return rack;
  }

  async findOneRack(id: string): Promise<DcRack & { devices: DcDevice[] }> {
    const rack = await this.getRackOrThrow(id);
    const devices = await this.deviceRepo.find({
      where: { rack_id: id },
      order: { position_u: 'ASC' },
    });
    return Object.assign(rack, { devices });
  }

  async createRack(dto: CreateDcRackDto, user: Employee): Promise<DcRack> {
    this.assertWrite(user);
    const rack = this.rackRepo.create({
      name: dto.name,
      site_storage_code: dto.site_storage_code ?? null,
      u_height: dto.u_height ?? 42,
      note: dto.note ?? null,
    });
    return this.rackRepo.save(rack);
  }

  async updateRack(id: string, dto: UpdateDcRackDto, user: Employee): Promise<DcRack> {
    this.assertWrite(user);
    const rack = await this.getRackOrThrow(id);
    if (dto.name !== undefined) rack.name = dto.name;
    if (dto.site_storage_code !== undefined) rack.site_storage_code = dto.site_storage_code;
    if (dto.u_height !== undefined) rack.u_height = dto.u_height;
    if (dto.note !== undefined) rack.note = dto.note;
    return this.rackRepo.save(rack);
  }

  async removeRack(id: string, user: Employee): Promise<{ id: string }> {
    this.assertWrite(user);
    const rack = await this.getRackOrThrow(id);
    await this.rackRepo.delete({ id: rack.id });
    return { id };
  }

  // ─────────────────────────── Devices ───────────────────────────

  /** map of dc_device id -> name (for peer resolution) */
  private async deviceNameMap(ids: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const unique = [...new Set(ids.filter((v) => !!v))];
    if (!unique.length) return map;
    const rows = await this.deviceRepo
      .createQueryBuilder('d')
      .select(['d.id AS id', 'd.name AS name'])
      .where('d.id IN (:...ids)', { ids: unique })
      .getRawMany<{ id: string; name: string }>();
    for (const r of rows) map.set(r.id, r.name);
    return map;
  }

  private async enrichDevices(devices: DcDevice[]): Promise<EnrichedDcDevice[]> {
    if (!devices.length) return [];

    const rackIds = [...new Set(devices.map((d) => d.rack_id).filter((v): v is string => !!v))];
    const rackMap = new Map<string, string>();
    if (rackIds.length) {
      const racks = await this.rackRepo
        .createQueryBuilder('r')
        .select(['r.id AS id', 'r.name AS name'])
        .where('r.id IN (:...ids)', { ids: rackIds })
        .getRawMany<{ id: string; name: string }>();
      for (const r of racks) rackMap.set(r.id, r.name);
    }

    return devices.map((d) => Object.assign({}, d, {
      rack_name: d.rack_id ? rackMap.get(d.rack_id) ?? null : null,
    }));
  }

  async findAllDevices(rackId?: string): Promise<EnrichedDcDevice[]> {
    const where = rackId ? { rack_id: rackId } : {};
    const devices = await this.deviceRepo.find({
      where,
      order: { created_at: 'DESC' },
    });
    return this.enrichDevices(devices);
  }

  private async getDeviceOrThrow(id: string): Promise<DcDevice> {
    const device = await this.deviceRepo.findOne({ where: { id } });
    if (!device) throw new NotFoundException('ERR_RES_001');
    return device;
  }

  async findOneDevice(id: string): Promise<
    EnrichedDcDevice & { connections: EnrichedDcConnection[]; ips: DcIpAddress[] }
  > {
    const device = await this.getDeviceOrThrow(id);
    const [enriched] = await this.enrichDevices([device]);

    const connRows = await this.connRepo.find({
      where: [{ a_device_id: id }, { b_device_id: id }],
      order: { created_at: 'DESC' },
    });
    const connections = await this.enrichConnections(connRows);

    const ips = await this.ipRepo.find({
      where: { device_id: id },
      order: { created_at: 'DESC' },
    });

    return Object.assign(enriched, { connections, ips });
  }

  async createDevice(dto: CreateDcDeviceDto, user: Employee): Promise<EnrichedDcDevice> {
    this.assertWrite(user);
    const device = this.deviceRepo.create({
      name: dto.name,
      role: dto.role,
      rack_id: dto.rack_id ?? null,
      position_u: dto.position_u ?? null,
      u_size: dto.u_size ?? 1,
      mgmt_ip: dto.mgmt_ip ?? null,
      model: dto.model ?? null,
      serial_no: dto.serial_no ?? null,
      note: dto.note ?? null,
    });
    const saved = await this.deviceRepo.save(device);
    const [enriched] = await this.enrichDevices([saved]);
    return enriched;
  }

  async updateDevice(id: string, dto: UpdateDcDeviceDto, user: Employee): Promise<EnrichedDcDevice> {
    this.assertWrite(user);
    const device = await this.getDeviceOrThrow(id);
    if (dto.name !== undefined) device.name = dto.name;
    if (dto.role !== undefined) device.role = dto.role;
    if (dto.rack_id !== undefined) device.rack_id = dto.rack_id;
    if (dto.position_u !== undefined) device.position_u = dto.position_u;
    if (dto.u_size !== undefined) device.u_size = dto.u_size;
    if (dto.mgmt_ip !== undefined) device.mgmt_ip = dto.mgmt_ip;
    if (dto.model !== undefined) device.model = dto.model;
    if (dto.serial_no !== undefined) device.serial_no = dto.serial_no;
    if (dto.note !== undefined) device.note = dto.note;
    const saved = await this.deviceRepo.save(device);
    const [enriched] = await this.enrichDevices([saved]);
    return enriched;
  }

  async removeDevice(id: string, user: Employee): Promise<{ id: string }> {
    this.assertWrite(user);
    const device = await this.getDeviceOrThrow(id);
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(DcConnection, [{ a_device_id: device.id }, { b_device_id: device.id }]);
      await manager.update(DcIpAddress, { device_id: device.id }, { device_id: null });
      await manager.delete(DcDevice, { id: device.id });
    });
    return { id };
  }

  // ─────────────────────────── IPs ───────────────────────────

  private async enrichIps(ips: DcIpAddress[]): Promise<EnrichedDcIpAddress[]> {
    if (!ips.length) return [];
    const nameMap = await this.deviceNameMap(
      ips.map((i) => i.device_id).filter((v): v is string => !!v),
    );
    return ips.map((i) => Object.assign({}, i, {
      device_name: i.device_id ? nameMap.get(i.device_id) ?? null : null,
    }));
  }

  async findAllIps(deviceId?: string): Promise<EnrichedDcIpAddress[]> {
    const where = deviceId ? { device_id: deviceId } : {};
    const ips = await this.ipRepo.find({ where, order: { created_at: 'DESC' } });
    return this.enrichIps(ips);
  }

  private async getIpOrThrow(id: string): Promise<DcIpAddress> {
    const ip = await this.ipRepo.findOne({ where: { id } });
    if (!ip) throw new NotFoundException('ERR_RES_001');
    return ip;
  }

  async createIp(dto: CreateDcIpAddressDto, user: Employee): Promise<EnrichedDcIpAddress> {
    this.assertWrite(user);
    const ip = this.ipRepo.create({
      address: dto.address,
      prefix: dto.prefix ?? null,
      role: dto.role ?? null,
      status: dto.status ?? 'USED',
      device_id: dto.device_id ?? null,
      description: dto.description ?? null,
    });
    const saved = await this.ipRepo.save(ip);
    const [enriched] = await this.enrichIps([saved]);
    return enriched;
  }

  async updateIp(id: string, dto: UpdateDcIpAddressDto, user: Employee): Promise<EnrichedDcIpAddress> {
    this.assertWrite(user);
    const ip = await this.getIpOrThrow(id);
    if (dto.address !== undefined) ip.address = dto.address;
    if (dto.prefix !== undefined) ip.prefix = dto.prefix;
    if (dto.role !== undefined) ip.role = dto.role;
    if (dto.status !== undefined) ip.status = dto.status;
    if (dto.device_id !== undefined) ip.device_id = dto.device_id;
    if (dto.description !== undefined) ip.description = dto.description;
    const saved = await this.ipRepo.save(ip);
    const [enriched] = await this.enrichIps([saved]);
    return enriched;
  }

  async removeIp(id: string, user: Employee): Promise<{ id: string }> {
    this.assertWrite(user);
    const ip = await this.getIpOrThrow(id);
    await this.ipRepo.delete({ id: ip.id });
    return { id };
  }

  // ─────────────────────────── Connections ───────────────────────────

  private async enrichConnections(conns: DcConnection[]): Promise<EnrichedDcConnection[]> {
    if (!conns.length) return [];
    const nameMap = await this.deviceNameMap([
      ...conns.map((c) => c.a_device_id),
      ...conns.map((c) => c.b_device_id),
    ]);
    return conns.map((c) => Object.assign({}, c, {
      a_device_name: c.a_device_id ? nameMap.get(c.a_device_id) ?? null : null,
      b_device_name: c.b_device_id ? nameMap.get(c.b_device_id) ?? null : null,
    }));
  }

  async findAllConnections(deviceId?: string): Promise<EnrichedDcConnection[]> {
    const where = deviceId
      ? [{ a_device_id: deviceId }, { b_device_id: deviceId }]
      : {};
    const conns = await this.connRepo.find({ where, order: { created_at: 'DESC' } });
    return this.enrichConnections(conns);
  }

  private async getConnOrThrow(id: string): Promise<DcConnection> {
    const conn = await this.connRepo.findOne({ where: { id } });
    if (!conn) throw new NotFoundException('ERR_RES_001');
    return conn;
  }

  async createConnection(dto: CreateDcConnectionDto, user: Employee): Promise<EnrichedDcConnection> {
    this.assertWrite(user);
    const conn = this.connRepo.create({
      a_device_id: dto.a_device_id,
      a_port: dto.a_port ?? null,
      b_device_id: dto.b_device_id,
      b_port: dto.b_port ?? null,
      cable_type: dto.cable_type ?? null,
      note: dto.note ?? null,
    });
    const saved = await this.connRepo.save(conn);
    const [enriched] = await this.enrichConnections([saved]);
    return enriched;
  }

  async updateConnection(
    id: string, dto: UpdateDcConnectionDto, user: Employee,
  ): Promise<EnrichedDcConnection> {
    this.assertWrite(user);
    const conn = await this.getConnOrThrow(id);
    if (dto.a_device_id !== undefined) conn.a_device_id = dto.a_device_id;
    if (dto.a_port !== undefined) conn.a_port = dto.a_port;
    if (dto.b_device_id !== undefined) conn.b_device_id = dto.b_device_id;
    if (dto.b_port !== undefined) conn.b_port = dto.b_port;
    if (dto.cable_type !== undefined) conn.cable_type = dto.cable_type;
    if (dto.note !== undefined) conn.note = dto.note;
    const saved = await this.connRepo.save(conn);
    const [enriched] = await this.enrichConnections([saved]);
    return enriched;
  }

  async removeConnection(id: string, user: Employee): Promise<{ id: string }> {
    this.assertWrite(user);
    const conn = await this.getConnOrThrow(id);
    await this.connRepo.delete({ id: conn.id });
    return { id };
  }
}
