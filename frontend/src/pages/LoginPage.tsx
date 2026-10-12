import { useState } from 'react';

export function LoginPage() {
  const params = new URLSearchParams(window.location.search);
  const errorCode = params.get('error');

  const [popupOpen, setPopupOpen] = useState(errorCode === 'pending');

  const inlineError = (() => {
    if (errorCode === 'oidc_failed') return '로그인에 실패했습니다. 다시 시도해주세요.';
    if (errorCode === 'rejected')    return '이전에 반려된 계정입니다. Microsoft 계정으로 다시 로그인하면 재신청됩니다.';
    if (errorCode === 'deactivated') return '계정이 비활성화되었습니다. 관리자에게 문의해주세요.';
    return null;
  })();

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-gray-100 flex items-center justify-center p-4">

      {/* 가입 승인 대기 팝업 */}
      {popupOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setPopupOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center">
            {/* 아이콘 */}
            <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-5">
              <svg className="w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
              </svg>
            </div>

            <h2 className="text-lg font-bold text-gray-900 mb-2">가입 승인 대기 중</h2>
            <p className="text-sm text-gray-500 leading-relaxed mb-1">
              가입 신청이 접수되었습니다.
            </p>
            <p className="text-sm text-gray-500 leading-relaxed mb-6">
              관리자가 승인하면 이메일로 안내드리며,<br />
              이후 동일한 Microsoft 계정으로 로그인하실 수 있습니다.
            </p>

            <button
              onClick={() => setPopupOpen(false)}
              className="w-full bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-indigo-700 transition-colors cursor-pointer"
            >
              확인
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <img src="/logo.svg" alt="IMS" className="h-14 w-auto mx-auto mb-3" />
          <h1 className="text-3xl font-bold text-indigo-600">IMS</h1>
          <p className="text-gray-500 mt-1 text-sm">재고관리 시스템</p>
        </div>

        {/* pending: 팝업이 닫힌 뒤에도 인라인 안내 표시 */}
        {errorCode === 'pending' && !popupOpen && (
          <div className="mb-4 px-4 py-3 rounded-lg text-sm bg-blue-50 border border-blue-200 text-blue-700">
            가입 승인 대기 중입니다. 관리자 승인 후 로그인 가능합니다.
          </div>
        )}

        {inlineError && (
          <div className="mb-4 px-4 py-3 rounded-lg text-sm bg-red-50 border border-red-200 text-red-600">
            {inlineError}
          </div>
        )}

        <a
          href="/api/auth/oidc"
          className="flex items-center justify-center gap-2 w-full bg-indigo-600 text-white rounded-lg py-3 text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="1" y="1" width="9" height="9" fill="#F35325"/>
            <rect x="11" y="1" width="9" height="9" fill="#81BC06"/>
            <rect x="1" y="11" width="9" height="9" fill="#05A6F0"/>
            <rect x="11" y="11" width="9" height="9" fill="#FFBA08"/>
          </svg>
          Microsoft 계정으로 로그인
        </a>
      </div>
    </div>
  );
}
