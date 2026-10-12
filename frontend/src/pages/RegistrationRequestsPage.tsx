import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authApi, type RegistrationRequest, type ApproveDto, type RejectDto } from '../api/auth';
import { teamsApi } from '../api/teams';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';

const ROLES: { value: ApproveDto['man_roll']; label: string }[] = [
  { value: 'USER',   label: 'USER (일반)' },
  { value: 'ADMIN',  label: 'ADMIN (팀장)' },
  { value: 'MASTER', label: 'MASTER (최고관리자)' },
];

function StatusBadge({ status }: { status: RegistrationRequest['status'] }) {
  const map = {
    PENDING:  'bg-yellow-100 text-yellow-700',
    APPROVED: 'bg-green-100 text-green-700',
    REJECTED: 'bg-red-100 text-red-600',
  };
  const label = { PENDING: '대기', APPROVED: '승인', REJECTED: '반려' };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded ${map[status]}`}>
      {label[status]}
    </span>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

export function RegistrationRequestsPage() {
  const qc = useQueryClient();

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['registration-requests'],
    queryFn: authApi.getRegistrationRequests,
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: teamsApi.findAll,
    select: (data) => data.filter(t => t.is_active === 1),
  });

  // 승인 모달 상태
  const [approveTarget, setApproveTarget] = useState<RegistrationRequest | null>(null);
  const [approveForm, setApproveForm] = useState<{ man_team: string; man_roll: ApproveDto['man_roll'] }>({
    man_team: '',
    man_roll: 'USER',
  });
  // 반려 모달 상태
  const [rejectTarget, setRejectTarget] = useState<RegistrationRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const approveMutation = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: ApproveDto }) =>
      authApi.approveRegistration(id, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['registration-requests'] });
      setApproveTarget(null);
      setApproveForm({ man_team: '', man_roll: 'USER' });
     
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: RejectDto }) =>
      authApi.rejectRegistration(id, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['registration-requests'] });
      setRejectTarget(null);
      setRejectReason('');
    },
  });

  const openApprove = (req: RegistrationRequest) => {
    setApproveTarget(req);
    setApproveForm({ man_team: '', man_roll: 'USER' });
   
  };

  const openReject = (req: RegistrationRequest) => {
    setRejectTarget(req);
    setRejectReason('');
  };

  const handleApprove = () => {
    if (!approveTarget) return;
    approveMutation.mutate({
      id: approveTarget.id,
      dto: { man_team: approveForm.man_team, man_roll: approveForm.man_roll },
    });
  };

  const handleReject = () => {
    if (!rejectTarget) return;
    rejectMutation.mutate({
      id: rejectTarget.id,
      dto: { reason: rejectReason || undefined },
    });
  };

  const pendingRequests = requests.filter(r => r.status === 'PENDING');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">가입 승인 요청</h1>
          <p className="text-sm text-gray-500 mt-0.5">Microsoft 계정으로 로그인한 미승인 사용자 목록입니다.</p>
        </div>
        <span className="text-sm text-gray-500">{pendingRequests.length}건 대기 중</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-sm text-gray-400">
            불러오는 중...
          </div>
        ) : pendingRequests.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-sm text-gray-400 gap-2">
            <span className="text-2xl">✅</span>
            처리할 가입 요청이 없습니다.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left">
                <th className="px-4 py-3 font-medium text-gray-600">이름</th>
                <th className="px-4 py-3 font-medium text-gray-600">이메일</th>
                <th className="px-4 py-3 font-medium text-gray-600">요청일시</th>
                <th className="px-4 py-3 font-medium text-gray-600">상태</th>
                <th className="px-4 py-3 font-medium text-gray-600 text-right">액션</th>
              </tr>
            </thead>
            <tbody>
              {pendingRequests.map(req => (
                <tr key={req.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{req.azure_name}</td>
                  <td className="px-4 py-3 text-gray-600">{req.email}</td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(req.requested_at)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={req.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => openApprove(req)}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors cursor-pointer"
                      >
                        승인
                      </button>
                      <button
                        onClick={() => openReject(req)}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                      >
                        반려
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 승인 모달 */}
      <Modal
        open={!!approveTarget}
        onClose={() => { setApproveTarget(null); setApproveForm({ man_team: '', man_roll: 'USER' }); }}
        title="가입 승인"
        size="sm"
      >
        <div className="p-5 space-y-4">
          {approveTarget && (
            <div className="bg-gray-50 rounded-lg px-3 py-2.5 text-sm text-gray-600">
              <span className="font-medium text-gray-900">{approveTarget.azure_name}</span>
              <span className="mx-1.5 text-gray-400">·</span>
              {approveTarget.email}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">소속팀 *</label>
            <select
              value={approveForm.man_team}
              onChange={e => setApproveForm(f => ({ ...f, man_team: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
            >
              <option value="">팀 선택</option>
              {teams.map(t => (
                <option key={t.team_code} value={t.team_name}>{t.team_name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">역할 *</label>
            <select
              value={approveForm.man_roll}
              onChange={e => setApproveForm(f => ({ ...f, man_roll: e.target.value as ApproveDto['man_roll'] }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
            >
              {ROLES.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          <p className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2.5 text-xs text-gray-600">
            권한은 역할에 따라 자동으로 적용됩니다. 역할별 권한은 <strong>운영관리 &gt; 권한관리</strong>에서 설정합니다.
          </p>

          <div className="flex gap-2 justify-end pt-1">
            <Button
              variant="secondary"
              onClick={() => { setApproveTarget(null); setApproveForm({ man_team: '', man_roll: 'USER' }); }}
            >
              취소
            </Button>
            <Button
              onClick={handleApprove}
              loading={approveMutation.isPending}
              disabled={!approveForm.man_team.trim()}
            >
              승인
            </Button>
          </div>
        </div>
      </Modal>

      {/* 반려 모달 */}
      <Modal
        open={!!rejectTarget}
        onClose={() => { setRejectTarget(null); setRejectReason(''); }}
        title="가입 반려"
        size="sm"
      >
        <div className="p-5 space-y-4">
          {rejectTarget && (
            <div className="bg-gray-50 rounded-lg px-3 py-2.5 text-sm text-gray-600">
              <span className="font-medium text-gray-900">{rejectTarget.azure_name}</span>
              <span className="mx-1.5 text-gray-400">·</span>
              {rejectTarget.email}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">반려 사유 (선택)</label>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="반려 사유를 입력하세요 (선택사항)"
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
            />
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <Button
              variant="secondary"
              onClick={() => { setRejectTarget(null); setRejectReason(''); }}
            >
              취소
            </Button>
            <Button
              onClick={handleReject}
              loading={rejectMutation.isPending}
            >
              반려
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
