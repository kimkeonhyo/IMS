# IMS — Backend Design (NestJS)

## 기술 스택

| 항목 | 기술 |
|------|------|
| Framework | NestJS (v10) |
| ORM | TypeORM |
| DB | PostgreSQL 16 |
| Auth | JWT (passport-jwt) |
| Validation | class-validator / class-transformer |
| Docs | Swagger (@nestjs/swagger) |
| Test | Jest + Supertest |

---

## 프로젝트 구조

```
src/
├── main.ts
├── app.module.ts
│
├── common/
│   ├── decorators/
│   │   ├── roles.decorator.ts        # @Roles(Role.MASTER, Role.ADMIN)
│   │   ├── team-scope.decorator.ts   # @TeamScope()
│   │   └── current-user.decorator.ts # @CurrentUser()
│   ├── guards/
│   │   ├── jwt-auth.guard.ts
│   │   ├── roles.guard.ts            # ROLL 기반 권한
│   │   └── team-scope.guard.ts       # TEAM 기반 데이터 격리
│   ├── filters/
│   │   └── http-exception.filter.ts
│   ├── interceptors/
│   │   └── audit-log.interceptor.ts  # 자동 감사 로그
│   ├── pipes/
│   │   └── parse-uuid.pipe.ts
│   └── types/
│       ├── role.enum.ts
│       ├── team.enum.ts
│       └── jwt-payload.interface.ts
│
├── auth/
│   ├── auth.module.ts
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── strategies/
│   │   └── jwt.strategy.ts
│   └── dto/
│       ├── login.dto.ts
│       └── login-response.dto.ts
│
├── employees/
│   ├── employees.module.ts
│   ├── employees.controller.ts
│   ├── employees.service.ts
│   ├── entities/employee.entity.ts
│   └── dto/
│       ├── create-employee.dto.ts
│       └── update-employee.dto.ts
│
├── items/
│   ├── items.module.ts
│   ├── items.controller.ts
│   ├── items.service.ts
│   ├── entities/item.entity.ts
│   └── dto/
│
├── inventory/
│   ├── inventory.module.ts
│   ├── inventory.controller.ts
│   ├── inventory.service.ts
│   ├── entities/inventory.entity.ts
│   └── dto/
│
├── purchase-requests/
│   ├── purchase-requests.module.ts
│   ├── purchase-requests.controller.ts
│   ├── purchase-requests.service.ts
│   ├── entities/
│   │   ├── purchase-request.entity.ts
│   │   └── purchase-request-item.entity.ts
│   └── dto/
│
├── purchase-orders/
│   ├── purchase-orders.module.ts
│   ├── purchase-orders.controller.ts
│   ├── purchase-orders.service.ts
│   ├── entities/
│   │   ├── purchase-order.entity.ts
│   │   └── purchase-order-item.entity.ts
│   └── dto/
│
├── stock-receipts/
│   ├── stock-receipts.module.ts
│   ├── stock-receipts.controller.ts
│   ├── stock-receipts.service.ts
│   ├── entities/
│   │   ├── stock-receipt.entity.ts
│   │   └── stock-receipt-item.entity.ts
│   └── dto/
│
├── stock-movements/
│   ├── stock-movements.module.ts
│   ├── stock-movements.controller.ts
│   ├── stock-movements.service.ts
│   ├── entities/stock-movement.entity.ts
│   └── dto/
│
├── deliveries/
│   ├── deliveries.module.ts
│   ├── deliveries.controller.ts
│   ├── deliveries.service.ts
│   ├── entities/
│   │   ├── delivery.entity.ts
│   │   └── delivery-item.entity.ts
│   └── dto/
│
├── stock-usages/
│   ├── stock-usages.module.ts
│   ├── stock-usages.controller.ts
│   ├── stock-usages.service.ts
│   ├── entities/stock-usage.entity.ts
│   └── dto/
│
└── audit-logs/
    ├── audit-logs.module.ts
    ├── audit-logs.controller.ts
    ├── audit-logs.service.ts
    └── entities/audit-log.entity.ts
```

