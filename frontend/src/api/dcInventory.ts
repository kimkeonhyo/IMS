import client from './client';

// ─── Types (SHARED CONTRACT) ────────────────────────────────────────────────
export interface DcRack {
  id: string;
  name: string;
  site_storage_code: string | null;
  u_height: number;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface DcDevice {
  id: string;
  name: string;
  role: string;
  rack_id: string | null;
  position_u: number | null;
  u_size: number;
  mgmt_ip: string | null;
  model: string | null;
  serial_no: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  rack_name?: string | null;
}

export interface DcIpAddress {
  id: string;
  address: string;
  prefix: string | null;
  role: string | null;
  status: string;
  device_id: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
  device_name?: string | null;
}

export interface DcConnection {
  id: string;
  a_device_id: string;
  a_port: string | null;
  b_device_id: string;
  b_port: string | null;
  cable_type: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  a_device_name?: string | null;
  b_device_name?: string | null;
}

export type DcRackDetail = DcRack & { devices: DcDevice[] };
export type DcDeviceDetail = DcDevice & { connections: DcConnection[]; ips: DcIpAddress[] };

// ─── DTOs ────────────────────────────────────────────────────────────────────
export interface CreateDcRackDto {
  name: string;
  site_storage_code?: string | null;
  u_height: number;
  note?: string | null;
}
export type UpdateDcRackDto = Partial<CreateDcRackDto>;

export interface CreateDcDeviceDto {
  name: string;
  role: string;
  rack_id?: string | null;
  position_u?: number | null;
  u_size: number;
  mgmt_ip?: string | null;
  model?: string | null;
  serial_no?: string | null;
  note?: string | null;
}
export type UpdateDcDeviceDto = Partial<CreateDcDeviceDto>;

export interface CreateDcIpDto {
  address: string;
  prefix?: string | null;
  role?: string | null;
  status: string;
  device_id?: string | null;
  description?: string | null;
}
export type UpdateDcIpDto = Partial<CreateDcIpDto>;

export interface CreateDcConnectionDto {
  a_device_id: string;
  a_port?: string | null;
  b_device_id: string;
  b_port?: string | null;
  cable_type?: string | null;
  note?: string | null;
}
export type UpdateDcConnectionDto = Partial<CreateDcConnectionDto>;

// ─── API ───────────────────────────────────────────────────────────────────
export const dcInventoryApi = {
  // Racks
  findRacks: () => client.get<DcRack[]>('/dc/racks').then(r => r.data),
  findRack: (id: string) => client.get<DcRackDetail>(`/dc/racks/${id}`).then(r => r.data),
  createRack: (dto: CreateDcRackDto) => client.post<DcRack>('/dc/racks', dto).then(r => r.data),
  updateRack: (id: string, dto: UpdateDcRackDto) => client.patch<DcRack>(`/dc/racks/${id}`, dto).then(r => r.data),
  removeRack: (id: string) => client.delete(`/dc/racks/${id}`).then(r => r.data),

  // Devices
  findDevices: (rack_id?: string) =>
    client.get<DcDevice[]>('/dc/devices', { params: { rack_id } }).then(r => r.data),
  findDevice: (id: string) => client.get<DcDeviceDetail>(`/dc/devices/${id}`).then(r => r.data),
  createDevice: (dto: CreateDcDeviceDto) => client.post<DcDevice>('/dc/devices', dto).then(r => r.data),
  updateDevice: (id: string, dto: UpdateDcDeviceDto) => client.patch<DcDevice>(`/dc/devices/${id}`, dto).then(r => r.data),
  removeDevice: (id: string) => client.delete(`/dc/devices/${id}`).then(r => r.data),

  // IPs
  findIps: (device_id?: string) =>
    client.get<DcIpAddress[]>('/dc/ips', { params: { device_id } }).then(r => r.data),
  createIp: (dto: CreateDcIpDto) => client.post<DcIpAddress>('/dc/ips', dto).then(r => r.data),
  updateIp: (id: string, dto: UpdateDcIpDto) => client.patch<DcIpAddress>(`/dc/ips/${id}`, dto).then(r => r.data),
  removeIp: (id: string) => client.delete(`/dc/ips/${id}`).then(r => r.data),

  // Connections
  findConnections: (device_id?: string) =>
    client.get<DcConnection[]>('/dc/connections', { params: { device_id } }).then(r => r.data),
  createConnection: (dto: CreateDcConnectionDto) => client.post<DcConnection>('/dc/connections', dto).then(r => r.data),
  updateConnection: (id: string, dto: UpdateDcConnectionDto) => client.patch<DcConnection>(`/dc/connections/${id}`, dto).then(r => r.data),
  removeConnection: (id: string) => client.delete(`/dc/connections/${id}`).then(r => r.data),
};
