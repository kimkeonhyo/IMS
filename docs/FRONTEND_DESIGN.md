# IMS 프론트엔드 설계 문서

---

## 목차

1. 컴포넌트 트리 구조
2. 라우팅 설계
3. 상태관리 설계
4. 화면별 UI 명세
5. 권한별 메뉴 렌더링 로직

---

## 1. 컴포넌트 트리 구조

### 1.1 전체 앱 계층 구조

```
App
├── BrowserRouter
│   ├── AuthProvider
│   │   ├── ThemeProvider
│   │   │   └── RouterOutlet
│   │   │       ├── PublicLayout
│   │   │       │   └── LoginPage
│   │   │       │       ├── LoginForm
│   │   │       │       │   ├── TextInput (사번)
│   │   │       │       │   ├── TextInput (비밀번호)
│   │   │       │       │   └── SubmitButton
│   │   │       │       └── ErrorMessage
│   │   │       └── PrivateLayout
│   │   │           ├── AuthGuard
│   │   │           ├── AppShell
│   │   │           │   ├── Sidebar
│   │   │           │   │   ├── SidebarLogo
│   │   │           │   │   ├── UserProfile
│   │   │           │   │   │   ├── Avatar
│   │   │           │   │   │   ├── UserName
│   │   │           │   │   │   ├── TeamBadge
│   │   │           │   │   │   └── RoleBadge
│   │   │           │   │   ├── NavMenu
│   │   │           │   │   │   └── NavMenuItem (x7, 권한별 필터)
│   │   │           │   │   │       ├── NavMenuIcon
│   │   │           │   │   │       ├── NavMenuLabel
│   │   │           │   │   │       └── NavMenuBadge (알림수)
│   │   │           │   │   └── SidebarFooter
│   │   │           │   │       └── LogoutButton
│   │   │           │   ├── TopBar
│   │   │           │   │   ├── PageTitle
│   │   │           │   │   ├── Breadcrumb
│   │   │           │   │   └── NotificationBell
│   │   │           │   └── MainContent
│   │   │           │       └── [PageComponents]
│   │   │           └── PermissionGate
```

### 1.2 공통 컴포넌트 목록

```
src/components/common/
├── AuthGuard.tsx               # 인증 여부 검사, 미인증 시 /login 리다이렉트
├── PermissionGate.tsx          # ROLL + TEAM 기반 렌더링 제어
├── ProtectedRoute.tsx          # 라우트 단위 접근 제어
│
├── layout/
│   ├── AppShell.tsx
│   ├── Sidebar.tsx
│   ├── TopBar.tsx
│   └── PageHeader.tsx
│
├── ui/
│   ├── StatusBadge.tsx
│   ├── RoleBadge.tsx
│   ├── TeamBadge.tsx
│   ├── DataTable.tsx
│   ├── FilterBar.tsx
│   ├── SearchInput.tsx
│   ├── DateRangePicker.tsx
│   ├── EmptyState.tsx
│   ├── LoadingSpinner.tsx
│   ├── ConfirmDialog.tsx
│   ├── ToastMessage.tsx
│   └── ExportButton.tsx
│
├── form/
│   ├── FormField.tsx
│   ├── NumberInput.tsx
│   ├── AutoCompleteSelect.tsx
│   ├── FileUpload.tsx
│   └── FormModal.tsx
│
└── feedback/
    ├── ErrorBoundary.tsx
    ├── NotFound.tsx
    └── AccessDenied.tsx
```

---

## 2. 라우팅 설계

### 2.1 라우트 구조

