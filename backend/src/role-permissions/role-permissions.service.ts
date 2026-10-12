import { Injectable, BadRequestException, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { RolePermission } from './role-permission.entity';
import { Employee } from '../employees/employee.entity';
import { Role } from '../common/enums/role.enum';
import { ALL_PERMISSIONS } from '../common/enums/permission.enum';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

const ROLES: string[] = [Role.MASTER, Role.ADMIN, Role.USER];

@Injectable()
export class RolePermissionsService implements OnModuleInit {
  private readonly logger = new Logger(RolePermissionsService.name);
  /** 요청마다 DB를 치지 않도록 캐시 — 3행짜리 표라 갱신 시 통째로 비운다 */
  private cache: Map<string, string[]> | null = null;

  constructor(
    @InjectRepository(RolePermission) private readonly repo: Repository<RolePermission>,
    private readonly dataSource: DataSource,
    private readonly auditLogs: AuditLogsService,
  ) {}

  /** 최초 기동 시 1회 — 기존 사용자별 권한을 역할별로 합쳐 옮긴다 (아무도 권한을 잃지 않도록 합집합) */
  async onModuleInit() {
    const existing = await this.repo.count();
    if (existing > 0) return;

    const employees = await this.dataSource.getRepository(Employee).find();
    for (const role of ROLES) {
      let perms: string[];
      if (role === Role.MASTER) {
        perms = [...ALL_PERMISSIONS];
      } else {
        const union = new Set<string>();
        for (const e of employees) {
          if (e.man_roll !== role) continue;
          for (const p of e.permissions ?? []) {
            if ((ALL_PERMISSIONS as string[]).includes(p)) union.add(p);
          }
        }
        perms = [...union];
      }
      await this.repo.save(this.repo.create({ role, permissions: perms, updated_by: null }));
      this.logger.log(`역할 권한 초기화: ${role} — ${perms.length}개`);
    }
  }

  private async load(): Promise<Map<string, string[]>> {
    if (this.cache) return this.cache;
    const rows = await this.repo.find();
    const map = new Map<string, string[]>();
    // 폐지된 기능의 권한이 남아 있어도 판정에 쓰이지 않도록 현재 목록으로 거른다
    for (const r of rows) {
      map.set(r.role, (r.permissions ?? []).filter(p => (ALL_PERMISSIONS as string[]).includes(p)));
    }
    this.cache = map;
    return map;
  }

  /** 가드에서 쓰는 조회 — 역할에 부여된 권한 목록 */
  async permissionsFor(role: string): Promise<string[]> {
    const map = await this.load();
    return map.get(role) ?? [];
  }

  async has(role: string, permission: string): Promise<boolean> {
    if (role === Role.MASTER) return true;   // 잠금 방지 — MASTER는 항상 통과
    return (await this.permissionsFor(role)).includes(permission);
  }

  async findAll(): Promise<RolePermission[]> {
    const rows = await this.repo.find();
    for (const r of rows) {
      r.permissions = (r.permissions ?? []).filter(p => (ALL_PERMISSIONS as string[]).includes(p));
    }
    const byRole = new Map(rows.map(r => [r.role, r]));
    // 누락된 역할이 있어도 화면에서 설정할 수 있도록 빈 행을 채워 돌려준다
    return ROLES.map(role => byRole.get(role) ?? this.repo.create({ role, permissions: [], updated_by: null }));
  }

  async update(role: string, permissions: string[], actor: Employee): Promise<RolePermission> {
    if (!ROLES.includes(role)) {
      throw new BadRequestException(`ERR_VALID_010: 알 수 없는 역할입니다 (${role})`);
    }
    const invalid = permissions.filter(p => !(ALL_PERMISSIONS as string[]).includes(p));
    if (invalid.length) {
      throw new BadRequestException(`ERR_VALID_010: 알 수 없는 권한입니다 (${invalid.join(', ')})`);
    }
    // MASTER는 모든 권한을 갖는 것이 전제 — 축소를 허용하면 아무도 권한을 되돌릴 수 없게 된다
    const next = role === Role.MASTER ? [...ALL_PERMISSIONS] : [...new Set(permissions)];

    const row = (await this.repo.findOne({ where: { role } }))
      ?? this.repo.create({ role, permissions: [] });
    const before = row.permissions ?? [];
    row.permissions = next;
    row.updated_by = actor.man_no;
    const saved = await this.repo.save(row);
    this.cache = null;

    await this.auditLogs.log(this.dataSource.manager, {
      man_no: actor.man_no, action: 'UPDATE', table_name: 'role_permissions',
      field: role, old_value: JSON.stringify(before), new_value: JSON.stringify(next),
    });
    return saved;
  }
}