---

## REST API 엔드포인트

### Auth

| Method | Path | 권한 | 설명 |
|--------|------|------|------|
| POST | `/auth/login` | Public | 로그인, JWT 발급 |
| POST | `/auth/logout` | JWT | 로그아웃 (클라이언트 토큰 삭제) |
| GET | `/auth/me` | JWT | 현재 로그인 사용자 정보 |

### Employees (직원 관리)

| Method | Path | 권한 | 설명 |
|--------|------|------|------|
| GET | `/employees` | MASTER/ADMIN | 직원 목록 조회 |
| GET | `/employees/:id` | MASTER/ADMIN | 직원 상세 조회 |
| POST | `/employees` | MASTER | 직원 등록 |
| PATCH | `/employees/:id` | MASTER | 직원 정보 수정 |
| DELETE | `/employees/:id` | MASTER | 직원 비활성화 |

### Items (품목 마스터)

| Method | Path | 권한 | 설명 |
|--------|------|------|------|
| GET | `/items` | ALL | 품목 목록 |
| GET | `/items/:id` | ALL | 품목 상세 |
| POST | `/items` | MASTER/ADMIN | 품목 등록 |
| PATCH | `/items/:id` | MASTER/ADMIN | 품목 수정 |
| DELETE | `/items/:id` | MASTER | 품목 삭제 |

### Inventory (재고 현황)

| Method | Path | 권한 | 설명 |
|--------|------|------|------|
| GET | `/inventory` | ALL | 재고 현황 목록 (팀 스코프 적용) |
| GET | `/inventory/:id` | ALL | 재고 상세 |
| GET | `/inventory/summary` | ALL | 재고 요약 (품목별 합산) |

### Purchase Requests (구매요청 — Flow 1)

| Method | Path | 권한 | 설명 |
|--------|------|------|------|
| GET | `/purchase-requests` | ALL | 구매요청 목록 (팀 스코프) |
| GET | `/purchase-requests/:id` | ALL | 구매요청 상세 |
| POST | `/purchase-requests` | ALL | 구매요청 생성 (DRAFT) |
| PATCH | `/purchase-requests/:id` | 요청자/ADMIN | 구매요청 수정 (DRAFT 상태만) |
| DELETE | `/purchase-requests/:id` | 요청자/ADMIN | 구매요청 삭제 (DRAFT 상태만) |
| POST | `/purchase-requests/:id/submit` | 요청자 | 상태 변경: DRAFT → PENDING |
| POST | `/purchase-requests/:id/approve` | ADMIN/MASTER | 상태 변경: PENDING → APPROVED |
| POST | `/purchase-requests/:id/reject` | ADMIN/MASTER | 상태 변경: PENDING → DRAFT (반려) |

### Purchase Orders (발주 — Flow 1)

| Method | Path | 권한 | 설명 |
|--------|------|------|------|
| GET | `/purchase-orders` | ALL | 발주 목록 (팀 스코프) |
| GET | `/purchase-orders/:id` | ALL | 발주 상세 |
| POST | `/purchase-orders` | ADMIN/MASTER | 발주 생성 (구매요청 APPROVED 필요) |
| PATCH | `/purchase-orders/:id` | ADMIN/MASTER | 발주 수정 (PENDING 상태만) |
| POST | `/purchase-orders/:id/confirm` | ADMIN/MASTER | PENDING → CONFIRMED |
| POST | `/purchase-orders/:id/ship` | ADMIN/MASTER | CONFIRMED → SHIPPED |
| POST | `/purchase-orders/:id/cancel` | ADMIN/MASTER | → CANCELLED |

### Stock Receipts (입고 — Flow 1)