```typescript
// src/router/index.tsx

const router = createBrowserRouter([
  {
    path: "/login",
    element: <PublicLayout />,
    children: [{ index: true, element: <LoginPage /> }]
  },
  {
    path: "/",
    element: <AuthGuard />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="/purchase-request" replace /> },

          // 1. 구매요청
          {
            path: "purchase-request",
            element: <ProtectedRoute allowedTeams="ALL" allowedRolls={[0,1,2]} requiredPermission="purchase_request.read" />,
            children: [
              { index: true, element: <PurchaseRequestPage /> },
              { path: ":id", element: <PurchaseRequestDetailPage /> },
              {
                path: "new",
                element: <ProtectedRoute requiredPermission="purchase_request.write" />,
                children: [{ index: true, element: <PurchaseRequestFormPage /> }]
              },
              {
                path: ":id/edit",
                element: <ProtectedRoute requiredPermission="purchase_request.write" />,
                children: [{ index: true, element: <PurchaseRequestFormPage /> }]
              }
            ]
          },

          // 2. 발주
          {
            path: "purchase-order",
            element: <ProtectedRoute allowedTeams="ALL" allowedRolls={[0,1,2]} requiredPermission="purchase_order.read" />,
            children: [
              { index: true, element: <PurchaseOrderPage /> },
              { path: ":id", element: <PurchaseOrderDetailPage /> },
              {
                path: "new",
                element: <ProtectedRoute allowedTeams={["경영지원팀"]} requiredPermission="purchase_order.write" />,
                children: [{ index: true, element: <PurchaseOrderFormPage /> }]
              }
            ]
          },

          // 3. 입고 처리
          {
            path: "receiving",
            element: <ProtectedRoute allowedTeams="ALL" allowedRolls={[0,1,2]} requiredPermission="receiving.read" />,
            children: [
              { index: true, element: <ReceivingPage /> },
              { path: ":id", element: <ReceivingDetailPage /> },
              {
                path: "new",
                element: <ProtectedRoute requiredPermission="receiving.write" />,
                children: [{ index: true, element: <ReceivingFormPage /> }]
              }
            ]
          },

          // 4. 재고 조회
          {
            path: "inventory",
            element: <ProtectedRoute allowedTeams="ALL" allowedRolls={[0,1,2]} requiredPermission="inventory.read" />,
            children: [
              { index: true, element: <InventoryPage /> },
              { path: ":id", element: <InventoryDetailPage /> }
            ]
          },

          // 5. 재고이동
          {
            path: "inventory-transfer",
            element: <ProtectedRoute allowedTeams="ALL" allowedRolls={[0,1,2]} requiredPermission="inventory_transfer.read" />,
            children: [
              { index: true, element: <InventoryTransferPage /> },
              { path: ":id", element: <InventoryTransferDetailPage /> },
              {
                path: "new",
                element: <ProtectedRoute requiredPermission="inventory_transfer.request" />,
                children: [{ index: true, element: <InventoryTransferFormPage /> }]
              }
            ]
          },

          // 6. 재고사용
          {
            path: "inventory-usage",
            element: <ProtectedRoute allowedTeams="ALL" allowedRolls={[0,1,2]} requiredPermission="inventory_usage.read" />,
            children: [
              { index: true, element: <InventoryUsagePage /> },
              { path: ":id", element: <InventoryUsageDetailPage /> },
              {
                path: "new",
                element: <ProtectedRoute requiredPermission="inventory_usage.write" />,
                children: [{ index: true, element: <InventoryUsageFormPage /> }]
              }
            ]
          },

          // 7. 납품
          {
            path: "delivery",
            element: <ProtectedRoute allowedTeams="ALL" allowedRolls={[0,1,2]} requiredPermission="delivery.read" />,
            children: [
              { index: true, element: <DeliveryPage /> },
              { path: ":id", element: <DeliveryDetailPage /> },
              {
                path: "new",
                element: <ProtectedRoute allowedTeams={["경영지원팀"]} requiredPermission="delivery.write" />,
                children: [{ index: true, element: <DeliveryFormPage /> }]
              }
            ]
          },

          { path: "access-denied", element: <AccessDeniedPage /> },
          { path: "*", element: <NotFoundPage /> }
        ]
      }
    ]
  }
]);
```

### 2.2 AuthGuard

```typescript
const AuthGuard: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuthStore();
  const location = useLocation();

  if (isLoading) return <LoadingSpinner fullscreen />;
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <Outlet />;
};
```

### 2.3 ProtectedRoute

