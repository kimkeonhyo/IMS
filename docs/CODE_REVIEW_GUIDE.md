# IMS — Code Review Guide

## 보안 체크리스트

### 1. 인증 (Authentication)

- [ ] 모든 보호 엔드포인트에 `@UseGuards(JwtAuthGuard)` 적용 확인
- [ ] JWT Secret이 환경변수로만 관리되며 코드에 하드코딩되지 않음
- [ ] 토큰 만료 시간이 적절하게 설정됨 (기본 8h)
- [ ] 비활성 계정(`is_active = false`)은 유효한 토큰이어도 401 반환
- [ ] 비밀번호는 bcrypt(saltRounds ≥ 12) 해싱 저장, 평문 저장 절대 금지
- [ ] 로그인 실패 시 "아이디 없음"/"비밀번호 틀림" 구분 메시지 금지 (정보 노출 방지)

### 2. 권한 (Authorization — ROLL 기반)

- [ ] `@Roles()` 데코레이터 + `RolesGuard` 조합이 올바르게 적용됨
- [ ] 역할 계층: MASTER(0) > ADMIN(1) > USER(2) — 상위 역할이 하위 역할 기능 포함
- [ ] MASTER 전용 기능(직원 삭제, 재고사용 취소 등)에 `@Roles(Role.MASTER)` 명시
- [ ] 컨트롤러 레벨과 메서드 레벨 중복 적용 시 **더 엄격한 쪽** 우선 확인
- [ ] ROLL 변경은 MASTER만 가능, ADMIN이 자신을 MASTER로 승격 불가

```typescript
// ❌ 위험: ROLL 에스컬레이션 취약점
async updateEmployee(id: string, dto: UpdateEmployeeDto, user: Employee) {
  // user가 ADMIN인데 dto.man_roll = 'MASTER' 설정 가능한 경우
  return this.repo.update(id, dto);
}

// ✅ 안전: ROLL 변경 시 MASTER 검증
async updateEmployee(id: string, dto: UpdateEmployeeDto, user: Employee) {
  if (dto.man_roll && user.man_roll !== Role.MASTER) {
    throw new ForbiddenException('ERR_AUTH_006: 역할 변경은 MASTER만 가능합니다');
  }
  return this.repo.update(id, dto);
}
```

### 3. 팀 데이터 격리 (Team Scope)

- [ ] 경영지원팀(`MANAGEMENT_SUPPORT`) / MASTER → 전체 데이터 접근
- [ ] 그 외 모든 팀 → `WHERE team = :userTeam` 조건 강제 적용
- [ ] `request.teamScope` 주입이 `TeamScopeGuard`에서 처리되며, 서비스에서 직접 user.man_team을 파라미터로 받지 않음
- [ ] 타 팀 리소스 조회 시 404 (존재하지 않는 것처럼) 반환 — 403 대신 404로 존재 노출 방지

```typescript
// ❌ 위험: 팀 스코프 누락
async findAll(): Promise<PurchaseRequest[]> {
  return this.prRepo.find(); // 전체 팀 데이터 노출!
}

// ✅ 안전: 팀 스코프 적용
async findAll(teamScope?: Team): Promise<PurchaseRequest[]> {
  const where = teamScope ? { requester: { man_team: teamScope } } : {};
  return this.prRepo.find({ where, relations: ['requester'] });
}
```

### 4. SQL Injection 방지

- [ ] 모든 쿼리는 TypeORM의 파라미터 바인딩(`:param`) 사용
- [ ] `QueryBuilder` 사용 시 `.where('col = :val', { val })` 형태만 허용
- [ ] 사용자 입력을 템플릿 리터럴로 쿼리에 직접 삽입 절대 금지

```typescript
// ❌ 위험: SQL Injection
.where(`name = '${userInput}'`)

// ✅ 안전: 파라미터 바인딩
.where('name = :name', { name: userInput })
```

### 5. XSS / 입력 검증

- [ ] 모든 DTO에 `class-validator` 데코레이터 적용
- [ ] 문자열 필드에 `@IsString()`, `@MaxLength()` 제한
- [ ] HTML/스크립트 태그 입력 가능 필드는 `sanitize-html` 처리
- [ ] `@Transform(({ value }) => value?.trim())` 으로 공백 정규화

### 6. CSRF / CORS

