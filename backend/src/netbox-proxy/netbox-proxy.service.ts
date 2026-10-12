import { Injectable, Logger } from '@nestjs/common';

const CACHE_TTL_MS = 60 * 1000;
// elevation SVG는 NetBox가 매번 렌더링(장당 1~3초)하므로 길게 캐시 (배치 변경 잦지 않음)
const ELEVATION_CACHE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10 * 1000;

export interface NetboxRackDto {
  id: number;
  name: string;
  u_height: number;
  device_count: number;
  /** 마운트된 장비의 U 합 (용량 게이지용) */
  occupied_u: number;
}

export interface NetboxRackDeviceDto {
  id: number;
  name: string;
  position: number | null;
  face: 'front' | 'rear' | null;
  u_height: number;
  role: string;
  status: string;
}

export type MoveDeviceResult =
  | { ok: true }
  | { ok: false; status: number; message: string };

export type ElevationResult =
  | { ok: true; svg: string }
  | { ok: false; status: number; message: string };

export interface DevicePort {
  name: string;
  enabled: boolean;
  status: 'connected' | 'available' | 'disconnected';
  peer_device: string | null;
  peer_port: string | null;
  peer_ip: string | null;
}

interface CacheEntry<T> {
  ts: number;
  data: T;
}

@Injectable()
export class NetboxProxyService {
  private readonly logger = new Logger(NetboxProxyService.name);
  // site/region 키('all' 포함) → 랙 목록 + 역할별 실장 수
  private racksCache = new Map<string, CacheEntry<{ racks: NetboxRackDto[]; role_counts: Record<string, number> }>>();
  private elevationCache = new Map<string, CacheEntry<string>>();
  private deviceTypeCache: CacheEntry<Map<number, number>> | null = null;

  /** 랙 내 NetBox 장비의 primary_ip 맵 {netboxId: ip} — 툴팁 mgmt IP 표출용 */
  private async getRackDeviceIps(rackId: number): Promise<Map<number, string>> {
    const ipById = new Map<number, string>();
    try {
      const res = await this.netboxFetch(`/api/dcim/devices/?rack_id=${rackId}&limit=200`);
      if (!res.ok) return ipById;
      const body: any = await res.json();
      for (const d of body?.results ?? []) {
        const addr: string | undefined = d.primary_ip4?.address ?? d.primary_ip?.address;
        if (addr) ipById.set(Number(d.id), String(addr).split('/')[0]);
      }
    } catch { /* best-effort */ }
    return ipById;
  }

  private get baseUrl(): string | null {
    const url = process.env.NETBOX_URL;
    if (!url || !url.trim()) return null;
    return url.trim().replace(/\/+$/, '');
  }

  private get token(): string | null {
    const token = process.env.NETBOX_TOKEN;
    return token && token.trim() ? token.trim() : null;
  }

  get configured(): boolean {
    return this.baseUrl !== null && this.token !== null;
  }

