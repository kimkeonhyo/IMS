import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { employeesApi, type CreateEmployeeDto, type ImportResult } from '../api/employees';
import { teamsApi } from '../api/teams';
import { Table } from '../components/ui/Table';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input, Select } from '../components/ui/Input';
import { useAuthStore } from '../store/auth.store';
import type { Employee } from '../types';

const ROLES = [{ value: 'MASTER', label: 'MASTER (최고관리자)' }, { value: 'ADMIN', label: 'ADMIN (팀장)' }, { value: 'USER', label: 'USER (일반)' }];

export function EmployeesPage() {
  const qc = useQueryClient();
  const { isMaster, isAdmin, user } = useAuthStore();
  const { data = [], isLoading } = useQuery({ queryKey: ['employees'], queryFn: employeesApi.findAll });
  const { data: teams = [] } = useQuery({ queryKey: ['teams'], queryFn: teamsApi.findAll });
  const teamOptions = teams.filter(t => t.is_active).map(t => ({ value: t.team_name, label: t.team_name }));
  const defaultTeam = teamOptions[0]?.value ?? '';

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState<CreateEmployeeDto & { password: string }>({
    man_no: '', man_id: '', password: '', name: '', man_roll: 'USER', man_team: '', email: '', phone: '',
  });

  // CSV import
  const fileRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const resetForm = () => setForm({ man_no: '', man_id: '', password: '', name: '', man_roll: 'USER', man_team: defaultTeam, email: '', phone: '' });

  const createMut = useMutation({
    mutationFn: (dto: CreateEmployeeDto) => employeesApi.create(dto),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employees'] }); setOpen(false); resetForm(); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: Partial<CreateEmployeeDto> }) => employeesApi.update(id, dto),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employees'] }); setOpen(false); resetForm(); setEditing(null); },
  });
  const toggleMut = useMutation({
    mutationFn: (id: string) => employeesApi.toggleActive(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employees'] }),
  });
  const importMut = useMutation({
    mutationFn: (file: File) => employeesApi.importFile(file),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      setImportResult(result);
      setImportOpen(true);
    },
  });

  const openCreate = () => {
    setEditing(null);
    resetForm();
    if (isAdmin() && !isMaster()) {
      setForm(f => ({ ...f, man_roll: 'USER', man_team: user?.man_team ?? defaultTeam }));
    }
    setOpen(true);
  };
  const openEdit = (emp: Employee) => {
    if (user?.man_roll === 'ADMIN' && emp.man_roll === 'MASTER') return;
    setEditing(emp);
    setForm({ man_id: emp.man_id, password: '', name: emp.name, man_roll: emp.man_roll, man_team: emp.man_team, email: emp.email ?? '', phone: emp.phone ?? '' });
    setOpen(true);
  };
  const handleSave = () => {
    if (editing) {
      const dto: Partial<CreateEmployeeDto> = {
        name: form.name,
        man_team: form.man_team,
        email: form.email || undefined,
        phone: form.phone || undefined,
      };
      if (user?.man_roll === 'MASTER') dto.man_roll = form.man_roll;
      if (form.password) dto.password = form.password;
      updateMut.mutate({ id: editing.man_no, dto });
    } else {
      createMut.mutate({
        ...form,
        man_no: form.man_no || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
      });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) importMut.mutate(file);
    e.target.value = '';
  };

  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  const filteredEmps = data.filter(emp => {
    if (teamFilter && emp.man_team !== teamFilter) return false;
    if (roleFilter && emp.man_roll !== roleFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return emp.man_no.toLowerCase().includes(q) || emp.man_id.toLowerCase().includes(q) || emp.name.toLowerCase().includes(q);
    }
    return true;
  });

  const columns = [
    { key: 'man_no',   header: '사번',   render: (r: Employee) => <span className="font-mono text-xs text-gray-500">{r.man_no}</span> },
    { key: 'man_id',   header: '아이디', render: (r: Employee) => <span className="font-medium">{r.man_id}</span> },
    { key: 'name',     header: '이름' },
    { key: 'man_team', header: '소속팀' },
    { key: 'man_roll', header: '역할',   render: (r: Employee) =>
      <span className={`text-xs font-medium px-2 py-0.5 rounded ${r.man_roll === 'MASTER' ? 'bg-purple-100 text-purple-700' : r.man_roll === 'ADMIN' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
        {r.man_roll}
      </span>
    },
    { key: 'is_active', header: '활성', render: (r: Employee) =>
      isMaster() ? (
        <button
          onClick={e => { e.stopPropagation(); toggleMut.mutate(r.man_no); }}
          className={`text-xs font-medium px-2 py-0.5 rounded cursor-pointer ${r.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}
        >
          {r.is_active ? '활성' : '비활성'}
        </button>
      ) : (
        <span className={`text-xs font-medium ${r.is_active ? 'text-green-600' : 'text-red-400'}`}>
          {r.is_active ? '활성' : '비활성'}
        </span>
      )
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 justify-between">
        <div className="flex gap-2 items-center">
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="사번·아이디·이름 검색"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 w-48"
          />
          <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
            <option value="">전체 팀</option>
            {teamOptions.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
            <option value="">전체 역할</option>
            <option value="MASTER">MASTER</option>
            <option value="ADMIN">ADMIN</option>
            <option value="USER">USER</option>
          </select>
          <span className="text-sm text-gray-500">{filteredEmps.length}건</span>
        </div>
        <div className="flex gap-2">
          {isMaster() && (
            <>
              <a
                href="/templates/employees_template.csv"
                download="employees_template.csv"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <span>⬇</span> 예시 파일
              </a>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xlsm" onChange={handleFileChange} className="hidden" />
              <Button variant="secondary" onClick={() => fileRef.current?.click()} loading={importMut.isPending}>
                CSV/Excel 가져오기
              </Button>
            </>
          )}
          <Button onClick={openCreate}>+ 직원 등록</Button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <Table columns={columns} data={filteredEmps} rowKey={r => r.man_no} loading={isLoading} onRowClick={openEdit} />
      </div>

      {/* 직원 등록/수정 모달 */}
      <Modal open={open} onClose={() => { setOpen(false); setEditing(null); resetForm(); }} title={editing ? '직원 수정' : '직원 등록'} size="sm">
        <div className="p-5 space-y-3">
          {!editing && (
            <Input
              label="사번 (비워두면 자동 채번)"
              value={form.man_no ?? ''}
              onChange={e => setForm(f => ({ ...f, man_no: e.target.value }))}
              placeholder="예) EMP-0001 (선택)"
            />
          )}
          {!editing && <Input label="아이디 *" value={form.man_id} onChange={e => setForm(f => ({ ...f, man_id: e.target.value }))} />}
          <Input label={editing ? '비밀번호 (변경 시만 입력)' : '비밀번호 *'} type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
          <Input label="이름 *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <Select label="소속팀 *" value={form.man_team} onChange={v => setForm(f => ({ ...f, man_team: v }))} options={teamOptions} disabled={!editing && isAdmin() && !isMaster()} />
          <Select label="역할 *" value={form.man_roll} onChange={v => setForm(f => ({ ...f, man_roll: v }))} options={isMaster() ? ROLES : [{ value: 'USER', label: 'USER (일반)' }]} disabled={!editing && isAdmin() && !isMaster()} />
          <Input label="이메일 * (로그인 ID)" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="이메일 주소 (로그인에 사용)" />
          <Input label="연락처" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="010-0000-0000" />

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" onClick={() => { setOpen(false); resetForm(); }}>취소</Button>
            <Button onClick={handleSave} loading={createMut.isPending || updateMut.isPending}>저장</Button>
          </div>
        </div>
      </Modal>

      {/* Import 결과 모달 */}
      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="직원 가져오기 완료" size="sm">
        <div className="p-5 space-y-3">
          {importResult && (
            <>
              <div className="flex gap-4 text-sm">
                <div className="flex-1 bg-green-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-green-600">{importResult.created}</p>
                  <p className="text-gray-500 text-xs mt-1">등록 완료</p>
                </div>
                <div className="flex-1 bg-yellow-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-yellow-600">{importResult.skipped}</p>
                  <p className="text-gray-500 text-xs mt-1">건너뜀</p>
                </div>
              </div>
              {importResult.errors.length > 0 && (
                <div className="bg-red-50 rounded-lg p-3 max-h-40 overflow-y-auto">
                  <p className="text-xs font-semibold text-red-700 mb-1">오류 내역</p>
                  {importResult.errors.map((e, i) => (
                    <p key={i} className="text-xs text-red-600">{e}</p>
                  ))}
                </div>
              )}
            </>
          )}
          <div className="flex justify-end">
            <Button onClick={() => setImportOpen(false)}>확인</Button>
          </div>
        </div>
      </Modal>

    </div>
  );
}