| Method | Path | 권한 | 설명 |
|--------|------|------|------|
| GET | `/stock-receipts` | ALL | 입고 목록 (팀 스코프) |
| GET | `/stock-receipts/:id` | ALL | 입고 상세 |
| POST | `/stock-receipts` | ADMIN/MASTER | 입고 처리 (재고 증가 트랜잭션) |

### Stock Movements (재고이동 — Flow 2)

| Method | Path | 권한 | 설명 |
|--------|------|------|------|
| GET | `/stock-movements` | ALL | 재고이동 목록 (팀 스코프) |
| GET | `/stock-movements/:id` | ALL | 재고이동 상세 |
| POST | `/stock-movements` | ALL | 이동 요청 생성 (PENDING) |
| POST | `/stock-movements/:id/approve` | ADMIN/MASTER | PENDING → APPROVED |
| POST | `/stock-movements/:id/move` | ADMIN/MASTER | APPROVED → MOVED (재고 이동 처리) |
| POST | `/stock-movements/:id/reject` | ADMIN/MASTER | PENDING → 반려 |

### Deliveries (납품 — Flow 3)

| Method | Path | 권한 | 설명 |
|--------|------|------|------|
| GET | `/deliveries` | ALL | 납품 목록 (팀 스코프) |
| GET | `/deliveries/:id` | ALL | 납품 상세 |
| POST | `/deliveries` | ALL | 납품 생성 (PENDING) |
| POST | `/deliveries/:id/start` | 생성자/ADMIN | PENDING → IN_PROGRESS |
| POST | `/deliveries/:id/deliver` | 생성자/ADMIN | IN_PROGRESS → DELIVERED |
| POST | `/deliveries/:id/approve` | ADMIN/MASTER | DELIVERED → APPROVED (재고 차감) |
| POST | `/deliveries/:id/consume` | ADMIN/MASTER | APPROVED → CONSUMED |

### Stock Usages (재고사용 — Flow 4)

| Method | Path | 권한 | 설명 |
|--------|------|------|------|
| GET | `/stock-usages` | ALL | 재고사용 목록 (팀 스코프) |
| GET | `/stock-usages/:id` | ALL | 재고사용 상세 |
| POST | `/stock-usages` | ALL | 재고사용 등록 (즉시 차감) |
| POST | `/stock-usages/:id/cancel` | MASTER only | 사용 취소 (재고 복구) |

### Audit Logs (감사 로그)

| Method | Path | 권한 | 설명 |
|--------|------|------|------|
| GET | `/audit-logs` | MASTER/ADMIN | 감사 로그 목록 (필터: 테이블, 날짜범위, 처리자) |
| GET | `/audit-logs/:id` | MASTER/ADMIN | 감사 로그 상세 |

---

## 핵심 코드 예시

### JWT Strategy

```typescript
// src/auth/strategies/jwt.strategy.ts
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private employeesService: EmployeesService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  async validate(payload: JwtPayload): Promise<Employee> {
    const employee = await this.employeesService.findById(payload.sub);
    if (!employee || !employee.is_active) {
      throw new UnauthorizedException('ERR_AUTH_001');
    }
    return employee;
  }
}
```

### Roles Guard (ROLL 기반)

```typescript
// src/common/guards/roles.guard.ts
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles) return true;

    const { user } = context.switchToHttp().getRequest();
    const roleHierarchy = { MASTER: 0, ADMIN: 1, USER: 2 };
    const userLevel = roleHierarchy[user.man_roll];

    return requiredRoles.some(role => roleHierarchy[role] >= userLevel);
  }
}
```

### Team Scope Guard (팀 데이터 격리)

```typescript
// src/common/guards/team-scope.guard.ts
@Injectable()
export class TeamScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user: Employee = request.user;

    // 경영지원팀 또는 MASTER: 전체 접근
    if (user.man_team === Team.MANAGEMENT_SUPPORT || user.man_roll === Role.MASTER) {
      return true;
    }

    // 그 외: 쿼리에 팀 스코프 주입
    request.teamScope = user.man_team;
    return true;
  }
}
```

