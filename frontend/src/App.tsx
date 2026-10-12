import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from './components/layout/AppShell';
import { useToastStore } from './store/toast.store';
import { ProtectedRoute } from './router/ProtectedRoute';
import { LoginPage }            from './pages/LoginPage';
import { AuthCallbackPage }     from './pages/AuthCallbackPage';
import { DashboardPage }        from './pages/DashboardPage';
import { InventoryPage }           from './pages/InventoryPage';
import { InventoryItemDetailPage } from './pages/InventoryItemDetailPage';
import { StorePage }            from './pages/StorePage';
import { StockMovementsPage }   from './pages/StockMovementsPage';
import { StockUsagesPage }      from './pages/StockUsagesPage';
import { RepairsPage }          from './pages/RepairsPage';
import { PermissionsPage }      from './pages/PermissionsPage';
import { ItemsPage }            from './pages/ItemsPage';
import { StoragePage }          from './pages/StoragePage';
import { EmployeesPage }        from './pages/EmployeesPage';
import { TeamsPage }            from './pages/TeamsPage';
import { ShipmentsPage }        from './pages/ShipmentsPage';
import { DcInventoryPage }         from './pages/DcInventoryPage';
import { InfraConsolePage }        from './pages/InfraConsolePage';
import { RegistrationRequestsPage } from './pages/RegistrationRequestsPage';


function parseErrorMessage(err: unknown): string {
  const res = (err as any)?.response?.data;
  if (!res) return '알 수 없는 오류가 발생했습니다';
  const candidate = Array.isArray(res.message) ? res.message[0] : (res.message ?? res.error ?? '오류가 발생했습니다');
  const raw = typeof candidate === 'string' ? candidate : JSON.stringify(candidate);
  // ERR_FLOW_001: 메시지 형식에서 메시지 부분만 추출
  const match = raw.match(/ERR_\w+:\s*(.*)/);
  return match ? match[1] : raw;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
    mutations: {
      onError: (err) => {
        useToastStore.getState().addToast(parseErrorMessage(err), 'error');
      },
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login"         element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/" element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard"          element={<DashboardPage />} />
            <Route path="inventory"              element={<InventoryPage />} />
            <Route path="inventory/:item_code"  element={<InventoryItemDetailPage />} />
            <Route path="store"              element={<StorePage />} />
            <Route path="stock-movements"    element={<StockMovementsPage />} />
            <Route path="stock-usages"       element={<StockUsagesPage />} />
            <Route path="repairs"            element={<RepairsPage />} />
            <Route path="shipments"        element={<ShipmentsPage />} />
            <Route path="shipment-status" element={<Navigate to="/shipments" replace />} />
            <Route path="dc-inventory"       element={<DcInventoryPage />} />
            <Route path="infra"              element={<InfraConsolePage />} />
            {/* 네트워크 관제는 watch 로 이관됨 — 옛 북마크는 인프라 관리로 */}
            <Route path="network-monitoring" element={<Navigate to="/infra" replace />} />
            <Route path="network-device/:id" element={<Navigate to="/infra" replace />} />

            <Route path="items"      element={<ProtectedRoute adminOnly><ItemsPage /></ProtectedRoute>} />
            <Route path="storage"    element={<ProtectedRoute adminOnly><StoragePage /></ProtectedRoute>} />
            <Route path="employees"  element={<ProtectedRoute adminOnly><EmployeesPage /></ProtectedRoute>} />
            <Route path="teams"      element={<ProtectedRoute adminOnly><TeamsPage /></ProtectedRoute>} />
            <Route path="permissions" element={<ProtectedRoute masterOnly><PermissionsPage /></ProtectedRoute>} />
            <Route path="registration-requests" element={<ProtectedRoute adminOnly><RegistrationRequestsPage /></ProtectedRoute>} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
