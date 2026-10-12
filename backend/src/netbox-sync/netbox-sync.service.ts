import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, DataSource } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { SerialNumber, SerialStatus } from '../serial-numbers/serial-number.entity';
import { Employee } from '../employees/employee.entity';
import { Team } from '../teams/team.entity';
import { Storage } from '../storage/storage.entity';
import { StockUsage } from '../stock-usages/stock-usage.entity';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { generateDocNo } from '../common/utils/doc-no.util';

const WRITE_ROLES = ['MASTER', 'ADMIN'];
const FETCH_TIMEOUT_MS = 10 * 1000;
const DEFAULT_ITEM_CODES = 'HW-0001,HW-0004';

// IMS 시리얼 상태 → NetBox 디바이스 상태
const STATUS_MAP: Record<string, string> = {
  [SerialStatus.STOCK]: 'inventory',
  [SerialStatus.USED]: 'active',
  [SerialStatus.SHIPPED]: 'offline',
};

// NetBox에 이미 존재해야 하는 참조 객체 슬러그
const SITE_SLUG = 'dc-infra';
const DEVICE_TYPE_SLUG = 'generic-1u';
const ROLE_SLUG_SERVER = 'server';
const ROLE_SLUG_WORKSTATION = 'workstation';
const WORKSTATION_ITEM_CODE = 'HW-0004';

// Phase 3에서 자동 생성한 사용 건 식별용 purpose 마커 (자동반납 가드)
const AUTO_USAGE_PURPOSE = '서버실 연결 사용 (NetBox 자동)';
const AUTO_USAGE_PREFIX = '서버실 연결 사용';

// Phase 2 장비 owner 지정 규칙 (장비명 prefix → 팀명)
const OWNER_RULE_DEV_TEAM = '개발팀';
const OWNER_RULE_AI_TEAM = 'AI팀';
const OWNER_RULE_DEFAULT_TEAM = '인프라팀';

export interface SyncResult {
  ok: boolean;
  message?: string;
  created: number;
  updated: number;
  skipped: number;
  /** Phase 1: 이번 실행에서 신규 생성된 NetBox region 수 */
  regions: number;
  /** Phase 1: 이번 실행에서 신규 동기화(그룹/오너그룹/오너 중 하나라도 생성)된 팀 수 */
  teams: number;
  /** Phase 1: 이번 실행에서 신규 생성된 NetBox 사용자 수 */
  users: number;
  /** Phase 2: 이번 실행에서 owner가 지정된 장비 수 */
  owners_set: number;
  /** Phase 3: 자동 생성된 재고사용 건수 */
  usages_created: number;
  /** Phase 3: 자동 반납 처리된 재고사용 건수 */
  usages_returned: number;
  /** 상세 내역 (동기화 리스트 보기용) */
  details?: {
    usagesCreated: string[];
    usagesReturned: string[];
    notes: string[];
    errors: string[];
  };
}

function emptyResult(ok: boolean, message?: string): SyncResult {
  return {
    ok, ...(message ? { message } : {}),
    created: 0, updated: 0, skipped: 0,
    regions: 0, teams: 0, users: 0, owners_set: 0,
    usages_created: 0, usages_returned: 0,
  };
}

interface NetboxRefIds {
  siteId: number;
  deviceTypeId: number;
  serverRoleId: number;
  workstationRoleId: number;
}

@Injectable()
export class NetboxSyncService {
  private readonly logger = new Logger(NetboxSyncService.name);
  private running = false;
  private loggedUnconfigured = false;

  constructor(
    @InjectRepository(SerialNumber)
    private readonly serialRepo: Repository<SerialNumber>,
    @InjectRepository(Team)
    private readonly teamRepo: Repository<Team>,
    @InjectRepository(Storage)
    private readonly storageRepo: Repository<Storage>,
    @InjectRepository(Employee)
    private readonly empRepo: Repository<Employee>,
    @InjectRepository(StockUsage)
    private readonly usageRepo: Repository<StockUsage>,
    private readonly dataSource: DataSource,
    private readonly auditLogs: AuditLogsService,
  ) {}

