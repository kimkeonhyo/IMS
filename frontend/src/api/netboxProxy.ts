import client from './client';

export type RackFace = 'front' | 'rear';

export interface NetboxStatus {
  configured: boolean;
}

export interface NetboxRack {
  id: number;
  name: string;
  u_height: number;
  device_count: number;
  /** 마운트된 장비의 U 합 (용량 게이지용, 구버전 백엔드 호환 optional) */
  occupied_u?: number;
}

export interface NetboxRacksResponse {
  configured: boolean;
  racks: NetboxRack[];
  /** 역할명 → 현재 조회 범위 랙에 실장된 장비 수 (범례 카운트용, 구버전 호환 optional) */
  role_counts?: Record<string, number>;
}

export interface NetboxSite {
  id: number;
  slug: string;
  name: string;
  region_slug: string | null;
  region_name: string | null;
}
export interface NetboxSitesResponse {
  configured: boolean;
  sites: NetboxSite[];
}

export interface DevicePort {
  name: string;
  enabled: boolean;
  status: 'connected' | 'available' | 'disconnected';
  peer_device: string | null;
  peer_port: string | null;
  peer_ip: string | null;
}
export interface DevicePortsResponse {
  configured: boolean;
  found: boolean;
  device_name: string | null;
  ports: DevicePort[];
}

/** NetBox 장비 속성 (IMS 내 편집 폼용) */
export interface NetboxDeviceDetail {
  id: number;
  name: string;
  serial: string;
  description: string;
  status: string;
  role_id: number | null;
  owner_id: number | null;
  position: number | null;
  face: 'front' | 'rear' | null;
  device_type_id: number | null;
  primary_ip4: string | null;
}
export interface UpdateNetboxDevicePayload {
  name?: string;
  serial?: string;
  description?: string;
  status?: string;
  role?: number;
  owner?: number | null;
  position?: number | null;
  face?: 'front' | 'rear';
  device_type?: number;
  mgmt_ip?: string | null;
}

export interface NetboxRackDevice {
  id: number;
  name: string;
  position: number | null;
  face: RackFace | null;
  u_height: number;
  role: string;
  status: string;
}

export interface NetboxRackDevicesResponse {
  configured: boolean;
  devices: NetboxRackDevice[];
}

export interface MoveDevicePayload {
  rack: number;
  position: number;
  face: RackFace;
}

export interface NetboxSyncResult {
  ok: boolean;
  message?: string;
  created: number;
  updated: number;
  skipped: number;
  /** 연결 기반 재고사용 자동 등록/반납 (구버전 백엔드 호환을 위해 optional) */
  usages_created?: number;
  usages_returned?: number;
  /** 상세 내역 (동기화 리스트 보기용) */
  details?: {
    usagesCreated: string[];
    usagesReturned: string[];
    notes: string[];
    errors: string[];
  };
}

export const netboxProxyApi = {
  getStatus: () => client.get<NetboxStatus>('/netbox-proxy/status').then(r => r.data),

  getRacks: (site?: string, region?: string) =>
    client.get<NetboxRacksResponse>('/netbox-proxy/racks', {
      params: site ? { site } : region ? { region } : {},
    }).then(r => r.data),
  getSites: () => client.get<NetboxSitesResponse>('/netbox-proxy/sites').then(r => r.data),
  getDevicePorts: (ip: string) =>
    client.get<DevicePortsResponse>('/netbox-proxy/device-ports', { params: { ip } }).then(r => r.data),
  getDeviceRoles: () =>
    client.get<{ configured: boolean; roles: Array<{ id: number; name: string; color: string; count: number }> }>('/netbox-proxy/device-roles').then(r => r.data),
  /** Owner(담당팀) 목록 (속성 편집 폼용) */
  getOwners: () =>
    client.get<{ configured: boolean; owners: Array<{ id: number; name: string }> }>('/netbox-proxy/owners').then(r => r.data),
  /** 장비 타입 목록 (속성 편집 폼용) */
  getDeviceTypes: () =>
    client.get<{ configured: boolean; types: Array<{ id: number; model: string; u_height: number }> }>('/netbox-proxy/device-types').then(r => r.data),
  /** 장비 속성 단건 조회 (속성 편집 폼 초기값) */
  getDevice: (id: number) =>
    client.get<NetboxDeviceDetail>(`/netbox-proxy/devices/${id}`).then(r => r.data),
  /** 장비 속성 수정 (MASTER/ADMIN 전용) */
  updateDevice: (id: number, dto: UpdateNetboxDevicePayload) =>
    client.patch<{ ok: boolean }>(`/netbox-proxy/devices/${id}`, dto).then(r => r.data),

  /** 랙 elevation SVG를 텍스트로 조회 (JWT 헤더 자동 첨부) */
  getElevationSvg: (id: number, face: RackFace) =>
    client
      .get<string>(`/netbox-proxy/racks/${id}/elevation`, {
        params: { face },
        responseType: 'text',
      })
      .then(r => r.data),

  /** 랙 장비 목록 (배치 편집용) */
  getRackDevices: (rackId: number) =>
    client.get<NetboxRackDevicesResponse>(`/netbox-proxy/racks/${rackId}/devices`).then(r => r.data),

  /** 장비 U 위치/랙 이동 (MASTER/ADMIN 전용) */
  moveDevice: (deviceId: number, payload: MoveDevicePayload) =>
    client.patch<{ ok: boolean }>(`/netbox-proxy/devices/${deviceId}/position`, payload).then(r => r.data),

  /** NetBox → IMS 재고 동기화 (MASTER/ADMIN 전용)
   *  NetBox로 수백 건의 순차 호출을 하므로 기본 15초 타임아웃으로는 항상 abort됨 → 5분으로 확장 */
  runSync: () => client.post<NetboxSyncResult>('/netbox-sync/run', undefined, { timeout: 300000 }).then(r => r.data),

  /** 토폴로지 뷰용 공유 저장 필터 ID */
  getTopologyFilter: () =>
    client.get<{ configured: boolean; filters: Array<{ id: number; name: string }> }>('/netbox-proxy/topology-filter').then(r => r.data),
};