```typescript
interface ProtectedRouteProps {
  allowedTeams?: string[] | "ALL";
  allowedRolls?: number[];
  requiredPermission?: string;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  allowedTeams = "ALL",
  allowedRolls = [0, 1, 2],
  requiredPermission,
}) => {
  const { user } = useAuthStore();
  const hasPermission = usePermission(requiredPermission);

  const rollAllowed = allowedRolls.includes(user.MAN_ROLL);
  const teamAllowed =
    allowedTeams === "ALL" ||
    user.MAN_TEAM === "경영지원팀" ||
    allowedTeams.includes(user.MAN_TEAM);
  const permissionAllowed = !requiredPermission || hasPermission;

  if (!rollAllowed || !teamAllowed || !permissionAllowed) {
    return <Navigate to="/access-denied" replace />;
  }
  return <Outlet />;
};
```

### 2.4 PermissionGate

```typescript
interface PermissionGateProps {
  permission?: string;
  teams?: string[];
  rolls?: number[];
  fallback?: React.ReactNode;
  disabled?: boolean;
  children: React.ReactNode;
}

const PermissionGate: React.FC<PermissionGateProps> = ({
  permission, teams, rolls, fallback = null, disabled = false, children,
}) => {
  const { user } = useAuthStore();
  const hasPermission = usePermission(permission);

  const rollOk = !rolls || rolls.includes(user.MAN_ROLL);
  const teamOk = !teams || user.MAN_TEAM === "경영지원팀" || teams.includes(user.MAN_TEAM);
  const permOk = !permission || hasPermission;
  const allowed = rollOk && teamOk && permOk;

  if (!allowed) {
    if (disabled) {
      return <>{React.cloneElement(children as React.ReactElement, { disabled: true })}</>;
    }
    return <>{fallback}</>;
  }
  return <>{children}</>;
};
```

---

## 3. 상태관리 설계 (Zustand)

### 3.1 스토어 구조

```
src/store/
├── authStore.ts
├── uiStore.ts
├── purchaseRequestStore.ts
├── purchaseOrderStore.ts
├── receivingStore.ts
├── inventoryStore.ts
├── inventoryTransferStore.ts
├── inventoryUsageStore.ts
└── deliveryStore.ts
```

### 3.2 인증 상태 (authStore)

```typescript
interface UserSession {
  MAN_NO: string;
  MAN_NAME: string;
  MAN_ROLL: 0 | 1 | 2;   // 0: 마스터, 1: 관리자, 2: 사용자
  MAN_TEAM: string;
  MAN_DEPT: string;
  permissions: string[];
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface AuthState {
  user: UserSession | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (manNo: string, password: string) => Promise<void>;
  logout: () => void;
  refreshSession: () => Promise<void>;
}

const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (manNo, password) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authApi.login({ manNo, password });
          set({ user: buildUserSession(response), isAuthenticated: true, isLoading: false });
        } catch (err) {
          set({ error: err.message, isLoading: false });
        }
      },

      logout: () => {
        authApi.logout();
        set({ user: null, isAuthenticated: false });
      },

      refreshSession: async () => {
        const { user } = get();
        if (!user) return;
        const response = await authApi.refresh(user.refreshToken);
        set({ user: { ...user, accessToken: response.accessToken } });
      },
    }),
    {
      name: "ims-auth",
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    }
  )
);
```

### 3.3 권한 훅 (usePermission)