### Purchase Request Service (상태머신)

```typescript
// src/purchase-requests/purchase-requests.service.ts
@Injectable()
export class PurchaseRequestsService {
  constructor(
    @InjectRepository(PurchaseRequest)
    private readonly prRepo: Repository<PurchaseRequest>,
    private readonly auditLogService: AuditLogService,
    private readonly dataSource: DataSource,
  ) {}

  async submit(id: string, requester: Employee): Promise<PurchaseRequest> {
    const pr = await this.prRepo.findOneOrFail({ where: { id } });

    // 상태 검증
    if (pr.status !== PurchaseRequestStatus.DRAFT) {
      throw new BadRequestException('ERR_FLOW_001: 현재 상태에서 제출할 수 없습니다');
    }

    // 요청자 본인 확인
    if (pr.requester_id !== requester.id && requester.man_roll !== Role.MASTER) {
      throw new ForbiddenException('ERR_AUTH_003');
    }

    return this.dataSource.transaction(async (manager) => {
      const oldStatus = pr.status;
      pr.status = PurchaseRequestStatus.PENDING;
      const updated = await manager.save(pr);

      await this.auditLogService.log(manager, {
        action: AuditAction.STATUS_CHANGE,
        table_name: 'purchase_requests',
        record_id: pr.id,
        field: 'status',
        old_value: oldStatus,
        new_value: updated.status,
        performed_by_id: requester.id,
      });

      return updated;
    });
  }

  async approve(id: string, approver: Employee): Promise<PurchaseRequest> {
    // ADMIN 이상만 승인 가능 (RolesGuard에서 1차 검증)
    const pr = await this.prRepo.findOneOrFail({ where: { id } });

    if (pr.status !== PurchaseRequestStatus.PENDING) {
      throw new BadRequestException('ERR_FLOW_001');
    }

    return this.dataSource.transaction(async (manager) => {
      const oldStatus = pr.status;
      pr.status = PurchaseRequestStatus.APPROVED;
      pr.approver_id = approver.id;
      pr.approved_at = new Date();
      const updated = await manager.save(pr);

      await this.auditLogService.log(manager, {
        action: AuditAction.STATUS_CHANGE,
        table_name: 'purchase_requests',
        record_id: pr.id,
        field: 'status',
        old_value: oldStatus,
        new_value: updated.status,
        performed_by_id: approver.id,
      });

      return updated;
    });
  }
}
```

### Stock Usage Service (즉시 차감 + 비관적 락)

