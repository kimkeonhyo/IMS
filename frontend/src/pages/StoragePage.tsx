import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { storageApi } from '../api/items';
import { Table } from '../components/ui/Table';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import type { Storage } from '../types';
import { useAuthStore } from '../store/auth.store';

export function StoragePage() {
  const qc = useQueryClient();
  const { hasPermission } = useAuthStore();
  const { data = [], isLoading } = useQuery({ queryKey: ['storage'], queryFn: storageApi.findAll });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Storage | null>(null);
  const [form, setForm] = useState({ storage_code: '', storage_name: '', location: '' });
  const [search, setSearch] = useState('');

  const filtered = data.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return s.storage_code.toLowerCase().includes(q) || s.storage_name.toLowerCase().includes(q) || (s.location ?? '').toLowerCase().includes(q);
  });

  const resetForm = () => setForm({ storage_code: '', storage_name: '', location: '' });

  const createMut = useMutation({
    mutationFn: (dto: Partial<Storage>) => storageApi.create(dto),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['storage'] }); setOpen(false); resetForm(); },
  });
  const updateMut = useMutation({
    mutationFn: ({ code, dto }: { code: string; dto: Partial<Storage> }) => storageApi.update(code, dto),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['storage'] }); setOpen(false); resetForm(); setEditing(null); },
  });

  const openCreate = () => { setEditing(null); resetForm(); setOpen(true); };
  const openEdit = (s: Storage) => {
    setEditing(s);
    setForm({ storage_code: s.storage_code, storage_name: s.storage_name, location: s.location ?? '' });
    setOpen(true);
  };

  const handleSave = () => {
    if (editing) {
      const { storage_code: _, ...updateDto } = form;
      updateMut.mutate({ code: editing.storage_code, dto: updateDto });
    } else {
      createMut.mutate(form);
    }
  };

  const columns = [
    { key: 'storage_code', header: '창고코드', render: (r: Storage) => <span className="font-mono text-xs text-gray-500">{r.storage_code}</span> },
    { key: 'storage_name', header: '창고명',   render: (r: Storage) => <span className="font-medium">{r.storage_name}</span> },
    { key: 'location',     header: '위치',    render: (r: Storage) => r.location ?? '-' },
    { key: 'is_active',    header: '활성',    render: (r: Storage) => r.is_active ? <span className="text-green-600 text-xs font-medium">활성</span> : <span className="text-red-400 text-xs">비활성</span> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 justify-between">
        <div className="flex gap-2 items-center">
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="코드·창고명·위치 검색"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 w-56"
          />
          <span className="text-sm text-gray-500">{filtered.length}건</span>
        </div>
        {hasPermission('storage:create') && <Button onClick={openCreate}>+ 창고 등록</Button>}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <Table columns={columns} data={filtered} rowKey={r => r.storage_code} loading={isLoading} onRowClick={openEdit} />
      </div>

      <Modal open={open} onClose={() => { setOpen(false); setEditing(null); resetForm(); }} title={editing ? '창고 수정' : '창고 등록'} size="sm">
        <div className="p-5 space-y-4">
          {!editing && <Input label="창고코드 *" value={form.storage_code} onChange={e => setForm(f => ({ ...f, storage_code: e.target.value }))} placeholder="WH-001" />}
          <Input label="창고명 *" value={form.storage_name} onChange={e => setForm(f => ({ ...f, storage_name: e.target.value }))} />
          <Input label="위치" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="A동 1층" />

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" onClick={() => { setOpen(false); resetForm(); }}>취소</Button>
            <Button onClick={handleSave} loading={createMut.isPending || updateMut.isPending}>저장</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