```typescript
// src/hooks/usePermission.ts

const PERMISSION_MAP: Record<string, { teams: string[] | "ALL"; rolls: number[] }> = {
  "purchase_request.read":      { teams: "ALL",           rolls: [0, 1, 2] },
  "purchase_request.write":     { teams: "ALL",           rolls: [0, 1, 2] },
  "purchase_request.cancel":    { teams: "ALL",           rolls: [0, 1, 2] },
  "purchase_order.read":        { teams: "ALL",           rolls: [0, 1, 2] },
  "purchase_order.write":       { teams: ["경영지원팀"],  rolls: [0, 1, 2] },
  "receiving.read":             { teams: "ALL",           rolls: [0, 1, 2] },
  "receiving.write":            { teams: "ALL",           rolls: [0, 1, 2] },
  "receiving.cancel":           { teams: "ALL",           rolls: [0, 1, 2] },
  "inventory.read":             { teams: "ALL",           rolls: [0, 1, 2] },
  "inventory.price.read":       { teams: ["경영지원팀"],  rolls: [0, 1]    },
  "inventory_transfer.read":    { teams: "ALL",           rolls: [0, 1, 2] },
  "inventory_transfer.request": { teams: "ALL",           rolls: [0, 1, 2] },
  "inventory_transfer.approve": { teams: "ALL",           rolls: [0, 1]    },
  "inventory_usage.read":       { teams: "ALL",           rolls: [0, 1, 2] },
  "inventory_usage.write":      { teams: "ALL",           rolls: [0, 1, 2] },
  "delivery.read":              { teams: "ALL",           rolls: [0, 1, 2] },
  "delivery.write":             { teams: ["경영지원팀"],  rolls: [0, 1, 2] },
};

export const usePermission = (permission?: string): boolean => {
  const { user } = useAuthStore();
  if (!user || !permission) return false;
  if (user.MAN_TEAM === "경영지원팀") return true; // 경영지원팀 전체 권한

  const rule = PERMISSION_MAP[permission];
  if (!rule) return false;

  const rollOk = rule.rolls.includes(user.MAN_ROLL);
  const teamOk = rule.teams === "ALL" || rule.teams.includes(user.MAN_TEAM);
  return rollOk && teamOk;
};
```

### 3.4 도메인 상태 공통 패턴

```typescript
interface ListState<T> {
  items: T[];
  selectedItem: T | null;
  total: number;
  page: number;
  pageSize: number;
  isLoading: boolean;
  error: string | null;
  filters: FilterState;
}

interface FilterState {
  startDate: string | null;
  endDate: string | null;
  status: string | null;
  keyword: string;
  [key: string]: any;
}
```

### 3.5 팀별 데이터 범위 제어

```typescript
// src/utils/dataScope.ts

export const buildTeamFilter = (user: UserSession) => {
  // 경영지원팀 또는 마스터는 전체 조회
  if (user.MAN_TEAM === "경영지원팀" || user.MAN_ROLL === 0) {
    return {};
  }
  return { teamCode: user.MAN_TEAM };
};
```

---

## 4. 화면별 UI 명세

### 4.1 공통 레이아웃

```
┌──────────────────────────────────────────────────────────────────┐
│  SIDEBAR (240px)          │  MAIN CONTENT AREA                   │
│ ┌──────────────────────┐  │ ┌──────────────────────────────────┐ │
│ │  IMS        │  │ │  TopBar                          │ │
│ │  [로고]              │  │ │  페이지제목 / 브레드크럼 / 알림   │ │
│ ├──────────────────────┤  │ └──────────────────────────────────┘ │
│ │  [아바타] 홍길동     │  │ ┌──────────────────────────────────┐ │
│ │  경영지원팀 · 관리자 │  │ │  PageHeader                      │ │
│ ├──────────────────────┤  │ │  제목 + 액션 버튼                │ │
│ │  📋 구매요청         │  │ └──────────────────────────────────┘ │
│ │  📦 발주             │  │ ┌──────────────────────────────────┐ │
│ │  🏭 입고 처리        │  │ │  FilterBar                       │ │
│ │  📊 재고 조회        │  │ │  기간 / 상태 / 검색              │ │
│ │  🔄 재고이동         │  │ └──────────────────────────────────┘ │
│ │  ✏️ 재고사용         │  │ ┌──────────────────────────────────┐ │
│ │  🚚 납품             │  │ │  DataTable                       │ │
│ ├──────────────────────┤  │ │  헤더 / 데이터 행 / 페이지네이션 │ │
│ │  [로그아웃]          │  │ └──────────────────────────────────┘ │
│ └──────────────────────┘  └──────────────────────────────────────┘
└──────────────────────────────────────────────────────────────────┘
```

### 4.2 상태값 배지 색상 정의