- [ ] CORS origin 화이트리스트 관리 (`*` 사용 금지)
- [ ] 민감한 작업(상태 변경, 삭제)은 POST/PATCH/DELETE — GET 사용 금지
- [ ] `SameSite=Strict` 쿠키 설정 (JWT를 쿠키로 관리 시)

### 7. Rate Limiting

- [ ] 로그인 엔드포인트: 5회/분 제한 (brute force 방지)
- [ ] 일반 API: 100회/분/IP 제한
- [ ] `@nestjs/throttler` 설정 확인

---

## 권한 위반 시나리오 6가지

### 시나리오 1: ROLL 에스컬레이션

**상황**: ADMIN 사용자가 자신의 `man_roll`을 MASTER로 변경 시도

```
PUT /employees/:myId
{ "man_roll": "MASTER" }
```

**기대 결과**: `403 ERR_AUTH_006`

**검증 코드**:
```typescript
// employees.service.ts
if (dto.man_roll !== undefined) {
  if (requester.man_roll !== Role.MASTER) {
    throw new ForbiddenException('ERR_AUTH_006');
  }
  if (dto.man_roll === Role.MASTER && requester.id === id) {
    throw new ForbiddenException('ERR_AUTH_006: 자기 자신의 역할은 변경 불가');
  }
}
```

---

### 시나리오 2: 팀 간 데이터 접근

**상황**: A팀 USER가 B팀 구매요청 ID를 직접 URL로 접근

```
GET /purchase-requests/[B팀-PR-ID]
```

**기대 결과**: `404 ERR_RES_001` (403 대신 404 — 존재 자체를 숨김)

**검증 코드**:
```typescript
async findOne(id: string, user: Employee): Promise<PurchaseRequest> {
  const pr = await this.prRepo.findOne({
    where: {
      id,
      ...(this.isRestrictedTeam(user) ? { requester: { man_team: user.man_team } } : {}),
    },
  });
  if (!pr) throw new NotFoundException('ERR_RES_001');
  return pr;
}
```

---

### 시나리오 3: MASTER 전용 재고사용 취소

**상황**: ADMIN이 재고사용 취소 시도

```
POST /stock-usages/:id/cancel
Authorization: Bearer [ADMIN-TOKEN]
```

**기대 결과**: `403 ERR_AUTH_006`

**컨트롤러**:
```typescript
@Post(':id/cancel')
@Roles(Role.MASTER)  // MASTER만 허용
@UseGuards(JwtAuthGuard, RolesGuard)
cancel(@Param('id') id: string, @CurrentUser() user: Employee) {
  return this.stockUsagesService.cancel(id, user);
}
```

---

### 시나리오 4: 타인 구매요청 제출

**상황**: USER-A가 USER-B의 구매요청(DRAFT)을 제출 시도

```
POST /purchase-requests/[USER-B의-PR-ID]/submit
Authorization: Bearer [USER-A-TOKEN]
```

**기대 결과**: `403 ERR_AUTH_003`

**검증 코드**:
```typescript
async submit(id: string, requester: Employee) {
  const pr = await this.findOneWithScope(id, requester);

  if (pr.requester_id !== requester.id && requester.man_roll === Role.USER) {
    throw new ForbiddenException('ERR_AUTH_003: 본인 요청만 제출 가능합니다');
  }
  // ...
}
```

---

### 시나리오 5: 상태머신 우회

**상황**: DRAFT 상태의 구매요청을 submit 없이 바로 approve 시도

```
POST /purchase-requests/:id/approve
(PR.status = DRAFT)
```

**기대 결과**: `409 ERR_FLOW_001`

**검증 코드**:
```typescript
// 상태 전이 맵
const VALID_TRANSITIONS: Record<PurchaseRequestStatus, PurchaseRequestStatus[]> = {
  [PurchaseRequestStatus.DRAFT]: [PurchaseRequestStatus.PENDING],
  [PurchaseRequestStatus.PENDING]: [PurchaseRequestStatus.APPROVED, PurchaseRequestStatus.DRAFT],
  [PurchaseRequestStatus.APPROVED]: [PurchaseRequestStatus.ORDERED],
  [PurchaseRequestStatus.ORDERED]: [PurchaseRequestStatus.RECEIVED],
  [PurchaseRequestStatus.RECEIVED]: [],
};

function assertValidTransition(current: PurchaseRequestStatus, next: PurchaseRequestStatus) {
  if (!VALID_TRANSITIONS[current]?.includes(next)) {
    throw new ConflictException(`ERR_FLOW_001: ${current} → ${next} 전이 불가`);
  }
}
```

