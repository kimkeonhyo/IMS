import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';
import { authApi } from '../api/auth';

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { setAuth } = useAuthStore();
  const [error, setError] = useState('');

  useEffect(() => {
    const token = params.get('token');
    const err   = params.get('error');

    if (err || !token) {
      navigate('/login?error=oidc_failed');
      return;
    }

    // 토큰 임시 저장 → axios interceptor가 자동으로 헤더에 포함
    localStorage.setItem('erp_token', token);

    authApi.me()
      .then((user) => {
        setAuth(token, user);
        navigate('/dashboard', { replace: true });
      })
      .catch(() => {
        localStorage.removeItem('erp_token');
        setError('로그인에 실패했습니다. 등록된 계정인지 확인해주세요.');
      });
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-2xl shadow p-8 max-w-sm w-full text-center space-y-4">
          <p className="text-red-500 text-sm">{error}</p>
          <button
            onClick={() => navigate('/login')}
            className="text-indigo-600 text-sm underline"
          >
            로그인 페이지로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-gray-500 text-sm">로그인 처리 중...</p>
      </div>
    </div>
  );
}