```typescript
// 구매요청 상태
const PR_STATUS_BADGE = {
  PENDING:   { color: "#F59E0B", bg: "#FEF3C7", label: "검토중"  },
  APPROVED:  { color: "#10B981", bg: "#D1FAE5", label: "승인"    },
  ORDERED:   { color: "#3B82F6", bg: "#DBEAFE", label: "발주됨"  },
  REJECTED:  { color: "#EF4444", bg: "#FEE2E2", label: "반려"    },
  CANCELLED: { color: "#6B7280", bg: "#F3F4F6", label: "취소"    },
};

// 발주 상태
const PO_STATUS_BADGE = {
  DRAFT:     { color: "#6B7280", bg: "#F3F4F6", label: "초안"     },
  CONFIRMED: { color: "#3B82F6", bg: "#DBEAFE", label: "확정"     },
  RECEIVING: { color: "#F59E0B", bg: "#FEF3C7", label: "입고중"   },
  COMPLETED: { color: "#10B981", bg: "#D1FAE5", label: "입고완료" },
  CANCELLED: { color: "#EF4444", bg: "#FEE2E2", label: "취소"     },
};

// 재고이동 상태
const TF_STATUS_BADGE = {
  PENDING:   { color: "#F59E0B", bg: "#FEF3C7", label: "승인대기" },
  APPROVED:  { color: "#10B981", bg: "#D1FAE5", label: "승인완료" },
  REJECTED:  { color: "#EF4444", bg: "#FEE2E2", label: "반려"     },
  MOVING:    { color: "#3B82F6", bg: "#DBEAFE", label: "이동중"   },
  COMPLETED: { color: "#6366F1", bg: "#EEF2FF", label: "이동완료" },
  CANCELLED: { color: "#6B7280", bg: "#F3F4F6", label: "취소"     },
};

// 재고 상태
const STOCK_STATUS_BADGE = {
  NORMAL: { color: "#10B981", bg: "#D1FAE5", label: "정상" },
  LOW:    { color: "#EF4444", bg: "#FEE2E2", label: "부족" },
  EXCESS: { color: "#3B82F6", bg: "#DBEAFE", label: "과잉" },
  ZERO:   { color: "#111827", bg: "#F3F4F6", label: "소진" },
};

// 납품 상태
const DL_STATUS_BADGE = {
  PREPARING: { color: "#F59E0B", bg: "#FEF3C7", label: "준비중"   },
  SHIPPING:  { color: "#3B82F6", bg: "#DBEAFE", label: "배송중"   },
  DELIVERED: { color: "#10B981", bg: "#D1FAE5", label: "납품완료" },
  CONFIRMED: { color: "#6366F1", bg: "#EEF2FF", label: "검수완료" },
  CANCELLED: { color: "#EF4444", bg: "#FEE2E2", label: "취소"     },
};
```

### 4.3 화면별 컬럼 권한 제어

| 화면 | 컬럼 | 경영지원팀 | 기타팀(ROLL 1) | 기타팀(ROLL 2) |
|------|------|-----------|--------------|--------------|
| 발주 | 발주금액 | O | X | X |
| 재고 | 단가/재고금액 | O | O | X |
| 납품 | 납품금액 | O | X | X |
| 입고 | 불량수량 | O | O | X |

---

## 5. 권한별 메뉴 렌더링 로직

### 5.1 팀 분류 상수

```typescript
export const TEAMS = {
  MANAGEMENT_SUPPORT: "경영지원팀",
  HEADQUARTERS: {
    label: "사업본부",
    teams: ["영업팀", "PM팀", "영업팀", "교육팀", "기획팀", "기획팀"],
  },
  AI_LAB: {
    label: "연구소",
    teams: ["개발팀", "인프라팀", "디자인팀", "QA팀", "QA팀", "AI팀"],
  },
} as const;

export const isManagementSupport = (team: string) =>
  team === TEAMS.MANAGEMENT_SUPPORT;
```

### 5.2 메뉴 구성 정의