---

### 시나리오 6: 재고 음수 방지

**상황**: 재고 10개인데 15개 사용 요청

```
POST /stock-usages
{ "item_id": "...", "quantity": 15, "location": "창고A", "reason": "테스트" }
```

**기대 결과**: `400 ERR_INV_002`

**검증**: SELECT FOR UPDATE 후 수량 비교 필수 (동시성 고려)

---

## 코드 품질 기준

### 단일 책임 원칙 (SRP)

- 컨트롤러: HTTP 요청/응답 처리만 담당
- 서비스: 비즈니스 로직만 담당
- 리포지토리: 데이터 접근만 담당
- Guard: 권한 검증만 담당

```typescript
// ❌ 컨트롤러에 비즈니스 로직
@Post(':id/approve')
async approve(@Param('id') id: string, @CurrentUser() user: Employee) {
  const pr = await this.prRepo.findOne(id);
  if (pr.status !== 'PENDING') throw new BadRequestException();
  pr.status = 'APPROVED';
  await this.prRepo.save(pr);
  // ← 이 로직은 서비스에 있어야 함
}

// ✅ 컨트롤러는 위임만
@Post(':id/approve')
async approve(@Param('id') id: string, @CurrentUser() user: Employee) {
  return this.purchaseRequestsService.approve(id, user);
}
```

### 트랜잭션 경계

- 재고 변경이 수반되는 모든 작업은 트랜잭션 필수
- `dataSource.transaction()` 또는 `@Transactional()` 데코레이터 사용
- 트랜잭션 내 감사 로그 함께 저장 (원자성 보장)

### 의존성 주입 (DI)

- `new` 키워드로 서비스 직접 생성 금지
- 모든 의존성은 생성자 주입
- 순환 의존성 발생 시 `forwardRef()` 대신 구조 재설계 우선

---

## 리뷰 코멘트 템플릿

### 🔴 Critical (즉시 수정 필수)

```
[CRITICAL] 보안 취약점: 팀 스코프 미적용

현재 코드:
  return this.prRepo.find(); // 전체 데이터 반환

문제점:
  - 모든 팀의 구매요청이 노출됩니다
  - OWASP A01: Broken Access Control에 해당

수정 방향:
  - TeamScopeGuard에서 주입된 teamScope를 where 조건에 추가
  - 참고: docs/BACKEND_DESIGN.md #Team Scope Guard

우선순위: CRITICAL (배포 전 반드시 수정)
```

### 🟠 Major (다음 스프린트 전 수정)

```
[MAJOR] 동시성 이슈: 재고 차감 시 락 미사용

현재 코드:
  const inv = await this.invRepo.findOne({ where: { item_id } });
  inv.quantity -= dto.quantity;
  await this.invRepo.save(inv);

문제점:
  - Race condition 발생 가능
  - 동시 요청 시 재고 음수 발생 위험

수정 방향:
  - SELECT FOR UPDATE (pessimistic_write) 사용
  - 참고: docs/BACKEND_DESIGN.md #Stock Usage Service

우선순위: MAJOR
```

### 🟡 Minor (백로그 등록)

```
[MINOR] 코드 스타일: 매직 넘버 상수화

현재 코드:
  @Min(1)
  @Max(100)
  limit?: number = 20;

제안:
  const DEFAULT_PAGE_LIMIT = 20;
  const MAX_PAGE_LIMIT = 100;

  @Min(1)
  @Max(MAX_PAGE_LIMIT)
  limit?: number = DEFAULT_PAGE_LIMIT;

우선순위: MINOR
```

### 💡 Suggestion (선택 사항)

```
[SUGGESTION] 성능 개선 제안

현재 코드:
  const items = await this.itemRepo.find();
  return items.filter(i => i.code.includes(keyword));

제안:
  return this.itemRepo
    .createQueryBuilder('item')
    .where('item.code ILIKE :keyword', { keyword: `%${keyword}%` })
    .getMany();

이유: DB 레벨 필터링이 애플리케이션 레벨보다 훨씬 효율적입니다.
```

---

## 공통 취약점 패턴

### 패턴 1: 미검증 직접 업데이트

```typescript
// ❌ DTO를 entity에 바로 spread
await this.repo.update(id, { ...dto });
// → 허용되지 않는 필드(man_roll, is_active 등) 변경 가능

// ✅ 화이트리스트 방식
await this.repo.update(id, {
  name: dto.name,
  email: dto.email,
  phone: dto.phone,
  // man_roll, is_active는 별도 검증 후 처리
});
```

