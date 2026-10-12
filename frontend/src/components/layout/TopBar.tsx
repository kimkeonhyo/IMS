import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';

const ROLE_LABEL: Record<string, string> = {
  MASTER: 'MASTER (최고관리자)',
  ADMIN:  'ADMIN (팀장)',
  USER:   'USER (일반)',
};

interface TopBarProps {
  title: string;
}

export function TopBar({ title }: TopBarProps) {
  const { logout, user } = useAuthStore();
  const navigate = useNavigate();
  const [showProfile, setShowProfile] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 fixed top-0 left-60 right-0 z-20">
      <h1 className="text-lg font-semibold text-gray-900">{title}</h1>

      <div className="flex items-center gap-4">
        {/* 사용자 이름 — 호버 시 프로필 팝오버 */}
        {user && (
          <div
            className="relative"
            onMouseEnter={() => setShowProfile(true)}
            onMouseLeave={() => setShowProfile(false)}
          >
            <button className="flex items-center gap-2 cursor-default select-none">
              <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                {user.name.charAt(0)}
              </div>
              <span className="text-sm font-medium text-gray-700">{user.name}</span>
            </button>

            {showProfile && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-lg border border-gray-200 p-4 z-50">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
                    {user.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{user.name}</p>
                    <p className="text-xs text-gray-500 truncate">{user.man_id}</p>
                  </div>
                </div>
                <div className="space-y-1.5 text-sm border-t border-gray-100 pt-3">
                  <div className="flex justify-between">
                    <span className="text-gray-500">사번</span>
                    <span className="font-mono text-xs text-gray-700">{user.man_no}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">소속팀</span>
                    <span className="text-gray-700">{user.man_team}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">역할</span>
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                      user.man_roll === 'MASTER' ? 'bg-purple-100 text-purple-700'
                      : user.man_roll === 'ADMIN' ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-600'
                    }`}>
                      {ROLE_LABEL[user.man_roll] ?? user.man_roll}
                    </span>
                  </div>
                  {user.email && (
                    <div className="flex justify-between gap-2">
                      <span className="text-gray-500 shrink-0">이메일</span>
                      <span className="text-gray-700 text-xs truncate">{user.email}</span>
                    </div>
                  )}
                  {user.phone && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">연락처</span>
                      <span className="text-gray-700">{user.phone}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-500">권한</span>
                    <span className="text-gray-700">{(user.permissions ?? []).length}개</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <button
          onClick={handleLogout}
          className="text-sm text-gray-500 hover:text-red-600 transition-colors cursor-pointer"
        >
          로그아웃
        </button>
      </div>
    </header>
  );
}