```typescript
export const MENU_CONFIG: MenuConfig[] = [
  {
    id: "purchase-request", label: "구매요청", path: "/purchase-request",
    icon: "ClipboardDocumentListIcon",
    access: { teams: "ALL", rolls: [0, 1, 2] },
    features: {
      read:    { teams: "ALL",          rolls: [0, 1, 2] },
      write:   { teams: "ALL",          rolls: [0, 1, 2] },
      cancel:  { teams: "ALL",          rolls: [0, 1, 2] },
      approve: { teams: ["경영지원팀"], rolls: [0, 1]    },
    },
  },
  {
    id: "purchase-order", label: "발주", path: "/purchase-order",
    icon: "ShoppingCartIcon",
    access: { teams: "ALL", rolls: [0, 1, 2] },
    features: {
      read:  { teams: "ALL",          rolls: [0, 1, 2] },
      write: { teams: ["경영지원팀"], rolls: [0, 1, 2] },
    },
  },
  {
    id: "receiving", label: "입고 처리", path: "/receiving",
    icon: "ArchiveBoxArrowDownIcon",
    access: { teams: "ALL", rolls: [0, 1, 2] },
    features: {
      read:   { teams: "ALL", rolls: [0, 1, 2] },
      write:  { teams: "ALL", rolls: [0, 1, 2] },
      cancel: { teams: "ALL", rolls: [0, 1, 2] },
    },
  },
  {
    id: "inventory", label: "재고 조회", path: "/inventory",
    icon: "ChartBarIcon",
    access: { teams: "ALL", rolls: [0, 1, 2] },
    features: {
      read:      { teams: "ALL",          rolls: [0, 1, 2] },
      priceRead: { teams: ["경영지원팀"], rolls: [0, 1]    },
    },
  },
  {
    id: "inventory-transfer", label: "재고이동", path: "/inventory-transfer",
    icon: "ArrowsRightLeftIcon",
    access: { teams: "ALL", rolls: [0, 1, 2] },
    features: {
      read:    { teams: "ALL", rolls: [0, 1, 2] },
      request: { teams: "ALL", rolls: [0, 1, 2] },
      approve: { teams: "ALL", rolls: [0, 1]    },
    },
  },
  {
    id: "inventory-usage", label: "재고사용", path: "/inventory-usage",
    icon: "WrenchScrewdriverIcon",
    access: { teams: "ALL", rolls: [0, 1, 2] },
    features: {
      read:  { teams: "ALL", rolls: [0, 1, 2] },
      write: { teams: "ALL", rolls: [0, 1, 2] },
    },
  },
  {
    id: "delivery", label: "납품", path: "/delivery",
    icon: "TruckIcon",
    access: { teams: "ALL", rolls: [0, 1, 2] },
    features: {
      read:     { teams: "ALL",          rolls: [0, 1, 2] },
      write:    { teams: ["경영지원팀"], rolls: [0, 1, 2] },
      complete: { teams: ["경영지원팀"], rolls: [0, 1, 2] },
    },
  },
];
```

### 5.3 권한 매트릭스

```
┌──────────────────┬──────────────────────────────────────────────────────────┐
│                  │                       팀 구분                             │
│    기능          ├─────────────┬────────────────────┬────────────────────────┤
│                  │  경영지원팀 │   사업본부 (6개팀)  │  연구소 (6개팀) │
│                  │ ROLL 0,1,2  │ ROLL 0 │  1  │  2  │ ROLL 0  │  1  │   2   │
├──────────────────┼─────────────┼──────────────────────────────────────────┤
│ 구매요청 조회     │ 전체        │ 전체   │ 전체│내팀 │  전체   │ 전체│  내팀  │
│ 구매요청 등록     │ O           │ O      │  O  │  O  │   O     │  O  │   O   │
│ 구매요청 수정     │ O           │O(본인) │  O  │O(본)│  O(본)  │  O  │  O(본)│
│ 구매요청 취소     │ O           │O(본인) │  O  │O(본)│  O(본)  │  O  │  O(본)│
│ 구매요청 승인     │ O           │ O      │  O  │  X  │   O     │  O  │   X   │
├──────────────────┼─────────────┼──────────────────────────────────────────┤
│ 발주 조회         │ 전체        │ 전체   │ 전체│내팀 │  전체   │ 전체│  내팀  │
│ 발주 등록/수정    │ O           │ X      │  X  │  X  │   X     │  X  │   X   │
├──────────────────┼─────────────┼──────────────────────────────────────────┤
│ 입고 조회         │ 전체        │ 전체   │ 전체│내팀 │  전체   │ 전체│  내팀  │
│ 입고 등록/수정    │ O           │ O      │  O  │  O  │   O     │  O  │   O   │
│ 입고 취소         │ O           │ O      │  O  │  O  │   O     │  O  │   O   │
├──────────────────┼─────────────┼──────────────────────────────────────────┤
│ 재고 조회(전체)   │ O           │ O      │  O  │  O  │   O     │  O  │   O   │
│ 재고 단가/금액    │ O           │ O      │  O  │  X  │   O     │  O  │   X   │
├──────────────────┼─────────────┼──────────────────────────────────────────┤
│ 재고이동 요청     │ O           │ O      │  O  │  O  │   O     │  O  │   O   │
│ 재고이동 승인     │ O           │ O      │  O  │  X  │   O     │  O  │   X   │
├──────────────────┼─────────────┼──────────────────────────────────────────┤
│ 재고사용 등록     │ O           │ O      │  O  │  O  │   O     │  O  │   O   │
├──────────────────┼─────────────┼──────────────────────────────────────────┤
│ 납품 조회         │ 전체        │ 전체   │ 전체│내팀 │  전체   │ 전체│  내팀  │
│ 납품 등록/수정    │ O           │ X      │  X  │  X  │   X     │  X  │   X   │
│ 납품완료 처리     │ O           │ X      │  X  │  X  │   X     │  X  │   X   │
└──────────────────┴─────────────┴──────────────────────────────────────────┘

* 내팀 = 소속 팀 데이터만 조회 (API 파라미터로 제어)
* 본인 = 본인이 등록한 데이터만 수정/취소 (BE에서 검증)
```

