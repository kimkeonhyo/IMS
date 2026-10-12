import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  masterOnly?: boolean;
}

interface NavGroup {
  label: string;
  icon: string;
  adminOnly?: boolean;
  children: NavItem[];
}

type NavEntry = NavItem | NavGroup;

const isGroup = (e: NavEntry): e is NavGroup => 'children' in e;

const NAV: NavEntry[] = [
  { path: '/store', label: '입고관리', icon: '📥' },
  {
    label: '납품관리', icon: '🚚',
    children: [
      { path: '/shipments', label: '납품현황', icon: '📋' },
    ],
  },
  {
    label: '재고관리', icon: '📦',
    children: [
      { path: '/inventory',        label: '재고현황', icon: '📊' },
      { path: '/stock-movements',  label: '재고이동', icon: '🔄' },
      { path: '/stock-usages',     label: '재고사용', icon: '✂️' },
      { path: '/repairs',          label: '고장/수리', icon: '🛠️' },
    ],
  },
  { path: '/infra', label: '인프라 관리', icon: '🗄️' },
  {
    label: '운영관리', icon: '⚙️', adminOnly: true,
    children: [
      { path: '/items',                   label: '품목관리',   icon: '🏷️' },
      { path: '/storage',                 label: '창고관리',   icon: '🏭' },
      { path: '/employees',               label: '직원관리',   icon: '👥' },
      { path: '/teams',                   label: '팀관리',     icon: '🏢' },
      { path: '/permissions',             label: '권한관리',   icon: '🔑', masterOnly: true },
      { path: '/registration-requests',   label: '가입 승인',  icon: '✅' },
    ],
  },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { user, isAdmin, isMaster } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const entry of NAV) {
      if (isGroup(entry)) {
        initial[entry.label] = entry.children.some(c => location.pathname.startsWith(c.path));
      }
    }
    return initial;
  });

  const toggleGroup = (label: string) => {
    if (collapsed) return;
    setOpenGroups(prev => ({ ...prev, [label]: !prev[label] }));
  };

  return (
    <aside
      className={`${collapsed ? 'w-16' : 'w-60'} bg-gray-900 text-white flex flex-col min-h-screen fixed left-0 top-0 z-30 transition-all duration-300 overflow-hidden`}
    >
      {/* Logo */}
      <div
        className={`h-16 flex items-center border-b border-gray-700 cursor-pointer hover:bg-gray-800 transition-colors ${collapsed ? 'justify-center px-0' : 'px-4 gap-2'}`}
        onClick={() => navigate('/dashboard')}
      >
        <img src="/logo.svg" alt="IMS" className="h-8 w-auto shrink-0" />
        {!collapsed && <span className="text-lg font-bold text-white whitespace-nowrap">IMS</span>}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 overflow-y-auto overflow-x-hidden">
        {NAV.map((entry, idx) => {
          if (isGroup(entry)) {
            if (entry.adminOnly && !isAdmin()) return null;
            const anyChildActive = entry.children.some(c => location.pathname.startsWith(c.path));
            const isOpen = !collapsed && (openGroups[entry.label] ?? false);

            return (
              <div key={idx}>
                <button
                  onClick={() => toggleGroup(entry.label)}
                  title={collapsed ? entry.label : undefined}
                  className={`w-full flex items-center py-2.5 text-sm transition-colors hover:text-white hover:bg-gray-800
                    ${collapsed ? 'justify-center px-0' : 'gap-3 px-6'}
                    ${anyChildActive ? 'text-white' : 'text-gray-400'}`}
                >
                  <span className="text-base shrink-0">{entry.icon}</span>
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left whitespace-nowrap">{entry.label}</span>
                      <span className="text-xs opacity-60">{isOpen ? '▲' : '▼'}</span>
                    </>
                  )}
                </button>
                {isOpen && (
                  <div className="bg-gray-800/50">
                    {entry.children.filter(c => !c.masterOnly || isMaster()).map(child => (
                      <NavLink
                        key={child.path}
                        to={child.path}
                        className={({ isActive }) =>
                          `flex items-center gap-3 pl-10 pr-6 py-2.5 text-sm transition-colors whitespace-nowrap ${
                            isActive ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'
                          }`
                        }
                      >
                        <span className="text-sm shrink-0">{child.icon}</span>
                        <span>{child.label}</span>
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          }

          return (
            <NavLink
              key={entry.path}
              to={entry.path}
              title={collapsed ? entry.label : undefined}
              className={({ isActive }) =>
                `flex items-center py-2.5 text-sm transition-colors
                ${collapsed ? 'justify-center px-0' : 'gap-3 px-6'}
                ${isActive ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`
              }
            >
              <span className="text-base shrink-0">{entry.icon}</span>
              {!collapsed && <span className="whitespace-nowrap">{entry.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* User info + Toggle */}
      <div className={`border-t border-gray-700 ${collapsed ? 'p-2' : 'p-4'}`}>
        {!collapsed && (
          <div className="mb-3">
            <p className="text-sm font-medium text-white">{user?.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">{user?.man_team} · {user?.man_roll}</p>
          </div>
        )}
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center py-1.5 rounded-md text-gray-400 hover:text-white hover:bg-gray-800 transition-colors text-lg"
          title={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
        >
          {collapsed ? '›' : '‹'}
        </button>
      </div>
    </aside>
  );
}
