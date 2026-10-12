import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { ToastContainer } from '../ui/Toast';

const titleMap: Record<string, string> = {
  '/dashboard':         '대시보드',
  '/inventory':         '재고현황',
  '/purchase-requests': '구매요청',
  '/purchase-orders':   '발주관리',
  '/store':             '입고관리',
  '/shipments':         '납품관리',
  '/stock-movements':   '재고이동',
  '/stock-usages':      '재고사용',
  '/items':             '품목관리',
  '/storage':           '창고관리',
  '/employees':         '직원관리',
  '/teams':             '팀관리',
};

export function AppShell() {
  const location = useLocation();
  const base = '/' + location.pathname.split('/')[1];
  const title = titleMap[base] ?? 'IMS';
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(v => !v)} />
      <div className={`flex-1 min-w-0 flex flex-col transition-all duration-300 ${collapsed ? 'ml-16' : 'ml-60'}`}>
        <TopBar title={title} />
        <main className="flex-1 min-w-0 mt-16 p-6">
          <Outlet />
        </main>
      </div>
      <ToastContainer />
    </div>
  );
}
