# IMS — IT 자산/장비 관리 시스템

IT 장비의 **구매요청 → 발주 → 입고 → 재고 → 사용/이동/수리 → 납품** 전 과정을 한 곳에서 관리하는 웹 애플리케이션입니다.
S/N 단위 자산 추적, 역할 기반 권한, 감사 로그, NetBox 연동 인프라 대장까지 포함한 개인 포트폴리오 프로젝트입니다.

> 이 저장소의 모든 데이터·주소·계정 정보는 예시(placeholder)이며, 실제 운영 값은 포함되어 있지 않습니다.

---

## 주요 기능

| 영역 | 기능 |
|------|------|
| 구매 | 구매요청(DRAFT → SUBMITTED → APPROVED/REJECTED), 발주 생성·확정, 메일 알림 |
| 입고 | 발주 기반 입고 등록, 품목·S/N 일괄 입력, 창고별 재고 자동 증가 |
| 재고 | 창고·품목별 재고현황, 품목 상세(S/N 이력), 재고이동(인계/인수 승인), 재고사용·반납 |
| 자산 | S/N 상태 추적(STOCK → USED/SHIPPED → CONFIRMED), 자산 사진 업로드, 수리 이력 |
| 납품 | 고객 현장 납품 등록, 서비스(VMS/NVR) 배포 정보, 납품 상태 관리 |
| 인프라 | 서버실 랙·장비·IP 대장, NetBox 랙 배치도/장비 속성 편집, NetBox ↔ IMS 재고 동기화(스케줄) |
| 관리 | 직원·팀·창고·품목 관리(CSV/Excel 일괄 등록), 역할별 메뉴 권한, 가입 승인, 감사 로그 |
| 인증 | Azure AD(Entra ID) OIDC SSO + JWT, 역할(MASTER / ADMIN / USER) 기반 가드 |
| 대시보드 | 위젯 드래그 배치(react-grid-layout), 재고·요청 현황 요약 |

---

## 기술 스택

| 구분 | 기술 |
|------|------|
| Backend | NestJS 11, TypeORM 0.3, PostgreSQL 16, Passport-JWT, class-validator, Swagger, @nestjs/schedule, Nodemailer |
| Frontend | React 19, Vite, TypeScript 5, TanStack Query 5, Zustand, Axios, Tailwind CSS 4, React Router 7 |
| 연동 | NetBox REST API, Notion API(배포 카탈로그), Google Cloud Storage(자산 사진) — 모두 선택 사항 |
| Infra | Docker / Docker Compose, Nginx(SPA), Caddy(리버스 프록시), GitHub Actions(CI) |

---

## 아키텍처

```
Browser
   │
   ▼
Caddy (reverse proxy)
 ├── /api/*, /oidc/callback ──► NestJS API :3000 ──► PostgreSQL
 │                               ├── /api/docs (Swagger UI)
 │                               ├── SMTP (메일 알림, 선택)
 │                               ├── NetBox API (인프라 대장, 선택)
 │                               └── Notion / GCS (선택)
 ├── /netbox/*            ──► NetBox :8080 (선택)
 └── /*                   ──► React SPA (Nginx :80)
```

업무 흐름:

```
구매요청 ──► 발주 ──► 입고 ──► 재고 ─┬─► 재고이동 (창고/담당자 간)
                                    ├─► 재고사용 / 반납
                                    ├─► 수리
                                    └─► 납품 (S/N: STOCK → SHIPPED → CONFIRMED)
```

---

## 디렉토리 구조

```
.
├── backend/                 # NestJS API 서버
│   └── src/
│       ├── auth/            # OIDC 로그인, JWT, 가입 승인
│       ├── purchase-requests/ purchase-orders/ store/   # 구매·발주·입고
│       ├── inventory/ stock-movements/ stock-usages/    # 재고
│       ├── serial-numbers/ asset-instances/ asset-images/ repairs/
│       ├── shipments/ deliveries/                       # 납품
│       ├── dc-inventory/ netbox-proxy/ netbox-sync/     # 인프라 대장
│       ├── employees/ teams/ storage/ items/ role-permissions/ audit-logs/
│       └── common/          # 가드, 데코레이터, enum, 필터
├── frontend/                # React SPA
│   └── src/ (pages, components, api, store, router)
├── db/                      # ERD, 스키마 SQL
├── docs/                    # 백엔드/프론트엔드/DB 설계, QA 케이스, 코드리뷰 가이드
├── netbox/                  # NetBox 동거 스택(선택): Dockerfile, compose override, Caddyfile
├── docker-compose.yml       # 로컬 PostgreSQL
└── .github/workflows/ci.yml # 빌드 검증 CI
```

---

## 로컬 실행

### 사전 요구사항

- Node.js 22+
- Docker & Docker Compose

### 1. 환경변수

```bash
cp .env.example .env                  # 로컬 PostgreSQL 용
cp backend/.env.example backend/.env  # 백엔드 용
# 두 파일의 <PLACEHOLDER> 값을 채운다 (DB_PASSWORD 는 양쪽 동일하게)
```

### 2. 실행

```bash
docker compose up -d                       # PostgreSQL
npm --prefix backend install && npm --prefix frontend install
npm run start:dev                          # 백엔드 (TypeORM synchronize 로 스키마 자동 생성)
npm run dev                                # 프론트엔드 (별도 터미널)
```

| 서비스 | 주소 |
|--------|------|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:3000/api |
| Swagger UI | http://localhost:3000/api/docs |

### 로그인

로그인은 Azure AD OIDC 로만 동작합니다. `backend/.env` 의 `AZURE_AD_*` 를 본인 테넌트의 앱 등록 값으로 채우고,
Redirect URI 를 `http://localhost:5173/oidc/callback`(Vite 가 백엔드로 프록시) 으로 등록하세요.
첫 로그인 시 가입 신청이 생성되며, MASTER 계정이 승인하면 사용할 수 있습니다
(최초 MASTER 는 `employees` 테이블에 직접 1건 추가).

NetBox·Notion·GCS·SMTP 연동은 환경변수가 비어 있으면 자동으로 비활성화됩니다.

---

## CI

`.github/workflows/ci.yml` — PR/브랜치 푸시 시 변경된 쪽(backend / frontend)만 `npm ci && npm run build` 로 빌드 검증합니다.