  /** NetBox API fetch with bearer auth + timeout. */
  private async netboxFetch(path: string, init?: { method?: string; body?: unknown }): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      return await fetch(`${this.baseUrl}${path}`, {
        method: init?.method ?? 'GET',
        headers: {
          Authorization: `Bearer ${this.token}`,
          ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  getStatus(): { configured: boolean } {
    return { configured: this.configured };
  }

  /** 토폴로지 뷰용 공유 저장 필터 목록 (topology-views ?filter_id= 용).
   *  사이트별 필터를 이름으로 매칭하기 위해 전체 목록을 반환 (예: 'All', 'DC-Infra', …). */
  async getTopologyFilters(): Promise<{ configured: boolean; filters: Array<{ id: number; name: string }> }> {
    if (!this.configured) return { configured: false, filters: [] };
    try {
      const res = await this.netboxFetch('/api/extras/saved-filters/?enabled=true&shared=true&limit=100');
      if (!res.ok) throw new Error(`NetBox saved-filters HTTP ${res.status}`);
      const body: any = await res.json();
      const filters = (body?.results ?? []).map((f: any) => ({ id: Number(f.id), name: String(f.name ?? '') }));
      return { configured: true, filters };
    } catch (err) {
      this.logger.error(`getTopologyFilters failed: ${(err as Error)?.message ?? err}`);
      return { configured: true, filters: [] };
    }
  }

  async getRacks(site?: string, region?: string): Promise<{
    configured: boolean;
    racks: NetboxRackDto[];
    /** 역할명 → 현재 조회 범위 랙에 실장된 장비 수 (범례 카운트용) */
    role_counts: Record<string, number>;
  }> {
    if (!this.configured) return { configured: false, racks: [], role_counts: {} };

    const s = site?.trim(), r = region?.trim();
    const key = s ? `s:${s}` : r ? `r:${r}` : 'all';
    const cached = this.racksCache.get(key);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return { configured: true, ...cached.data };
    }

    try {
      const q = s ? `&site=${encodeURIComponent(s)}` : r ? `&region=${encodeURIComponent(r)}` : '';
      const res = await this.netboxFetch(`/api/dcim/racks/?limit=50${q}`);
      if (!res.ok) throw new Error(`NetBox racks HTTP ${res.status}`);
      const body: any = await res.json();

      // 마운트된 장비 집계 — 랙별 사용 U(용량 게이지) + 역할별 실장 수(범례) (best-effort)
      const occupiedByRack = new Map<number, number>();
      const roleCounts: Record<string, number> = {};
      try {
        const [devRes, heights] = await Promise.all([
          this.netboxFetch(`/api/dcim/devices/?limit=500${q}`),
          this.getDeviceTypeHeights(),
        ]);
        if (devRes.ok) {
          const devBody: any = await devRes.json();
          for (const d of devBody?.results ?? []) {
            const rackId = d.rack?.id != null ? Number(d.rack.id) : null;
            if (rackId == null || d.position == null) continue; // 미배치 장비 제외
            const u = heights.get(Number(d.device_type?.id)) ?? 1;
            occupiedByRack.set(rackId, (occupiedByRack.get(rackId) ?? 0) + u);
            const roleName = d.role?.name;
            if (roleName) roleCounts[roleName] = (roleCounts[roleName] ?? 0) + 1;
          }
        }
      } catch { /* 실패 시 게이지·범례 카운트 없이 표시 */ }

      const racks: NetboxRackDto[] = (body?.results ?? [])
        .map((r: any) => ({
          id: Number(r.id),
          name: String(r.name ?? ''),
          u_height: Number(r.u_height ?? 0),
          device_count: Number(r.device_count ?? 0),
          occupied_u: occupiedByRack.get(Number(r.id)) ?? 0,
        }))
        .sort((a: NetboxRackDto, b: NetboxRackDto) => a.name.localeCompare(b.name));
      this.racksCache.set(key, { ts: Date.now(), data: { racks, role_counts: roleCounts } });
      // 첫 진입 지연 완화: 전면 배치도를 백그라운드에서 미리 워밍 (fire-and-forget)
      void this.warmElevations(racks);
      return { configured: true, racks, role_counts: roleCounts };
    } catch (err) {
      this.logger.error(`getRacks failed: ${(err as Error)?.message ?? err}`);
      return { configured: true, racks: [], role_counts: {} };
    }
  }

  /** IP로 NetBox 장비의 인터페이스 포트 목록 + 연결 상대(장비/포트/IP)를 반환.
   *  네트워크 상세 페이지의 포트 패널(연결도)용 — 연결 정보는 NetBox 케이블/링크에서 취득. */
  async getDevicePorts(ip: string): Promise<{ configured: boolean; found: boolean; device_name: string | null; ports: DevicePort[] }> {
    if (!this.configured) return { configured: false, found: false, device_name: null, ports: [] };
    const cleanIp = (ip ?? '').trim();
    if (!cleanIp) return { configured: true, found: false, device_name: null, ports: [] };
    try {
      // 1) primary_ip가 일치하는 NetBox 장비 찾기
      const devBody: any = await (await this.netboxFetch('/api/dcim/devices/?limit=500')).json();
      const dev = (devBody?.results ?? []).find(
        (d: any) => String(d.primary_ip4?.address ?? d.primary_ip?.address ?? '').split('/')[0] === cleanIp,
      );
      if (!dev) return { configured: true, found: false, device_name: null, ports: [] };

      // 2) 인터페이스 목록
      const ifBody: any = await (await this.netboxFetch(`/api/dcim/interfaces/?device_id=${dev.id}&limit=500`)).json();
      const ifaces: any[] = ifBody?.results ?? [];

      // 3) 연결 상대 장비들의 primary_ip 조회 (bulk)
      const peerIds = new Set<number>();
      for (const i of ifaces) {
        const peer = (i.link_peers ?? [])[0];
        if (peer?.device?.id != null) peerIds.add(Number(peer.device.id));
      }
      const peerIpById = new Map<number, string>();
      if (peerIds.size > 0) {
        const idsParam = Array.from(peerIds).join(',');
        const pBody: any = await (await this.netboxFetch(`/api/dcim/devices/?id__in=${idsParam}&limit=500`)).json();
        for (const p of pBody?.results ?? []) {
          const addr = String(p.primary_ip4?.address ?? p.primary_ip?.address ?? '').split('/')[0];
          if (addr) peerIpById.set(Number(p.id), addr);
        }
      }

      // 4) 포트 구성
      const ports: DevicePort[] = ifaces
        .filter((i) => i.type?.value !== 'virtual' && !i.mgmt_only) // 물리 포트 위주 (가상/관리 제외)
        .map((i) => {
          const peer = (i.link_peers ?? [])[0];
          const connected = !!peer;
          const status: DevicePort['status'] = connected ? 'connected' : i.enabled ? 'available' : 'disconnected';
          return {
            name: String(i.name ?? ''),
            enabled: !!i.enabled,
            status,
            peer_device: peer?.device?.name ?? null,
            peer_port: peer?.name ?? null,
            peer_ip: peer?.device?.id != null ? peerIpById.get(Number(peer.device.id)) ?? null : null,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

      return { configured: true, found: true, device_name: String(dev.name ?? ''), ports };
    } catch (err) {
      this.logger.error(`getDevicePorts failed (${cleanIp}): ${(err as Error)?.message ?? err}`);
      return { configured: true, found: false, device_name: null, ports: [] };
    }
  }

  /** NetBox 장비 역할(색상) 목록 — 랙 배치도 색상 범례·속성 편집 폼용 */
  async getDeviceRoles(): Promise<{ configured: boolean; roles: Array<{ id: number; name: string; color: string; count: number }> }> {
    if (!this.configured) return { configured: false, roles: [] };
    try {
      const body: any = await (await this.netboxFetch('/api/dcim/device-roles/?limit=100')).json();
      const roles = (body?.results ?? [])
        .map((r: any) => ({ id: Number(r.id), name: String(r.name ?? ''), color: String(r.color ?? ''), count: Number(r.device_count ?? 0) }))
        .filter((r: any) => r.count > 0 && r.color)
        .sort((a: any, b: any) => a.name.localeCompare(b.name));
      return { configured: true, roles };
    } catch (err) {
      this.logger.error(`getDeviceRoles failed: ${(err as Error)?.message ?? err}`);
      return { configured: true, roles: [] };
    }
  }

  /** NetBox Owner(담당팀) 목록 — 속성 편집 폼용 */
  async getOwners(): Promise<{ configured: boolean; owners: Array<{ id: number; name: string }> }> {
    if (!this.configured) return { configured: false, owners: [] };
    try {
      const body: any = await (await this.netboxFetch('/api/users/owners/?limit=100')).json();
      const owners = (body?.results ?? [])
        .map((o: any) => ({ id: Number(o.id), name: String(o.name ?? '') }))
        .sort((a: any, b: any) => a.name.localeCompare(b.name));
      return { configured: true, owners };
    } catch (err) {
      this.logger.error(`getOwners failed: ${(err as Error)?.message ?? err}`);
      return { configured: true, owners: [] };
    }
  }

  /** 장비 단건 속성 조회 — IMS 내 속성 편집 폼 초기값용 */
  async getDevice(id: number): Promise<{
    ok: boolean;
    device?: {
      id: number; name: string; serial: string; description: string;
      status: string; role_id: number | null; owner_id: number | null;
      position: number | null; face: 'front' | 'rear' | null;
      device_type_id: number | null;
      primary_ip4: string | null;
    };
    message?: string;
  }> {
    if (!this.configured) return { ok: false, message: 'NetBox 연동이 설정되지 않았습니다' };
    try {
      const res = await this.netboxFetch(`/api/dcim/devices/${id}/`);
      if (!res.ok) return { ok: false, message: `NetBox HTTP ${res.status}` };
      const d: any = await res.json();
      return {
        ok: true,
        device: {
          id: Number(d.id),
          name: String(d.name ?? ''),
          serial: String(d.serial ?? ''),
          description: String(d.description ?? ''),
          status: String(d.status?.value ?? 'active'),
          role_id: d.role?.id != null ? Number(d.role.id) : null,
          owner_id: d.owner?.id != null ? Number(d.owner.id) : null,
          position: d.position != null ? Number(d.position) : null,
          face: d.face?.value === 'rear' ? 'rear' : d.face?.value === 'front' ? 'front' : null,
          device_type_id: d.device_type?.id != null ? Number(d.device_type.id) : null,
          primary_ip4: d.primary_ip4?.address ?? null,
        },
      };
    } catch (err) {
      const message = (err as Error)?.message ?? String(err);
      this.logger.error(`getDevice failed (${id}): ${message}`);
      return { ok: false, message };
    }
  }

  /** NetBox 장비 타입 목록 (모델·U 높이) — 속성 편집 폼용 */
  async getDeviceTypes(): Promise<{ configured: boolean; types: Array<{ id: number; model: string; u_height: number }> }> {
    if (!this.configured) return { configured: false, types: [] };
    try {
      const body: any = await (await this.netboxFetch('/api/dcim/device-types/?limit=500')).json();
      const types = (body?.results ?? [])
        .map((t: any) => ({ id: Number(t.id), model: String(t.model ?? ''), u_height: Number(t.u_height ?? 1) }))
        .sort((a: any, b: any) => a.u_height - b.u_height || a.model.localeCompare(b.model));
      return { configured: true, types };
    } catch (err) {
      this.logger.error(`getDeviceTypes failed: ${(err as Error)?.message ?? err}`);
      return { configured: true, types: [] };
    }
  }

  /** mgmt 인터페이스에 IP 등록/변경 후 장비 primary IPv4로 지정.
   *  변경·해제 시 기존 primary IP 객체는 NetBox IP Addresses에서 삭제해 잔재를 남기지 않는다.
   *  절차: mgmt 인터페이스 확보(없으면 생성) → 새 IP 재사용/생성·할당 → primary 지정 → 옛 IP 삭제. */
  private async setMgmtIp(deviceId: number, ip: string | null): Promise<MoveDeviceResult> {
    try {
      const devRes = await this.netboxFetch(`/api/dcim/devices/${deviceId}/`);
      if (!devRes.ok) return { ok: false, status: devRes.status, message: `장비 조회 실패 (HTTP ${devRes.status})` };
      const dev: any = await devRes.json();
      const oldIpId: number | null = dev.primary_ip4?.id != null ? Number(dev.primary_ip4.id) : null;
      const oldAddress: string | null = dev.primary_ip4?.address ?? null;

      // 해제: primary 해제 후 기존 IP 객체 삭제
      if (ip === null || ip.trim() === '') {
        if (oldIpId == null) return { ok: true };
        const unset = await this.netboxFetch(`/api/dcim/devices/${deviceId}/`, { method: 'PATCH', body: { primary_ip4: null } });
        if (!unset.ok) return { ok: false, status: unset.status, message: `primary IP 해제 실패 (HTTP ${unset.status})` };
        const del = await this.netboxFetch(`/api/ipam/ip-addresses/${oldIpId}/`, { method: 'DELETE' });
        if (!del.ok && del.status !== 404) return { ok: false, status: del.status, message: `기존 IP 삭제 실패 (HTTP ${del.status})` };
        return { ok: true };
      }
      // CIDR 미기입 시 /16 기본 (내부망 /16 관례)
      const address = ip.includes('/') ? ip.trim() : `${ip.trim()}/16`;
      if (oldAddress === address) return { ok: true }; // 변경 없음

      // 2) mgmt 인터페이스 확보 (없으면 생성)
      const ifBody: any = await (await this.netboxFetch(`/api/dcim/interfaces/?device_id=${deviceId}&name=mgmt`)).json();
      let ifaceId: number | null = ifBody?.results?.[0]?.id != null ? Number(ifBody.results[0].id) : null;
      if (ifaceId == null) {
        const created = await this.netboxFetch('/api/dcim/interfaces/', {
          method: 'POST',
          body: { device: deviceId, name: 'mgmt', type: '1000base-t' },
        });
        if (!created.ok) return { ok: false, status: created.status, message: `mgmt 인터페이스 생성 실패 (HTTP ${created.status})` };
        ifaceId = Number(((await created.json()) as any).id);
      }

      // 3) IP 객체 재사용 또는 생성 → mgmt에 할당
      const ipBody: any = await (await this.netboxFetch(`/api/ipam/ip-addresses/?address=${encodeURIComponent(address)}`)).json();
      const existing = (ipBody?.results ?? [])[0];
      let ipId: number;
      if (existing) {
        if (existing.assigned_object_id != null && Number(existing.assigned_object_id) !== ifaceId) {
          return { ok: false, status: 409, message: `${address}는 이미 다른 곳에 할당돼 있습니다. NetBox에서 확인해 주세요.` };
        }
        ipId = Number(existing.id);
        if (existing.assigned_object_id == null) {
          const assign = await this.netboxFetch(`/api/ipam/ip-addresses/${ipId}/`, {
            method: 'PATCH',
            body: { assigned_object_type: 'dcim.interface', assigned_object_id: ifaceId },
          });
          if (!assign.ok) return { ok: false, status: assign.status, message: `IP 할당 실패 (HTTP ${assign.status})` };
        }
      } else {
        const created = await this.netboxFetch('/api/ipam/ip-addresses/', {
          method: 'POST',
          body: { address, status: 'active', assigned_object_type: 'dcim.interface', assigned_object_id: ifaceId },
        });
        if (!created.ok) {
          const err: any = await created.json().catch(() => ({}));
          return { ok: false, status: created.status, message: Object.values(err).flat().join(' ') || `IP 생성 실패 (HTTP ${created.status})` };
        }
        ipId = Number(((await created.json()) as any).id);
      }

      // 4) 장비 primary IPv4 지정
      const prim = await this.netboxFetch(`/api/dcim/devices/${deviceId}/`, { method: 'PATCH', body: { primary_ip4: ipId } });
      if (!prim.ok) return { ok: false, status: prim.status, message: `primary IP 지정 실패 (HTTP ${prim.status})` };

      // 5) 기존 primary IP 객체 삭제 (IP Addresses 잔재 정리 — 전환 성공 후에만)
      if (oldIpId != null && oldIpId !== ipId) {
        const del = await this.netboxFetch(`/api/ipam/ip-addresses/${oldIpId}/`, { method: 'DELETE' });
        if (!del.ok && del.status !== 404) {
          this.logger.warn(`setMgmtIp: 기존 IP(${oldAddress}) 삭제 실패 HTTP ${del.status} — primary 전환은 완료됨`);
        }
      }
      return { ok: true };
    } catch (err) {
      const message = (err as Error)?.message ?? String(err);
      this.logger.error(`setMgmtIp failed (${deviceId}): ${message}`);
      return { ok: false, status: 0, message };
    }
  }

  /** 장비 속성 수정 — 이름·설명·시리얼·상태·역할·담당팀·위치(U)·장비타입·mgmt IP만 허용.
   *  성공 시 배치도 캐시 무효화로 SVG·툴팁에 즉시 반영. */
  async updateDevice(
    id: number,
    dto: {
      name?: string; serial?: string; description?: string; status?: string;
      role?: number; owner?: number | null;
      position?: number | null; face?: 'front' | 'rear'; device_type?: number;
      mgmt_ip?: string | null;
    },
  ): Promise<MoveDeviceResult> {
    if (!this.configured) {
      return { ok: false, status: 503, message: 'NetBox 연동이 설정되지 않았습니다' };
    }
    // 허용 필드만 골라 전달 (임의 필드 PATCH 방지)
    const body: Record<string, unknown> = {};
    if (dto.name !== undefined) body.name = dto.name;
    if (dto.serial !== undefined) body.serial = dto.serial;
    if (dto.description !== undefined) body.description = dto.description;
    if (dto.status !== undefined) body.status = dto.status;
    if (dto.role !== undefined) body.role = dto.role;
    if (dto.owner !== undefined) body.owner = dto.owner;
    if (dto.position !== undefined) {
      body.position = dto.position;
      // 마운트 위치 변경 시 face 필수 — 미지정이면 front 기본
      if (dto.position !== null) body.face = dto.face ?? 'front';
    }
    if (dto.device_type !== undefined) body.device_type = dto.device_type;
    try {
      if (Object.keys(body).length > 0) {
        const res = await this.netboxFetch(`/api/dcim/devices/${id}/`, { method: 'PATCH', body });
        if (!res.ok) {
          let message = `NetBox HTTP ${res.status}`;
          try {
            const errBody: any = await res.json();
            message = Object.values(errBody).flat().join(' ') || message;
          } catch { /* 본문 파싱 실패 시 기본 메시지 유지 */ }
          return { ok: false, status: res.status, message };
        }
      }
      // mgmt IP는 별도 오케스트레이션 (인터페이스·IP 객체·primary 지정)
      if (dto.mgmt_ip !== undefined) {
        const ipResult = await this.setMgmtIp(id, dto.mgmt_ip);
        if (!ipResult.ok) return ipResult;
      }
      this.elevationCache.clear();
      this.racksCache.clear();
      return { ok: true };
    } catch (err) {
      const message = (err as Error)?.message ?? String(err);
      this.logger.error(`updateDevice failed (${id}): ${message}`);
      return { ok: false, status: 0, message };
    }
  }

  /** NetBox Site 목록 (+상위 Region) — 랙 배치도·토폴로지 Region→Site 캐스케이드 드롭다운용 */
  async getSites(): Promise<{
    configured: boolean;
    sites: Array<{ id: number; slug: string; name: string; region_slug: string | null; region_name: string | null }>;
  }> {
    if (!this.configured) return { configured: false, sites: [] };
    try {
      const res = await this.netboxFetch('/api/dcim/sites/?limit=100');
      if (!res.ok) throw new Error(`NetBox sites HTTP ${res.status}`);
      const body: any = await res.json();
      const sites = (body?.results ?? [])
        .map((s: any) => ({
          id: Number(s.id),
          slug: String(s.slug),
          name: String(s.name),
          region_slug: s.region?.slug ?? null,
          region_name: s.region?.name ?? null,
        }))
        .sort((a: any, b: any) => a.name.localeCompare(b.name));
      return { configured: true, sites };
    } catch (err) {
      this.logger.error(`getSites failed: ${(err as Error)?.message ?? err}`);
      return { configured: true, sites: [] };
    }
  }

  /** 랙 목록 조회 직후 front 면 SVG를 순차 프리페치해 캐시를 데워둔다. */
  private async warmElevations(racks: NetboxRackDto[]): Promise<void> {
    for (const rack of racks) {
      const key = `${rack.id}:front`;
      const cached = this.elevationCache.get(key);
      if (cached && Date.now() - cached.ts < ELEVATION_CACHE_TTL_MS) continue;
      try {
        await this.getElevationSvg(rack.id, 'front');
      } catch {
        /* warm 실패는 무시 — 실제 요청 시 재시도됨 */
      }
    }
  }

  /** device-type id → u_height 맵 (목록 API의 중첩 device_type에는 u_height가 없음). */
  private async getDeviceTypeHeights(): Promise<Map<number, number>> {
    if (this.deviceTypeCache && Date.now() - this.deviceTypeCache.ts < ELEVATION_CACHE_TTL_MS) {
      return this.deviceTypeCache.data;
    }
    const map = new Map<number, number>();
    const res = await this.netboxFetch('/api/dcim/device-types/?limit=500');
    if (!res.ok) throw new Error(`NetBox device-types HTTP ${res.status}`);
    const body: any = await res.json();
    for (const dt of body?.results ?? []) {
      map.set(Number(dt.id), Number(dt.u_height ?? 1));
    }
    this.deviceTypeCache = { ts: Date.now(), data: map };
    return map;
  }

  /** 랙에 마운트된 장비 목록 (드래그&드롭 배치 편집용). */
  async getRackDevices(rackId: number): Promise<{ configured: boolean; devices: NetboxRackDeviceDto[] }> {
    if (!this.configured) return { configured: false, devices: [] };
    try {
      const [res, heights] = await Promise.all([
        this.netboxFetch(`/api/dcim/devices/?rack_id=${rackId}&limit=200`),
        this.getDeviceTypeHeights(),
      ]);
      if (!res.ok) throw new Error(`NetBox devices HTTP ${res.status}`);
      const body: any = await res.json();
      const devices: NetboxRackDeviceDto[] = (body?.results ?? []).map((d: any) => ({
        id: Number(d.id),
        name: String(d.name ?? ''),
        position: d.position === null || d.position === undefined ? null : Number(d.position),
        face: d.face?.value === 'rear' ? 'rear' : d.face?.value === 'front' ? 'front' : null,
        u_height: heights.get(Number(d.device_type?.id)) ?? 1,
        role: String(d.role?.name ?? ''),
        status: String(d.status?.value ?? ''),
      }));
      return { configured: true, devices };
    } catch (err) {
      this.logger.error(`getRackDevices failed (rack ${rackId}): ${(err as Error)?.message ?? err}`);
      return { configured: true, devices: [] };
    }
  }

  /** 장비 U 위치/랙 이동 (NetBox가 자리 겹침 등 검증 수행). */
  async moveDevice(
    deviceId: number,
    dto: { rack: number; position: number; face: 'front' | 'rear' },
  ): Promise<MoveDeviceResult> {
    if (!this.configured) {
      return { ok: false, status: 503, message: 'NetBox 연동이 설정되지 않았습니다' };
    }
    try {
      const res = await this.netboxFetch(`/api/dcim/devices/${deviceId}/`, {
        method: 'PATCH',
        body: { rack: dto.rack, position: dto.position, face: dto.face },
      });
      if (!res.ok) {
        // NetBox 검증 실패(자리 겹침 등) 메시지를 그대로 전달
        let message = `NetBox HTTP ${res.status}`;
        try {
          const errBody: any = await res.json();
          message = Object.values(errBody).flat().join(' ') || message;
        } catch { /* 본문 파싱 실패 시 기본 메시지 유지 */ }
        return { ok: false, status: res.status, message };
      }
      // 배치가 바뀌었으므로 elevation/랙 캐시 무효화
      this.elevationCache.clear();
      this.racksCache.clear();
      return { ok: true };
    } catch (err) {
      const message = (err as Error)?.message ?? String(err);
      this.logger.error(`moveDevice failed (device ${deviceId}): ${message}`);
      return { ok: false, status: 0, message };
    }
  }

  async getElevationSvg(rackId: number, face: 'front' | 'rear'): Promise<ElevationResult> {
    const key = `${rackId}:${face}`;
    const cached = this.elevationCache.get(key);
    if (cached && Date.now() - cached.ts < ELEVATION_CACHE_TTL_MS) {
      return { ok: true, svg: cached.data };
    }
    try {
      const res = await this.netboxFetch(
        `/api/dcim/racks/${rackId}/elevation/?render=svg&face=${face}`,
      );
      if (!res.ok) {
        return { ok: false, status: res.status, message: `NetBox elevation HTTP ${res.status}` };
      }
      let svg = await res.text();
      // NetBox 내부 호스트 기준 링크를 동일 오리진 상대경로(/netbox)로 재작성.
      svg = svg.split(this.baseUrl!).join('/netbox');
      const ipById = await this.getRackDeviceIps(rackId);
      // 툴팁(<title>)에 mgmt IP 추가 — 앵커 재작성 전에 수행(아직 devices/<id>/ href가 남아있을 때).
      if (ipById.size > 0) {
        svg = svg.replace(
          /(<a\b[^>]*?devices\/(\d+)\/[^>]*><title>)([\s\S]*?)(<\/title>)/g,
          (full, head, id, body, tail) => {
            const ip = ipById.get(Number(id));
            return ip && !body.includes('Mgmt IP:') ? `${head}${body}\nMgmt IP: ${ip}${tail}` : full;
          },
        );
      }
      // elevation SVG 앵커는 xlink:href + target="_parent"(현재 탭을 덮어씀)라 모두 새 탭으로.
      svg = svg
        .replace(/target="(?:_parent|_top|_self)"/g, 'target="_blank"')
        .replace(/<a\b(?![^>]*\btarget=)/g, '<a target="_blank"');
      // NetBox elevation SVG는 width/height만 있고 viewBox가 없어, 프론트에서 폭을 줄이면
      // 세로 비율이 깨져 맨 아래 U1 행이 잘림. width/height로 viewBox를 주입해 비율대로 스케일되게 한다.
      svg = svg.replace(/<svg\b([^>]*)>/, (tag, attrs: string) => {
        if (/\bviewBox\s*=/.test(attrs)) return tag;
        const w = attrs.match(/\bwidth="([\d.]+)"/)?.[1];
        const h = attrs.match(/\bheight="([\d.]+)"/)?.[1];
        return w && h ? `<svg${attrs} viewBox="0 0 ${w} ${h}">` : tag;
      });
      this.elevationCache.set(key, { ts: Date.now(), data: svg });
      return { ok: true, svg };
    } catch (err) {
      const message = (err as Error)?.message ?? String(err);
      this.logger.error(`getElevationSvg failed (rack ${rackId}): ${message}`);
      // 업스트림 일시 장애 시 만료된 캐시라도 있으면 그걸로 응답 (UX 우선)
      if (cached) return { ok: true, svg: cached.data };
      return { ok: false, status: 0, message };
    }
  }
}