```typescript
// src/stock-usages/stock-usages.service.ts
@Injectable()
export class StockUsagesService {
  async create(dto: CreateStockUsageDto, user: Employee): Promise<StockUsage> {
    return this.dataSource.transaction(async (manager) => {
      // 비관적 락으로 재고 조회
      const inventory = await manager
        .createQueryBuilder(Inventory, 'inv')
        .setLock('pessimistic_write')
        .where('inv.item_id = :itemId AND inv.location = :location', {
          itemId: dto.item_id,
          location: dto.location,
        })
        .getOne();

      if (!inventory) {
        throw new NotFoundException('ERR_INV_001: 해당 보관장소에 재고가 없습니다');
      }

      if (inventory.quantity < dto.quantity) {
        throw new BadRequestException(
          `ERR_INV_002: 재고 부족 (현재: ${inventory.quantity}, 요청: ${dto.quantity})`
        );
      }

      // 재고 차감
      inventory.quantity -= dto.quantity;
      await manager.save(inventory);

      // 사용 기록 생성
      const usage = manager.create(StockUsage, {
        ...dto,
        usage_no: await this.generateUsageNo(),
        used_by_id: user.id,
        is_cancelled: false,
      });
      const saved = await manager.save(usage);

      // 감사 로그
      await this.auditLogService.log(manager, {
        action: AuditAction.CREATE,
        table_name: 'stock_usages',
        record_id: saved.id,
        field: 'quantity',
        old_value: String(inventory.quantity + dto.quantity),
        new_value: String(inventory.quantity),
        performed_by_id: user.id,
      });

      return saved;
    });
  }

  async cancel(id: string, master: Employee): Promise<StockUsage> {
    // MASTER 권한 검증 (RolesGuard 에서 처리)
    return this.dataSource.transaction(async (manager) => {
      const usage = await manager.findOneOrFail(StockUsage, { where: { id } });

      if (usage.is_cancelled) {
        throw new BadRequestException('ERR_FLOW_003: 이미 취소된 사용 내역입니다');
      }

      // 재고 복구
      const inventory = await manager
        .createQueryBuilder(Inventory, 'inv')
        .setLock('pessimistic_write')
        .where('inv.item_id = :itemId AND inv.location = :location', {
          itemId: usage.item_id,
          location: usage.location,
        })
        .getOne();

      if (inventory) {
        inventory.quantity += usage.quantity;
        await manager.save(inventory);
      }

      // 취소 처리
      usage.is_cancelled = true;
      usage.cancelled_by_id = master.id;
      usage.cancelled_at = new Date();
      usage.cancel_reason = dto.cancel_reason;
      const saved = await manager.save(usage);

      await this.auditLogService.log(manager, {
        action: AuditAction.STATUS_CHANGE,
        table_name: 'stock_usages',
        record_id: saved.id,
        field: 'is_cancelled',
        old_value: 'false',
        new_value: 'true',
        performed_by_id: master.id,
      });

      return saved;
    });
  }
}
```

### Delivery Service (납품 승인 시 재고 차감)

```typescript
// src/deliveries/deliveries.service.ts
async approve(id: string, approver: Employee): Promise<Delivery> {
  return this.dataSource.transaction(async (manager) => {
    const delivery = await manager.findOneOrFail(Delivery, {
      where: { id },
      relations: ['items'],
    });

    if (delivery.status !== DeliveryStatus.DELIVERED) {
      throw new BadRequestException('ERR_FLOW_001');
    }

    // 품목별 재고 차감 (비관적 락)
    for (const item of delivery.items) {
      const inventory = await manager
        .createQueryBuilder(Inventory, 'inv')
        .setLock('pessimistic_write')
        .where('inv.item_id = :itemId AND inv.location = :location', {
          itemId: item.item_id,
          location: item.location,
        })
        .getOne();

      if (!inventory || inventory.quantity < item.quantity) {
        throw new BadRequestException(
          `ERR_INV_002: 품목 [${item.item_id}] 재고 부족`
        );
      }

      inventory.quantity -= item.quantity;
      await manager.save(inventory);
    }

    delivery.status = DeliveryStatus.APPROVED;
    delivery.approved_by_id = approver.id;
    delivery.approved_at = new Date();
    const saved = await manager.save(delivery);

    await this.auditLogService.log(manager, {
      action: AuditAction.STATUS_CHANGE,
      table_name: 'deliveries',
      record_id: saved.id,
      field: 'status',
      old_value: DeliveryStatus.DELIVERED,
      new_value: DeliveryStatus.APPROVED,
      performed_by_id: approver.id,
    });

    return saved;
  });
}
```

---

## 에러 코드 정의

### 인증/권한 에러 (ERR_AUTH)

| 코드 | HTTP | 설명 |
|------|------|------|
| ERR_AUTH_001 | 401 | 유효하지 않은 토큰 또는 비활성 계정 |
| ERR_AUTH_002 | 401 | 토큰 만료 |
| ERR_AUTH_003 | 403 | 본인 데이터만 접근 가능 |
| ERR_AUTH_004 | 403 | ROLL 권한 부족 |
| ERR_AUTH_005 | 403 | 팀 스코프 외 데이터 접근 시도 |
| ERR_AUTH_006 | 403 | MASTER 전용 기능 접근 시도 |
| ERR_AUTH_007 | 401 | 로그인 실패 (아이디/비밀번호 불일치) |