### 패턴 2: N+1 쿼리

```typescript
// ❌ N+1: 구매요청 100개 → 요청자 100번 개별 조회
const prs = await this.prRepo.find();
for (const pr of prs) {
  pr.requester = await this.empRepo.findOne(pr.requester_id); // N번 쿼리
}

// ✅ Eager loading
const prs = await this.prRepo.find({
  relations: ['requester', 'items'],
});
```

### 패턴 3: 에러 메시지 정보 노출

```typescript
// ❌ 내부 구현 노출
throw new Error(`DB query failed: ${query} with params ${JSON.stringify(params)}`);

// ✅ 사용자 친화적 에러 + 내부 로깅 분리
this.logger.error('DB query failed', { query, params }); // 서버 로그
throw new InternalServerErrorException('서버 오류가 발생했습니다'); // 클라이언트 응답
```

### 패턴 4: 상태 검증 누락

```typescript
// ❌ 상태 검증 없는 발주 생성
async createOrder(prId: string, dto: CreateOrderDto) {
  const pr = await this.prRepo.findOne(prId);
  return this.orderRepo.save({ purchase_request_id: prId, ...dto });
  // → DRAFT/PENDING 상태의 구매요청으로 발주 생성 가능!
}

// ✅ 상태 사전 검증
async createOrder(prId: string, dto: CreateOrderDto) {
  const pr = await this.prRepo.findOne(prId);
  if (pr.status !== PurchaseRequestStatus.APPROVED) {
    throw new ConflictException('ERR_FLOW_001: 승인된 구매요청만 발주 가능합니다');
  }
  if (await this.orderRepo.findOne({ where: { purchase_request_id: prId } })) {
    throw new ConflictException('ERR_FLOW_002: 이미 발주가 생성된 구매요청입니다');
  }
  return this.orderRepo.save({ purchase_request_id: prId, ...dto });
}
```

### 패턴 5: 감사 로그 누락

```typescript
// ❌ 재고 변경 후 로그 없음
inventory.quantity -= dto.quantity;
await manager.save(inventory);
// → 누가 언제 얼마나 차감했는지 추적 불가

// ✅ 트랜잭션 내 감사 로그 함께 저장
inventory.quantity -= dto.quantity;
await manager.save(inventory);
await this.auditLogService.log(manager, {
  action: AuditAction.UPDATE,
  table_name: 'inventories',
  record_id: inventory.id,
  field: 'quantity',
  old_value: String(inventory.quantity + dto.quantity),
  new_value: String(inventory.quantity),
  performed_by_id: user.id,
});
```

---

## PR 리뷰 체크리스트

### 필수 확인 항목

- [ ] **보안**: 모든 엔드포인트에 적절한 Guard 적용
- [ ] **권한**: ROLL 레벨 및 팀 스코프 정확히 적용
- [ ] **트랜잭션**: 재고 변경 + 감사 로그가 동일 트랜잭션
- [ ] **동시성**: 재고 읽기-수정-쓰기에 비관적 락 사용
- [ ] **상태머신**: 모든 상태 전이에 유효성 검증
- [ ] **에러 코드**: 표준 에러 코드(ERR_*)로 응답
- [ ] **테스트**: 핵심 비즈니스 로직 단위 테스트 포함
- [ ] **DTO**: 입력 유효성 검증 (`class-validator`) 적용

### 코드 품질 확인

- [ ] 컨트롤러가 비즈니스 로직을 직접 구현하지 않음
- [ ] 하드코딩된 문자열/숫자 없음 (상수/enum 사용)
- [ ] 콘솔 로그 대신 NestJS Logger 사용
- [ ] 비동기 함수에 `await` 누락 없음
- [ ] TypeScript 타입 `any` 사용 최소화

---

## 보안 취약점 등급 기준

| 등급 | 설명 | 예시 |
|------|------|------|
| 🔴 Critical | 데이터 유출/무단 접근 가능 | 팀 스코프 누락, JWT 검증 우회 |
| 🟠 High | 데이터 무결성 훼손 가능 | 재고 음수, 상태 우회, ROLL 에스컬레이션 |
| 🟡 Medium | 부분적 오동작 | N+1 쿼리, 불필요한 데이터 노출 |
| 🟢 Low | 코드 품질 이슈 | 네이밍, 타입 안전성, 로그 누락 |
