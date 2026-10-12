import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { teamsApi, type Team, type CreateTeamDto } from '../api/teams';
import { Table } from '../components/ui/Table';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input, Textarea } from '../components/ui/Input';
import { useAuthStore } from '../store/auth.store';

export function TeamsPage() {
  const qc = useQueryClient();
  const { hasPermission } = useAuthStore();
  const { data = [], isLoading } = useQuery({ queryKey: ['teams'], queryFn: teamsApi.findAll });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Team | null>(null);
  const [form, setForm] = useState<CreateTeamDto>({ team_code: '', team_name: '', description: '' });

  const resetForm = () => setForm({ team_code: '', team_name: '', description: '' });

  const createMut = useMutation({
    mutationFn: (dto: CreateTeamDto) => teamsApi.create(dto),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['teams'] }); setOpen(false); resetForm(); },
  });
  const updateMut = useMutation({
    mutationFn: ({ code, dto }: { code: string; dto: Partial<CreateTeamDto> }) => teamsApi.update(code, dto),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['teams'] }); setOpen(false); resetForm(); setEditing(null); },
  });
  const toggleMut = useMutation({
    mutationFn: (code: string) => teamsApi.toggleActive(code),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teams'] }),
  });

  const openCreate = () => { setEditing(null); resetForm(); setOpen(true); };
  const openEdit = (team: Team) => {
    setEditing(team);
    setForm({ team_code: team.team_code, team_name: team.team_name, description: team.description ?? '' });
    setOpen(true);
  };
  const closeModal = () => { setOpen(false); setEditing(null); resetForm(); };

  const [search, setSearch] = useState('');

  const filtered = data.filter(t => {
    if (!search) return true;
    const q = search.toLowerCase();
    return t.team_code.toLowerCase().includes(q) || t.team_name.toLowerCase().includes(q);
  });

  const handleSave = () => {
    if (editing) {
      updateMut.mutate({ code: editing.team_code, dto: { team_name: form.team_name, description: form.description } });
    } else {
      createMut.mutate(form);
    }
  };

  const columns = [
    { key: 'team_code', header: '팀코드', render: (r: Team) => <span className="font-mono text-xs font-semibold text-indigo-600">{r.team_code}</span> },
    { key: 'team_name', header: '팀명', render: (r: Team) => <span className="font-medium">{r.team_name}</span> },
    { key: 'description', header: '설명', render: (r: Team) => r.description ?? '-' },
    { key: 'is_active', header: '활성',
      render: (r: Team) => (
        <button
          onClick={e => { e.stopPropagation(); toggleMut.mutate(r.team_code); }}
          className={`text-xs font-medium px-2 py-0.5 rounded cursor-pointer transition-colors ${
            r.is_active === 1 ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-600 hover:bg-red-200'
          }`}
        >
          {r.is_active === 1 ? '활성' : '비활성'}
        </button>
      )},
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 justify-between">
        <div className="flex gap-2 items-center">
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="코드·팀명 검색"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 w-48"
          />
          <span className="text-sm text-gray-500">{filtered.length}건</span>
        </div>
        {hasPermission('team:create') && <Button onClick={openCreate}>+ 팀 등록</Button>}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <Table columns={columns} data={filtered} rowKey={r => r.team_code} loading={isLoading} onRowClick={openEdit} />
      </div>

      <Modal open={open} onClose={closeModal} title={editing ? `팀 수정 — ${editing.team_code}` : '팀 등록'} size="sm">
        <div className="p-5 space-y-4">
          {editing ? (
            <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm">
              <span className="text-gray-500">팀코드:</span>
              <strong className="font-mono text-indigo-600 ml-1">{editing.team_code}</strong>
              <p className="text-xs text-gray-400 mt-1">팀코드는 변경할 수 없습니다.</p>
            </div>
          ) : (
            <Input label="팀코드 *" value={form.team_code} onChange={e => setForm(f => ({ ...f, team_code: e.target.value }))} placeholder="TEAM-001" />
          )}
          <Input label="팀명 *" value={form.team_name} onChange={e => setForm(f => ({ ...f, team_name: e.target.value }))} placeholder="예) 개발팀" />
          <Textarea label="설명" value={form.description ?? ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="팀 설명 (선택)" />

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" onClick={closeModal}>취소</Button>
            <Button onClick={handleSave} loading={createMut.isPending || updateMut.isPending} disabled={!form.team_name.trim()}>저장</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