  private get baseUrl(): string | null {
    const url = process.env.NETBOX_URL;
    if (!url || !url.trim()) return null;
    return url.trim().replace(/\/+$/, '');
  }

  private get token(): string | null {
    const token = process.env.NETBOX_TOKEN;
    return token && token.trim() ? token.trim() : null;
  }

  private get configured(): boolean {
    return this.baseUrl !== null && this.token !== null;
  }

  private get syncItemCodes(): string[] {
    const raw = process.env.NETBOX_SYNC_ITEM_CODES || DEFAULT_ITEM_CODES;
    return raw.split(',').map((c) => c.trim()).filter(Boolean);
  }

  private assertWrite(user: Employee) {
    if (!WRITE_ROLES.includes(user.man_roll)) {
      throw new ForbiddenException('ERR_AUTH_006: 관리자만 수행할 수 있습니다');
    }
  }

  // ─────────────────────── NetBox HTTP helpers ───────────────────────

  private async netboxRequest(
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    body?: unknown,
  ): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`NetBox ${method} ${path} HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      if (res.status === 204) return null;
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  /** slug로 단일 객체 id 조회 (없으면 null) */
  private async lookupIdBySlug(listPath: string, slug: string): Promise<number | null> {
    const body = await this.netboxRequest('GET', `${listPath}?slug=${encodeURIComponent(slug)}`);
    const first = body?.results?.[0];
    return first?.id != null ? Number(first.id) : null;
  }

  /** 사이트 / 디바이스타입 / 역할 id 일괄 해석. 하나라도 없으면 null 반환. */
  private async resolveRefs(): Promise<{ refs?: NetboxRefIds; message?: string }> {
    const lookups: Array<[string, string, string]> = [
      ['site', '/api/dcim/sites/', SITE_SLUG],
      ['device-type', '/api/dcim/device-types/', DEVICE_TYPE_SLUG],
      ['role(server)', '/api/dcim/device-roles/', ROLE_SLUG_SERVER],
      ['role(workstation)', '/api/dcim/device-roles/', ROLE_SLUG_WORKSTATION],
    ];
    const ids: number[] = [];
    for (const [label, path, slug] of lookups) {
      let id: number | null;
      try {
        id = await this.lookupIdBySlug(path, slug);
      } catch (err) {
        return { message: `NetBox ${label} 조회 실패 (slug=${slug}): ${(err as Error)?.message ?? err}` };
      }
      if (id === null) {
        return { message: `NetBox에 ${label} (slug=${slug})이 없습니다. 먼저 생성하세요.` };
      }
      ids.push(id);
    }
    return {
      refs: {
        siteId: ids[0],
        deviceTypeId: ids[1],
        serverRoleId: ids[2],
        workstationRoleId: ids[3],
      },
    };
  }

  // ─────────────────────────── Sync ───────────────────────────

  /** 수동 실행 (MASTER/ADMIN 전용) */
  async runManual(user: Employee): Promise<SyncResult> {
    this.assertWrite(user);
    return this.runSync();
  }

  async runSync(): Promise<SyncResult> {
    if (!this.configured) {
      return emptyResult(false, 'NetBox 연동이 설정되지 않았습니다 (NETBOX_URL/NETBOX_TOKEN)');
    }
    if (this.running) {
      return emptyResult(false, '동기화가 이미 실행 중입니다');
    }
    this.running = true;
    try {
      return await this.doSync();
    } finally {
      this.running = false;
    }
  }

  private async doSync(): Promise<SyncResult> {
    const { refs, message } = await this.resolveRefs();
    if (!refs) {
      this.logger.warn(`NetBox sync aborted: ${message}`);
      return emptyResult(false, message);
    }

    // 동기화 대상: 지정 품목코드 + CANCELLED 제외 (매핑되는 상태만)
    const serials = await this.serialRepo.find({
      where: {
        item_code: In(this.syncItemCodes),
        status: In([SerialStatus.STOCK, SerialStatus.USED, SerialStatus.SHIPPED]),
      },
      relations: ['item'],
      order: { serial_no: 'ASC' },
    });

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const serial of serials) {
      const nbStatus = STATUS_MAP[serial.status];
      if (!nbStatus) {
        skipped += 1;
        continue;
      }
      const roleId = serial.item_code === WORKSTATION_ITEM_CODE
        ? refs.workstationRoleId
        : refs.serverRoleId;
      try {
        // serial 필드 우선 매칭 — 랙 장비에 시리얼이 등록돼 있으면 그 장비를 갱신 대상으로 사용
        // (name 매칭만 쓰면 사람이 이름 지은 랙 장비와 별개로 시리얼명 장비가 중복 생성됨)
        // S/N + 장비번호(asset_no) 두 값으로 순차 조회
        const candidates = [...new Set(
          [serial.serial_no, serial.asset_no]
            .map((v) => (v ?? '').trim())
            .filter((v) => v.length > 0),
        )];
        let existing: any = null;
        for (const field of ['serial', 'name'] as const) {
          for (const cand of candidates) {
            const found = await this.netboxRequest(
              'GET',
              `/api/dcim/devices/?${field}=${encodeURIComponent(cand)}`,
            );
            if (found?.results?.[0]) { existing = found.results[0]; break; }
          }
          if (existing) break;
        }

        if (!existing) {
          // 신규 생성 — 랙/위치 미지정 (NetBox에서 수동 배치)
          await this.netboxRequest('POST', '/api/dcim/devices/', {
            name: serial.serial_no,
            serial: serial.serial_no,
            device_type: refs.deviceTypeId,
            role: roleId,
            site: refs.siteId,
            status: nbStatus,
            comments: `IMS 동기화: ${serial.item?.item_name ?? serial.item_code}`,
          });
          created += 1;
          continue;
        }

        // 기존 디바이스 — status(그리고 비어있는 serial)만 갱신. 랙/위치/이름은 절대 변경하지 않음.
        const currentStatus: string | undefined = existing?.status?.value ?? existing?.status;
        const patch: Record<string, unknown> = {};
        const statusChanged = currentStatus !== nbStatus;
        if (statusChanged) patch.status = nbStatus;
        if (!existing.serial) patch.serial = serial.serial_no;

        if (Object.keys(patch).length > 0) {
          await this.netboxRequest('PATCH', `/api/dcim/devices/${existing.id}/`, patch);
        }
        if (statusChanged) updated += 1;
        else skipped += 1;
      } catch (err) {
        const msg = `${serial.serial_no}: ${(err as Error)?.message ?? err}`;
        this.logger.error(`NetBox sync failed for ${msg}`);
        errors.push(msg);
      }
    }

    // ── 보강 동기화 (마스터데이터 / 장비 owner / 연결 기반 사용중) ──
    const notes: string[] = [];

    // Phase 1 — 마스터데이터 동기화 (ITAM → NetBox)
    const master = await this.syncMasterData(errors);

    // Phase 2 — dc-infra 장비 owner 지정 (비어있는 경우만)
    const devices = await this.fetchDcInfraDevices(errors);
    const ownersSet = await this.assignDeviceOwners(devices, master.ownerIds, errors);

    // Phase 3 — 연결 기반 사용중 동기화 (NetBox → ITAM)
    const usage = await this.syncConnectedUsages(devices, errors, notes);

    const messageParts: string[] = [];
    if (errors.length > 0) messageParts.push(`${errors.length}건 실패: ${errors.slice(0, 3).join('; ')}`);
    if (notes.length > 0) messageParts.push(`스킵: ${notes.slice(0, 3).join('; ')}${notes.length > 3 ? ` 외 ${notes.length - 3}건` : ''}`);

    const result: SyncResult = {
      ok: errors.length === 0,
      created,
      updated,
      skipped,
      regions: master.regions,
      teams: master.teams,
      users: master.users,
      owners_set: ownersSet,
      usages_created: usage.created,
      usages_returned: usage.returned,
      ...(messageParts.length > 0 ? { message: messageParts.join(' / ') } : {}),
      details: {
        usagesCreated: usage.createdList,
        usagesReturned: usage.returnedList,
        notes,
        errors,
      },
    };
    this.logger.log(
      `NetBox sync done: created=${created} updated=${updated} skipped=${skipped} ` +
      `regions=${master.regions} teams=${master.teams} users=${master.users} owners_set=${ownersSet} ` +
      `usages_created=${usage.created} usages_returned=${usage.returned} errors=${errors.length}`,
    );
    // 보강 단계(마스터데이터/owner/usage)의 실패는 배열에만 쌓이고 로그가 없어 원인 추적이 어려웠다.
    // 실패 전문을 남겨 이후 디버깅이 가능하도록 한다.
    if (errors.length > 0) {
      this.logger.warn(`NetBox sync errors (${errors.length}):\n  - ${errors.join('\n  - ')}`);
    }
    return result;
  }

  // ─────────────── Phase 1: 마스터데이터 동기화 (ITAM → NetBox) ───────────────

  /** name으로 조회 후 없으면 생성. {id, created} 반환 */
  private async ensureByName(
    listPath: string,
    name: string,
    createBody: Record<string, unknown>,
  ): Promise<{ id: number; created: boolean }> {
    const found = await this.netboxRequest('GET', `${listPath}?name=${encodeURIComponent(name)}`);
    const first = found?.results?.[0];
    if (first?.id != null) return { id: Number(first.id), created: false };
    const createdObj = await this.netboxRequest('POST', listPath, createBody);
    return { id: Number(createdObj.id), created: true };
  }

  private async syncMasterData(errors: string[]): Promise<{
    regions: number;
    teams: number;
    users: number;
    groupIds: Map<string, number>;
    ownerIds: Map<string, number>;
  }> {
    let regions = 0;
    let teams = 0;
    let users = 0;
    const groupIds = new Map<string, number>();
    const ownerIds = new Map<string, number>();

    // 1) Regions ← 창고
    let storages: Storage[] = [];
    try {
      storages = await this.storageRepo.find({ where: { is_active: 1 } });
    } catch (err) {
      errors.push(`창고 조회 실패: ${(err as Error)?.message ?? err}`);
    }
    for (const st of storages) {
      try {
        const r = await this.ensureByName('/api/dcim/regions/', st.storage_name, {
          name: st.storage_name,
          slug: st.storage_code.toLowerCase(),
        });
        if (r.created) regions += 1;
      } catch (err) {
        errors.push(`region(${st.storage_name}): ${(err as Error)?.message ?? err}`);
      }
    }

    // 2) 팀 → user Group + OwnerGroup + Owner
    let teamRows: Team[] = [];
    try {
      teamRows = await this.teamRepo.find({ where: { is_active: 1 } });
    } catch (err) {
      errors.push(`팀 조회 실패: ${(err as Error)?.message ?? err}`);
    }
    for (const team of teamRows) {
      try {
        const group = await this.ensureByName('/api/users/groups/', team.team_name, {
          name: team.team_name,
        });
        groupIds.set(team.team_name, group.id);

        const ownerGroup = await this.ensureByName('/api/users/owner-groups/', team.team_name, {
          name: team.team_name,
          description: team.description ?? '',
        });

        const owner = await this.ensureByName('/api/users/owners/', team.team_name, {
          name: team.team_name,
          group: ownerGroup.id,
          user_groups: [group.id],
          description: team.description ?? '',
        });
        ownerIds.set(team.team_name, owner.id);

        if (group.created || ownerGroup.created || owner.created) teams += 1;
      } catch (err) {
        errors.push(`팀(${team.team_name}): ${(err as Error)?.message ?? err}`);
      }
    }

    // 3) Users ← 직원 (이미 존재하면 절대 수정하지 않음, admin 계정 제외)
    let employees: Employee[] = [];
    try {
      employees = await this.empRepo.find({ where: { is_active: 1 } });
    } catch (err) {
      errors.push(`직원 조회 실패: ${(err as Error)?.message ?? err}`);
    }
    for (const emp of employees) {
      const username = emp.man_id;
      if (!username || username.toLowerCase() === 'admin') continue;
      try {
        const found = await this.netboxRequest(
          'GET',
          `/api/users/users/?username=${encodeURIComponent(username)}`,
        );
        if (found?.results?.[0]) continue; // 기존 사용자는 건드리지 않음
        const groupId = groupIds.get(emp.man_team);
        await this.netboxRequest('POST', '/api/users/users/', {
          username,
          first_name: emp.name,
          email: emp.email ?? '',
          is_active: true,
          // NetBox user 생성 시 password 필수. 실제 인증은 SSO로 하므로
          // 로컬 비밀번호는 사용 불가한 랜덤값으로 채운다 (아무도 로그인에 쓰지 않음).
          password: randomBytes(24).toString('base64'),
          ...(groupId != null ? { groups: [groupId] } : {}),
        });
        users += 1;
      } catch (err) {
        errors.push(`user(${username}): ${(err as Error)?.message ?? err}`);
      }
    }

    return { regions, teams, users, groupIds, ownerIds };
  }

  // ─────────────── Phase 2: dc-infra 장비 owner 지정 ───────────────

  /** 장비명 규칙 → 팀명 (dev-* → 개발팀, ai-* → AI팀, 그 외 → 인프라팀) */
  private ownerTeamByRule(deviceName: string | null | undefined): string {
    const n = (deviceName ?? '').toLowerCase();
    if (n.startsWith('dev-')) return OWNER_RULE_DEV_TEAM;
    if (n.startsWith('ai-')) return OWNER_RULE_AI_TEAM;
    return OWNER_RULE_DEFAULT_TEAM;
  }

  private async fetchDcInfraDevices(errors: string[]): Promise<any[]> {
    try {
      const body = await this.netboxRequest('GET', `/api/dcim/devices/?site=${SITE_SLUG}&limit=300`);
      return Array.isArray(body?.results) ? body.results : [];
    } catch (err) {
      errors.push(`dc-infra 장비 목록 조회 실패: ${(err as Error)?.message ?? err}`);
      return [];
    }
  }

  private async assignDeviceOwners(
    devices: any[],
    ownerIds: Map<string, number>,
    errors: string[],
  ): Promise<number> {
    let ownersSet = 0;
    for (const device of devices) {
      if (device.owner != null) continue; // 기존 owner는 절대 덮어쓰지 않음
      const teamName = this.ownerTeamByRule(device.name);
      try {
        let ownerId = ownerIds.get(teamName);
        if (ownerId == null) {
          // Phase 1 캐시에 없으면 NetBox에서 직접 조회 (IMS에 없는 팀일 수 있음)
          const found = await this.netboxRequest(
            'GET',
            `/api/users/owners/?name=${encodeURIComponent(teamName)}`,
          );
          const first = found?.results?.[0];
          if (first?.id == null) {
            errors.push(`owner(${device.name}): NetBox에 Owner '${teamName}'가 없습니다`);
            continue;
          }
          ownerId = Number(first.id);
          ownerIds.set(teamName, ownerId);
        }
        await this.netboxRequest('PATCH', `/api/dcim/devices/${device.id}/`, { owner: ownerId });
        ownersSet += 1;
      } catch (err) {
        errors.push(`owner(${device.name}): ${(err as Error)?.message ?? err}`);
      }
    }
    return ownersSet;
  }

  // ─────────────── Phase 3: 연결 기반 사용중 동기화 (NetBox → ITAM) ───────────────

  /** 감사로그 actor — audit_logs.man_no가 employees FK이므로 첫 번째 MASTER 사번 사용 */
  private async resolveActorManNo(): Promise<string | null> {
    const master = await this.empRepo.findOne({
      where: { man_roll: 'MASTER' },
      order: { man_no: 'ASC' },
    });
    return master?.man_no ?? null;
  }

  /** NetBox device.serial → IMS serial_numbers 매칭 (S/N 또는 장비번호 일치).
   *  같은 값이 두 행에 걸리는 경우(장비번호-only 플레이스홀더 행: serial_no==asset_no vs
   *  실제 시리얼 행) 실제 시리얼 행을 우선하고, id로 결정적 정렬 — 정렬 없던 getOne이
   *  실행마다 다른 행을 반환해 매일 반납↔재등록이 반복되던 원인. */
  private async matchSerialRow(nbSerial: string): Promise<SerialNumber | null> {
    return this.serialRepo
      .createQueryBuilder('s')
      .where('s.status != :cancelled', { cancelled: SerialStatus.CANCELLED })
      .andWhere('(s.serial_no = :v OR s.asset_no = :v)', { v: nbSerial })
      .orderBy('CASE WHEN s.serial_no = s.asset_no THEN 1 ELSE 0 END', 'ASC')
      .addOrderBy('s.id', 'ASC')
      .getOne();
  }

  private async syncConnectedUsages(
    devices: any[],
    errors: string[],
    notes: string[],
  ): Promise<{ created: number; returned: number; createdList: string[]; returnedList: string[] }> {
    let created = 0;
    let returned = 0;
    const createdList: string[] = [];
    const returnedList: string[] = [];
    // 이번 실행에서 "연결 확인"된(=사용중 유지/생성) 시리얼 id. 이후 정합에 사용.
    const confirmed = new Set<number>();

    let actorManNo: string | null = null;
    try {
      actorManNo = await this.resolveActorManNo();
    } catch (err) {
      errors.push(`감사로그 actor 조회 실패: ${(err as Error)?.message ?? err}`);
    }

    for (const device of devices) {
      const nbSerial: string = (device.serial ?? '').trim();
      if (!nbSerial) continue;
      try {
        const serial = await this.matchSerialRow(nbSerial);
        if (!serial) continue;

        // 케이블 연결 여부
        const ifaces = await this.netboxRequest(
          'GET',
          `/api/dcim/interfaces/?device_id=${device.id}&cabled=true&limit=1`,
        );
        const connected = Number(ifaces?.count ?? 0) > 0;
        if (connected) confirmed.add(serial.id); // 연결 확인 — 정합에서 반납 대상 제외

        // 팀명: owner가 있으면 owner명, 없으면 Phase-2 규칙 (Phase 2에서 방금 지정한 경우 포함)
        const teamName: string =
          device.owner?.name ?? device.owner?.display ?? this.ownerTeamByRule(device.name);

        // 현재 활성 사용 건 (PENDING/COMPLETED & 미취소)
        let activeUsage: StockUsage | null = null;
        if (serial.usage_no) {
          const u = await this.usageRepo.findOne({ where: { usage_no: serial.usage_no } });
          if (u && ['PENDING', 'COMPLETED'].includes(u.status) && u.is_cancelled === 0) {
            activeUsage = u;
          }
        }

        if (connected && !activeUsage) {
          if (!serial.storage_code) {
            notes.push(`${serial.serial_no}: 창고 미지정으로 사용 등록 생략`);
            continue;
          }
          await this.dataSource.transaction(async (manager) => {
            const usage_no = await generateDocNo(manager, 'stock_usages', 'usage_no', 'USE');
            const usage = manager.create(StockUsage, {
              usage_no,
              item_code: serial.item_code,
              storage_code: serial.storage_code!,
              quantity: 1,
              serial_number_ids: [serial.id],
              // 자동 등록건은 기한 개념이 없어 무기한으로 둔다 (연결 해제 시 자동 반납)
              is_indefinite: 1,
              purpose: AUTO_USAGE_PURPOSE,
              use_man_no: null,
              use_name: teamName,
              is_cancelled: 0,
              status: 'PENDING',
            });
            await manager.save(usage);
            await manager.update(SerialNumber, { id: serial.id }, { usage_no });
            if (actorManNo) {
              await this.auditLogs.log(manager, {
                man_no: actorManNo,
                action: 'CREATE',
                table_name: 'stock_usages',
                new_value: usage_no,
              });
            }
          });
          created += 1;
          createdList.push(`${serial.serial_no} (${serial.item?.item_name ?? serial.item_code}) → ${teamName}`);
        }
        // 반납은 루프 안에서 하지 않는다 — 같은 시리얼이 여러 NetBox 장비(중복 등록)에
        // 걸리면 미연결 장비가 먼저 반납시키고 연결 장비가 재생성하는 반복이 생김.
        // 루프 뒤 정합 단계가 "이번 실행에서 연결 확인 안 된 건"만 일괄 반납한다.
      } catch (err) {
        errors.push(`연결동기화(${device.name ?? nbSerial}): ${(err as Error)?.message ?? err}`);
      }
    }

    // ── 정합: 이번 실행에서 연결 확인되지 않은 자동-사용중 건 반납 ──
    // (NetBox에서 장비가 삭제/변경돼 위 루프가 방문하지 못한 '고아' 사용중 포함)
    // 안전장치: 장비 목록을 실제로 받아온 경우에만 실행 (조회 실패로 빈 배열이면 전량 반납 방지)
    if (devices.length > 0) try {
      const orphans: StockUsage[] = await this.usageRepo
        .createQueryBuilder('u')
        .where('u.status = :st', { st: 'PENDING' })
        .andWhere('u.is_cancelled = 0')
        .andWhere('u.purpose LIKE :p', { p: `${AUTO_USAGE_PREFIX}%` })
        .getMany();
      for (const usage of orphans) {
        const sn = await this.serialRepo.findOne({ where: { usage_no: usage.usage_no } });
        if (sn && confirmed.has(sn.id)) continue; // 여전히 연결됨 → 유지
        await this.dataSource.transaction(async (manager) => {
          await manager.update(
            SerialNumber,
            { usage_no: usage.usage_no },
            { status: SerialStatus.STOCK, storage_code: usage.storage_code },
          );
          await manager.update(StockUsage, { usage_no: usage.usage_no }, { status: 'RETURNED' });
          if (actorManNo) {
            await this.auditLogs.log(manager, {
              man_no: actorManNo, action: 'STATUS_CHANGE', table_name: 'stock_usages',
              field: 'status', old_value: 'PENDING', new_value: 'RETURNED',
            });
          }
        });
        returned += 1;
        returnedList.push(`${sn?.serial_no ?? usage.usage_no} (${usage.item_code}) — 연결 해제 또는 NetBox 장비 없음`);
      }
    } catch (err) {
      errors.push(`사용중 정합 실패: ${(err as Error)?.message ?? err}`);
    }

    return { created, returned, createdList, returnedList };
  }

  // ─────────────────────────── Cron ───────────────────────────

  /** 매일 03:00 자동 동기화 */
  @Cron('0 3 * * *')
  async scheduledSync() {
    if (!this.configured) {
      if (!this.loggedUnconfigured) {
        this.logger.log('NetBox sync skipped: NETBOX_URL/NETBOX_TOKEN not configured');
        this.loggedUnconfigured = true;
      }
      return;
    }
    try {
      await this.runSync();
    } catch (err) {
      this.logger.error(`Scheduled NetBox sync failed: ${(err as Error)?.message ?? err}`);
    }
  }
}