### 5.4 NavMenu 렌더링 컴포넌트

```tsx
const NavMenu: React.FC = () => {
  const { user } = useAuthStore();
  const location = useLocation();

  const visibleMenus = useMemo(
    () => getAccessibleMenus(user, MENU_CONFIG),
    [user]
  );

  return (
    <nav>
      <ul className="space-y-1">
        {visibleMenus.map((menu) => {
          const isActive = location.pathname.startsWith(menu.path);
          return (
            <li key={menu.id}>
              <NavLink
                to={menu.path}
                className={clsx(
                  "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors",
                  isActive ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"
                )}
              >
                <DynamicIcon name={menu.icon} className="w-5 h-5" />
                <span className="text-sm font-medium">{menu.label}</span>
                <PendingBadge menuId={menu.id} />
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};
```

---

## 부록: 디렉토리 구조

```
src/
├── api/
│   ├── client.ts                 # Axios 인스턴스 + 인터셉터
│   ├── authApi.ts
│   ├── purchaseRequestApi.ts
│   ├── purchaseOrderApi.ts
│   ├── receivingApi.ts
│   ├── inventoryApi.ts
│   ├── inventoryTransferApi.ts
│   ├── inventoryUsageApi.ts
│   └── deliveryApi.ts
├── components/
│   ├── common/
│   └── [domain]/
├── constants/
│   ├── teams.ts
│   ├── menuConfig.ts
│   └── statusConfig.ts
├── hooks/
│   ├── usePermission.ts
│   ├── usePendingCount.ts
│   └── useDataScope.ts
├── pages/
│   ├── auth/
│   ├── purchase-request/
│   ├── purchase-order/
│   ├── receiving/
│   ├── inventory/
│   ├── inventory-transfer/
│   ├── inventory-usage/
│   └── delivery/
├── router/
│   └── index.tsx
├── store/
│   ├── authStore.ts
│   ├── uiStore.ts
│   └── [domain]Store.ts
├── types/
└── utils/
    ├── menuFilter.ts
    ├── dataScope.ts
    └── formatters.ts
```

---

## 설계 핵심 원칙 요약

| 원칙 | 내용 |
|---|---|
| 이중 권한 검사 | PermissionGate(FE) + API 검증(BE) 병행 |
| 데이터 범위 분리 | 경영지원팀=전체, 기타팀=소속팀만 (API 파라미터 자동 주입) |
| ROLL 기반 기능 세분화 | 동일 팀 내에서도 ROLL(0/1/2)에 따라 승인/편집 차등 |
| 컴포넌트 재사용 | StatusBadge, PermissionGate, DataTable 공통화 |
| 경량 상태관리 | Zustand 도메인별 스토어 분리, 불필요한 리렌더링 방지 |