### 유효성 에러 (ERR_VALID)

| 코드 | HTTP | 설명 |
|------|------|------|
| ERR_VALID_001 | 400 | 필수 필드 누락 |
| ERR_VALID_002 | 400 | 수량은 1 이상이어야 합니다 |
| ERR_VALID_003 | 400 | 사유(reason)는 필수입니다 |
| ERR_VALID_004 | 400 | 유효하지 않은 UUID 형식 |
| ERR_VALID_005 | 400 | 중복된 품목코드 |
| ERR_VALID_006 | 422 | 출발지와 목적지가 동일합니다 (재고이동) |

### 비즈니스 플로우 에러 (ERR_FLOW)

| 코드 | HTTP | 설명 |
|------|------|------|
| ERR_FLOW_001 | 409 | 현재 상태에서 해당 작업 불가 (상태머신 위반) |
| ERR_FLOW_002 | 409 | 이미 발주가 생성된 구매요청 |
| ERR_FLOW_003 | 409 | 이미 취소된 항목 |

### 재고 에러 (ERR_INV)

| 코드 | HTTP | 설명 |
|------|------|------|
| ERR_INV_001 | 404 | 해당 보관장소에 재고 없음 |
| ERR_INV_002 | 400 | 재고 수량 부족 |
| ERR_INV_003 | 404 | 품목을 찾을 수 없음 |

### 리소스 에러 (ERR_RES)

| 코드 | HTTP | 설명 |
|------|------|------|
| ERR_RES_001 | 404 | 리소스를 찾을 수 없음 |
| ERR_RES_002 | 409 | 이미 존재하는 리소스 |

---

## 공통 응답 형식

### 성공 응답

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

### 에러 응답

```json
{
  "success": false,
  "error": {
    "code": "ERR_INV_002",
    "message": "재고 수량 부족 (현재: 5, 요청: 10)",
    "field": "quantity"
  },
  "timestamp": "2026-04-02T09:00:00Z"
}
```

---

## 페이지네이션 공통 DTO

```typescript
// src/common/dto/pagination.dto.ts
export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  sortBy?: string = 'created_at';

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC' = 'DESC';
}
```

---

## 환경 변수 (.env)

```env
# DB
DATABASE_URL=postgresql://<DB_USER>:<DB_PASSWORD>@localhost:5432/ims

# JWT
JWT_SECRET=<JWT_SECRET>
JWT_EXPIRES_IN=8h

# App
PORT=3000
NODE_ENV=development

# Pagination
DEFAULT_PAGE_LIMIT=20
MAX_PAGE_LIMIT=100
```

---

## 권한 매트릭스 요약

| 기능 | USER | ADMIN | MASTER |
|------|------|-------|--------|
| 품목 조회 | ✅ | ✅ | ✅ |
| 품목 등록/수정 | ❌ | ✅ | ✅ |
| 품목 삭제 | ❌ | ❌ | ✅ |
| 구매요청 생성 | ✅ | ✅ | ✅ |
| 구매요청 승인 | ❌ | ✅ | ✅ |
| 발주 생성/수정 | ❌ | ✅ | ✅ |
| 입고 처리 | ❌ | ✅ | ✅ |
| 재고이동 요청 | ✅ | ✅ | ✅ |
| 재고이동 승인 | ❌ | ✅ | ✅ |
| 납품 생성 | ✅ | ✅ | ✅ |
| 납품 승인 | ❌ | ✅ | ✅ |
| 재고사용 등록 | ✅ | ✅ | ✅ |
| 재고사용 취소 | ❌ | ❌ | ✅ |
| 직원 관리 | ❌ | ✅ | ✅ |
| 직원 등록/삭제 | ❌ | ❌ | ✅ |
| 감사 로그 조회 | ❌ | ✅ | ✅ |

> 팀 스코프: 경영지원팀 / MASTER → 전체 데이터. 그 외 팀 → 소속 팀 데이터만.
