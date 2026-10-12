import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  dcInventoryApi,
  type DcRack,
  type DcDevice,
  type DcIpAddress,
  type DcConnection,
  type CreateDcRackDto,
  type CreateDcDeviceDto,
  type CreateDcIpDto,
  type CreateDcConnectionDto,
} from '../api/dcInventory';
import { Table } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input, Textarea, Select } from '../components/ui/Input';
import { useAuthStore } from '../store/auth.store';

type Tab = 'racks' | 'devices' | 'ips' | 'connections';

// ─── 장비 role 배지 색상 ─────────────────────────────────────────────────────
function roleColor(role: string): 'blue' | 'purple' | 'orange' | 'green' | 'red' | 'gray' {
  const map: Record<string, 'blue' | 'purple' | 'orange' | 'green' | 'red' | 'gray'> = {
    server: 'blue', switch: 'purple', router: 'orange', storage: 'green', firewall: 'red',
  };
  return map[role.toLowerCase()] ?? 'gray';
}

export function DcInventoryPage() {
  const { isAdmin } = useAuthStore();
  const canManage = isAdmin();
  const [tab, setTab] = useState<Tab>('racks');

  const tabCls = (t: Tab) =>
    `px-4 py-1.5 text-sm transition-colors ${tab === t ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 justify-between flex-wrap">
        <h1 className="text-xl font-bold text-gray-900">인프라 대장</h1>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          <button onClick={() => setTab('racks')} className={tabCls('racks')}>랙</button>
          <button onClick={() => setTab('devices')} className={tabCls('devices')}>장비</button>
          <button onClick={() => setTab('ips')} className={tabCls('ips')}>IP</button>
          <button onClick={() => setTab('connections')} className={tabCls('connections')}>연결</button>
        </div>
      </div>

      {tab === 'racks' && <RacksTab canManage={canManage} />}
      {tab === 'devices' && <DevicesTab canManage={canManage} />}
      {tab === 'ips' && <IpsTab canManage={canManage} />}
      {tab === 'connections' && <ConnectionsTab canManage={canManage} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 랙 탭
// ═══════════════════════════════════════════════════════════════════════════
const EMPTY_RACK: CreateDcRackDto = { name: '', site_storage_code: '', u_height: 42, note: '' };

function RacksTab({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ['dc-racks'], queryFn: dcInventoryApi.findRacks });

  const [detailId, setDetailId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateDcRackDto>(EMPTY_RACK);

  const reset = () => { setForm(EMPTY_RACK); setEditId(null); };

  const createMut = useMutation({
    mutationFn: (dto: CreateDcRackDto) => dcInventoryApi.createRack(dto),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['dc-racks'] }); setFormOpen(false); reset(); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: CreateDcRackDto }) => dcInventoryApi.updateRack(id, dto),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['dc-racks'] });
      qc.invalidateQueries({ queryKey: ['dc-rack', id] });
      setFormOpen(false); reset();
    },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => dcInventoryApi.removeRack(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['dc-racks'] }); setDetailId(null); },
  });

  const openCreate = () => { reset(); setFormOpen(true); };
  const openEdit = (r: DcRack) => {
    setEditId(r.id);
    setForm({ name: r.name, site_storage_code: r.site_storage_code ?? '', u_height: r.u_height, note: r.note ?? '' });
    setFormOpen(true);
  };

  const submit = () => {
    const dto: CreateDcRackDto = {
      name: form.name.trim(),
      site_storage_code: form.site_storage_code?.trim() || null,
      u_height: Number(form.u_height) || 42,
      note: form.note?.trim() || null,
    };
    if (editId) updateMut.mutate({ id: editId, dto });
    else createMut.mutate(dto);
  };

  const columns = [
    { key: 'name', header: '랙명', render: (r: DcRack) => <span className="font-medium text-gray-900">{r.name}</span> },
    { key: 'site', header: '사이트', render: (r: DcRack) => r.site_storage_code ?? '-' },
    { key: 'u_height', header: 'U높이', render: (r: DcRack) => <span className="font-mono text-xs">{r.u_height}U</span> },
    { key: 'note', header: '메모', render: (r: DcRack) => <span className="text-gray-500 text-xs">{r.note ?? '-'}</span> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 justify-between">
        <span className="text-sm text-gray-500">{data.length}개 랙</span>
        {canManage && <Button onClick={openCreate}>+ 랙 등록</Button>}
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <Table columns={columns} data={data} rowKey={r => r.id} loading={isLoading} onRowClick={r => setDetailId(r.id)} />
      </div>

      <Modal open={formOpen} onClose={() => { setFormOpen(false); reset(); }} title={editId ? '랙 수정' : '랙 등록'} size="md">
        <div className="p-5 space-y-4">
          <Input label="랙명 *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="예: RACK-A01" />
          <Input label="사이트/창고코드" value={form.site_storage_code ?? ''} onChange={e => setForm(f => ({ ...f, site_storage_code: e.target.value }))} placeholder="예: SEOUL-IDC" />
          <Input label="U높이 *" type="number" value={form.u_height} onChange={e => setForm(f => ({ ...f, u_height: Number(e.target.value) }))} />
          <Textarea label="메모 (선택)" value={form.note ?? ''} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" onClick={() => { setFormOpen(false); reset(); }}>닫기</Button>
            <Button onClick={submit} loading={createMut.isPending || updateMut.isPending} disabled={!form.name.trim() || !form.u_height}>
              {editId ? '수정' : '등록'}
            </Button>
          </div>
        </div>
      </Modal>

      <RackLayoutModal
        rackId={detailId}
        canManage={canManage}
        onClose={() => setDetailId(null)}
        onEdit={openEdit}
        onDelete={id => { if (window.confirm('이 랙을 삭제하시겠습니까?')) deleteMut.mutate(id); }}
        deleting={deleteMut.isPending}
      />
    </div>
  );
}

// ─── 랙 배치도 (U-slot 세로 뷰) ──────────────────────────────────────────────
function RackLayoutModal({
  rackId, canManage, onClose, onEdit, onDelete, deleting,
}: {
  rackId: string | null;
  canManage: boolean;
  onClose: () => void;
  onEdit: (r: DcRack) => void;
  onDelete: (id: string) => void;
  deleting: boolean;
}) {
  const { data: rack } = useQuery({
    queryKey: ['dc-rack', rackId],
    queryFn: () => dcInventoryApi.findRack(rackId!),
    enabled: !!rackId,
  });

  // U번호 → 그 U에서 시작하는 장비
  const deviceAtU = useMemo(() => {
    const map = new Map<number, DcDevice>();
    if (!rack) return map;
    for (const d of rack.devices) {
      if (d.position_u != null) map.set(d.position_u, d);
    }
    return map;
  }, [rack]);

  // position_u 없는 미배치 장비
  const unplaced = rack?.devices.filter(d => d.position_u == null) ?? [];

  return (
    <Modal open={!!rackId} onClose={onClose} title="랙 배치도" size="lg">
      {rack && (
        <div className="p-5 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm flex-1">
              <div><span className="text-gray-500">랙명:</span> <span className="font-medium ml-1">{rack.name}</span></div>
              <div><span className="text-gray-500">사이트:</span> <span className="ml-1">{rack.site_storage_code ?? '-'}</span></div>
              <div><span className="text-gray-500">U높이:</span> <span className="font-mono ml-1">{rack.u_height}U</span></div>
              <div><span className="text-gray-500">장비 수:</span> <span className="ml-1">{rack.devices.length}대</span></div>
              {rack.note && <div className="col-span-2"><span className="text-gray-500">메모:</span> <span className="ml-1">{rack.note}</span></div>}
            </div>
            {canManage && (
              <div className="flex flex-col gap-2 shrink-0">
                <Button size="sm" variant="secondary" onClick={() => onEdit(rack)}>수정</Button>
                <Button size="sm" variant="danger" onClick={() => onDelete(rack.id)} loading={deleting}>삭제</Button>
              </div>
            )}
          </div>

          {/* U-slot 세로 배치도 (위=최상단 U) */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">배치도</h3>
            <div className="border border-gray-300 rounded-lg overflow-hidden bg-gray-50">
              {Array.from({ length: rack.u_height }, (_, i) => rack.u_height - i).map(u => {
                const dev = deviceAtU.get(u);
                if (dev) {
                  const span = Math.max(1, dev.u_size);
                  return (
                    <div
                      key={u}
                      className="flex items-center border-b border-gray-200 bg-indigo-50"
                      style={{ minHeight: `${span * 28}px` }}
                    >
                      <span className="w-12 shrink-0 text-center text-[10px] font-mono text-gray-400 border-r border-gray-200 self-stretch flex items-center justify-center">
                        U{u}
                      </span>
                      <div className="flex-1 px-3 py-1.5 flex items-center gap-2">
                        <span className="font-medium text-sm text-gray-900">{dev.name}</span>
                        <Badge label={dev.role} color={roleColor(dev.role)} />
                        {dev.u_size > 1 && <span className="text-[10px] text-gray-400 font-mono">{dev.u_size}U</span>}
                        {dev.mgmt_ip && <span className="text-[10px] font-mono text-gray-400 ml-auto">{dev.mgmt_ip}</span>}
                      </div>
                    </div>
                  );
                }
                // 이 U가 아래쪽 장비에 의해 점유되었는지 검사
                const occupied = rack.devices.some(
                  d => d.position_u != null && u > d.position_u && u < d.position_u + Math.max(1, d.u_size),
                );
                if (occupied) return null;
                return (
                  <div key={u} className="flex items-center border-b border-gray-200" style={{ minHeight: 28 }}>
                    <span className="w-12 shrink-0 text-center text-[10px] font-mono text-gray-300 border-r border-gray-200 self-stretch flex items-center justify-center">
                      U{u}
                    </span>
                    <div className="flex-1 px-3 py-1.5 text-[11px] text-gray-300">비어 있음</div>
                  </div>
                );
              })}
            </div>
          </div>

          {unplaced.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">미배치 장비 (U위치 없음)</h3>
              <div className="flex flex-wrap gap-2">
                {unplaced.map(d => (
                  <span key={d.id} className="inline-flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white">
                    <span className="font-medium text-gray-900">{d.name}</span>
                    <Badge label={d.role} color={roleColor(d.role)} />
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 장비 탭
// ═══════════════════════════════════════════════════════════════════════════
const ROLE_OPTIONS = [
  { value: 'server', label: 'server' },
  { value: 'switch', label: 'switch' },
  { value: 'router', label: 'router' },
  { value: 'firewall', label: 'firewall' },
  { value: 'storage', label: 'storage' },
  { value: 'other', label: 'other' },
];
const EMPTY_DEVICE: CreateDcDeviceDto = {
  name: '', role: 'server', rack_id: null, position_u: null, u_size: 1,
  mgmt_ip: '', model: '', serial_no: '', note: '',
};

function DevicesTab({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ['dc-devices'], queryFn: () => dcInventoryApi.findDevices() });
  const { data: racks = [] } = useQuery({ queryKey: ['dc-racks'], queryFn: dcInventoryApi.findRacks });

  const [search, setSearch] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateDcDeviceDto>(EMPTY_DEVICE);

  const reset = () => { setForm(EMPTY_DEVICE); setEditId(null); };

  const createMut = useMutation({
    mutationFn: (dto: CreateDcDeviceDto) => dcInventoryApi.createDevice(dto),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['dc-devices'] }); setFormOpen(false); reset(); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: CreateDcDeviceDto }) => dcInventoryApi.updateDevice(id, dto),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['dc-devices'] });
      qc.invalidateQueries({ queryKey: ['dc-device', id] });
      setFormOpen(false); reset();
    },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => dcInventoryApi.removeDevice(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['dc-devices'] }); setDetailId(null); },
  });

  const openCreate = () => { reset(); setFormOpen(true); };
  const openEdit = (d: DcDevice) => {
    setEditId(d.id);
    setForm({
      name: d.name, role: d.role, rack_id: d.rack_id, position_u: d.position_u, u_size: d.u_size,
      mgmt_ip: d.mgmt_ip ?? '', model: d.model ?? '', serial_no: d.serial_no ?? '',
      note: d.note ?? '',
    });
    setFormOpen(true);
  };

  const submit = () => {
    const dto: CreateDcDeviceDto = {
      name: form.name.trim(),
      role: form.role,
      rack_id: form.rack_id || null,
      position_u: form.position_u != null && String(form.position_u) !== '' ? Number(form.position_u) : null,
      u_size: Number(form.u_size) || 1,
      mgmt_ip: form.mgmt_ip?.trim() || null,
      model: form.model?.trim() || null,
      serial_no: form.serial_no?.trim() || null,
      note: form.note?.trim() || null,
    };
    if (editId) updateMut.mutate({ id: editId, dto });
    else createMut.mutate(dto);
  };

  const filtered = data.filter(d => {
    if (!search) return true;
    const q = search.toLowerCase();
    return d.name.toLowerCase().includes(q)
      || d.role.toLowerCase().includes(q)
      || (d.mgmt_ip ?? '').toLowerCase().includes(q)
      || (d.model ?? '').toLowerCase().includes(q)
      || (d.rack_name ?? '').toLowerCase().includes(q);
  });

  const columns = [
    { key: 'name', header: '장비명', render: (r: DcDevice) => <span className="font-medium text-gray-900">{r.name}</span> },
    { key: 'role', header: '역할', render: (r: DcDevice) => <Badge label={r.role} color={roleColor(r.role)} /> },
    { key: 'rack', header: '랙 / U위치', render: (r: DcDevice) => (
      <span className="text-xs">{r.rack_name ?? '-'}{r.position_u != null ? ` · U${r.position_u}` : ''}</span>
    ) },
    { key: 'mgmt_ip', header: '관리 IP', render: (r: DcDevice) => <span className="font-mono text-xs text-gray-500">{r.mgmt_ip ?? '-'}</span> },
    { key: 'model', header: '모델', render: (r: DcDevice) => <span className="text-xs">{r.model ?? '-'}</span> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 justify-between">
        <div className="flex gap-2 items-center">
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="장비명·역할·IP·모델·랙 검색"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 w-56"
          />
          <span className="text-sm text-gray-500">{filtered.length}대</span>
        </div>
        {canManage && <Button onClick={openCreate}>+ 장비 등록</Button>}
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <Table columns={columns} data={filtered} rowKey={r => r.id} loading={isLoading} onRowClick={r => setDetailId(r.id)} />
      </div>

      <Modal open={formOpen} onClose={() => { setFormOpen(false); reset(); }} title={editId ? '장비 수정' : '장비 등록'} size="md">
        <div className="p-5 space-y-4">
          <Input label="장비명 *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="예: web-01" />
          <div className="grid grid-cols-2 gap-3">
            <Select label="역할 *" value={form.role} onChange={v => setForm(f => ({ ...f, role: v }))} options={ROLE_OPTIONS} />
            <Select
              label="랙"
              value={form.rack_id ?? ''}
              onChange={v => setForm(f => ({ ...f, rack_id: v || null }))}
              options={racks.map(r => ({ value: r.id, label: r.name }))}
              placeholder="(랙 없음)"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="U위치 (position_u)" type="number" value={form.position_u ?? ''} onChange={e => setForm(f => ({ ...f, position_u: e.target.value === '' ? null : Number(e.target.value) }))} />
            <Input label="U크기 *" type="number" value={form.u_size} onChange={e => setForm(f => ({ ...f, u_size: Number(e.target.value) }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="관리 IP" value={form.mgmt_ip ?? ''} onChange={e => setForm(f => ({ ...f, mgmt_ip: e.target.value }))} placeholder="예: 192.0.2.1" />
            <Input label="모델" value={form.model ?? ''} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} />
          </div>
          <Input label="시리얼 번호" value={form.serial_no ?? ''} onChange={e => setForm(f => ({ ...f, serial_no: e.target.value }))} />
          <Textarea label="메모 (선택)" value={form.note ?? ''} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" onClick={() => { setFormOpen(false); reset(); }}>닫기</Button>
            <Button onClick={submit} loading={createMut.isPending || updateMut.isPending} disabled={!form.name.trim()}>
              {editId ? '수정' : '등록'}
            </Button>
          </div>
        </div>
      </Modal>

      <DeviceDetailModal
        deviceId={detailId}
        canManage={canManage}
        onClose={() => setDetailId(null)}
        onEdit={openEdit}
        onDelete={id => { if (window.confirm('이 장비를 삭제하시겠습니까?')) deleteMut.mutate(id); }}
        deleting={deleteMut.isPending}
      />
    </div>
  );
}

function DeviceDetailModal({
  deviceId, canManage, onClose, onEdit, onDelete, deleting,
}: {
  deviceId: string | null;
  canManage: boolean;
  onClose: () => void;
  onEdit: (d: DcDevice) => void;
  onDelete: (id: string) => void;
  deleting: boolean;
}) {
  const { data: detail } = useQuery({
    queryKey: ['dc-device', deviceId],
    queryFn: () => dcInventoryApi.findDevice(deviceId!),
    enabled: !!deviceId,
  });

  return (
    <Modal open={!!deviceId} onClose={onClose} title="장비 상세" size="lg">
      {detail && (
        <div className="p-5 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm flex-1">
              <div><span className="text-gray-500">장비명:</span> <span className="font-medium ml-1">{detail.name}</span></div>
              <div><span className="text-gray-500">역할:</span> <Badge label={detail.role} color={roleColor(detail.role)} className="ml-1" /></div>
              <div><span className="text-gray-500">랙:</span> <span className="ml-1">{detail.rack_name ?? '-'}{detail.position_u != null ? ` · U${detail.position_u}` : ''}</span></div>
              <div><span className="text-gray-500">U크기:</span> <span className="font-mono ml-1">{detail.u_size}U</span></div>
              <div><span className="text-gray-500">관리 IP:</span> <span className="font-mono ml-1">{detail.mgmt_ip ?? '-'}</span></div>
              <div><span className="text-gray-500">모델:</span> <span className="ml-1">{detail.model ?? '-'}</span></div>
              <div><span className="text-gray-500">시리얼:</span> <span className="font-mono ml-1">{detail.serial_no ?? '-'}</span></div>
              {detail.note && <div className="col-span-2"><span className="text-gray-500">메모:</span> <span className="ml-1">{detail.note}</span></div>}
            </div>
            {canManage && (
              <div className="flex flex-col gap-2 shrink-0">
                <Button size="sm" variant="secondary" onClick={() => onEdit(detail)}>수정</Button>
                <Button size="sm" variant="danger" onClick={() => onDelete(detail.id)} loading={deleting}>삭제</Button>
              </div>
            )}
          </div>

          {/* 연결 목록 */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">연결 ({detail.connections.length})</h3>
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-4 py-2.5 font-medium text-gray-600">A (포트)</th>
                    <th className="px-4 py-2.5 font-medium text-gray-600">B (포트)</th>
                    <th className="px-4 py-2.5 font-medium text-gray-600">케이블</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.connections.length === 0 ? (
                    <tr><td colSpan={3} className="text-center py-6 text-gray-400">연결이 없습니다.</td></tr>
                  ) : detail.connections.map(c => (
                    <tr key={c.id} className="border-b border-gray-100">
                      <td className="px-4 py-2.5 text-gray-800">{c.a_device_name ?? c.a_device_id}{c.a_port ? ` : ${c.a_port}` : ''}</td>
                      <td className="px-4 py-2.5 text-gray-800">{c.b_device_name ?? c.b_device_id}{c.b_port ? ` : ${c.b_port}` : ''}</td>
                      <td className="px-4 py-2.5 text-gray-600 text-xs">{c.cable_type ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* IP 목록 */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">IP 주소 ({detail.ips.length})</h3>
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-4 py-2.5 font-medium text-gray-600">주소</th>
                    <th className="px-4 py-2.5 font-medium text-gray-600">역할</th>
                    <th className="px-4 py-2.5 font-medium text-gray-600">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.ips.length === 0 ? (
                    <tr><td colSpan={3} className="text-center py-6 text-gray-400">IP가 없습니다.</td></tr>
                  ) : detail.ips.map(ip => (
                    <tr key={ip.id} className="border-b border-gray-100">
                      <td className="px-4 py-2.5 font-mono text-gray-800">{ip.address}</td>
                      <td className="px-4 py-2.5 text-gray-600 text-xs">{ip.role ?? '-'}</td>
                      <td className="px-4 py-2.5"><Badge label={ip.status} color={ipStatusColor(ip.status)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// IP 탭
// ═══════════════════════════════════════════════════════════════════════════
function ipStatusColor(status: string): 'green' | 'yellow' | 'red' | 'gray' {
  const map: Record<string, 'green' | 'yellow' | 'red' | 'gray'> = {
    allocated: 'green', reserved: 'yellow', available: 'gray', free: 'gray', deprecated: 'red',
  };
  return map[status.toLowerCase()] ?? 'gray';
}
const IP_STATUS_OPTIONS = [
  { value: 'allocated', label: 'allocated' },
  { value: 'reserved', label: 'reserved' },
  { value: 'available', label: 'available' },
  { value: 'deprecated', label: 'deprecated' },
];
const EMPTY_IP: CreateDcIpDto = { address: '', prefix: '', role: '', status: 'allocated', device_id: null, description: '' };

function IpsTab({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ['dc-ips'], queryFn: () => dcInventoryApi.findIps() });
  const { data: devices = [] } = useQuery({ queryKey: ['dc-devices'], queryFn: () => dcInventoryApi.findDevices() });

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateDcIpDto>(EMPTY_IP);

  const reset = () => { setForm(EMPTY_IP); setEditId(null); };

  const createMut = useMutation({
    mutationFn: (dto: CreateDcIpDto) => dcInventoryApi.createIp(dto),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['dc-ips'] }); setFormOpen(false); reset(); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: CreateDcIpDto }) => dcInventoryApi.updateIp(id, dto),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['dc-ips'] }); setFormOpen(false); reset(); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => dcInventoryApi.removeIp(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['dc-ips'] }); },
  });

  const openCreate = () => { reset(); setFormOpen(true); };
  const openEdit = (ip: DcIpAddress) => {
    setEditId(ip.id);
    setForm({
      address: ip.address, prefix: ip.prefix ?? '', role: ip.role ?? '', status: ip.status,
      device_id: ip.device_id, description: ip.description ?? '',
    });
    setFormOpen(true);
  };

  const submit = () => {
    const dto: CreateDcIpDto = {
      address: form.address.trim(),
      prefix: form.prefix?.trim() || null,
      role: form.role?.trim() || null,
      status: form.status,
      device_id: form.device_id || null,
      description: form.description?.trim() || null,
    };
    if (editId) updateMut.mutate({ id: editId, dto });
    else createMut.mutate(dto);
  };

  // prefix별 그룹화
  const groups = useMemo(() => {
    const map = new Map<string, DcIpAddress[]>();
    for (const ip of data) {
      const key = ip.prefix ?? '(prefix 없음)';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ip);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 justify-between">
        <span className="text-sm text-gray-500">{data.length}개 IP</span>
        {canManage && <Button onClick={openCreate}>+ IP 등록</Button>}
      </div>

      {isLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 py-10 text-center text-gray-400">불러오는 중...</div>
      ) : groups.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-10 text-center text-gray-400">데이터가 없습니다.</div>
      ) : (
        <div className="space-y-4">
          {groups.map(([prefix, ips]) => (
            <div key={prefix} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
                <span className="font-mono text-sm font-semibold text-gray-800">{prefix}</span>
                <span className="text-xs text-gray-400">{ips.length}개</span>
              </div>
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="px-4 py-2.5 font-medium text-gray-600">주소</th>
                    <th className="px-4 py-2.5 font-medium text-gray-600">역할</th>
                    <th className="px-4 py-2.5 font-medium text-gray-600">상태</th>
                    <th className="px-4 py-2.5 font-medium text-gray-600">연결 장비</th>
                    {canManage && <th className="px-4 py-2.5 font-medium text-gray-600 text-right">작업</th>}
                  </tr>
                </thead>
                <tbody>
                  {ips.map(ip => (
                    <tr key={ip.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2.5 font-mono text-gray-800">{ip.address}</td>
                      <td className="px-4 py-2.5 text-gray-600 text-xs">{ip.role ?? '-'}</td>
                      <td className="px-4 py-2.5"><Badge label={ip.status} color={ipStatusColor(ip.status)} /></td>
                      <td className="px-4 py-2.5 text-gray-700 text-xs">{ip.device_name ?? '-'}</td>
                      {canManage && (
                        <td className="px-4 py-2.5 text-right">
                          <div className="inline-flex gap-1">
                            <button onClick={() => openEdit(ip)} className="px-2 py-1 rounded text-xs font-medium bg-indigo-100 text-indigo-700 hover:bg-indigo-200 cursor-pointer transition-colors">수정</button>
                            <button onClick={() => { if (window.confirm('이 IP를 삭제하시겠습니까?')) deleteMut.mutate(ip.id); }} className="px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-600 hover:bg-red-200 cursor-pointer transition-colors">삭제</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      <Modal open={formOpen} onClose={() => { setFormOpen(false); reset(); }} title={editId ? 'IP 수정' : 'IP 등록'} size="md">
        <div className="p-5 space-y-4">
          <Input label="주소 *" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="예: 192.0.2.5" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Prefix" value={form.prefix ?? ''} onChange={e => setForm(f => ({ ...f, prefix: e.target.value }))} placeholder="예: 192.0.2.0/24" />
            <Input label="역할" value={form.role ?? ''} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} placeholder="예: mgmt" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select label="상태 *" value={form.status} onChange={v => setForm(f => ({ ...f, status: v }))} options={IP_STATUS_OPTIONS} />
            <Select
              label="연결 장비"
              value={form.device_id ?? ''}
              onChange={v => setForm(f => ({ ...f, device_id: v || null }))}
              options={devices.map(d => ({ value: d.id, label: d.name }))}
              placeholder="(연결 없음)"
            />
          </div>
          <Textarea label="설명 (선택)" value={form.description ?? ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" onClick={() => { setFormOpen(false); reset(); }}>닫기</Button>
            <Button onClick={submit} loading={createMut.isPending || updateMut.isPending} disabled={!form.address.trim()}>
              {editId ? '수정' : '등록'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 연결 탭
// ═══════════════════════════════════════════════════════════════════════════
const CABLE_OPTIONS = [
  { value: 'copper', label: 'copper' },
  { value: 'fiber', label: 'fiber' },
  { value: 'dac', label: 'dac' },
  { value: 'power', label: 'power' },
];
const EMPTY_CONN: CreateDcConnectionDto = { a_device_id: '', a_port: '', b_device_id: '', b_port: '', cable_type: '', note: '' };

function ConnectionsTab({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ['dc-connections'], queryFn: () => dcInventoryApi.findConnections() });
  const { data: devices = [] } = useQuery({ queryKey: ['dc-devices'], queryFn: () => dcInventoryApi.findDevices() });

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateDcConnectionDto>(EMPTY_CONN);

  const reset = () => { setForm(EMPTY_CONN); setEditId(null); };

  const createMut = useMutation({
    mutationFn: (dto: CreateDcConnectionDto) => dcInventoryApi.createConnection(dto),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['dc-connections'] }); setFormOpen(false); reset(); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: CreateDcConnectionDto }) => dcInventoryApi.updateConnection(id, dto),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['dc-connections'] }); setFormOpen(false); reset(); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => dcInventoryApi.removeConnection(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['dc-connections'] }); },
  });

  const openCreate = () => { reset(); setFormOpen(true); };
  const openEdit = (c: DcConnection) => {
    setEditId(c.id);
    setForm({
      a_device_id: c.a_device_id, a_port: c.a_port ?? '', b_device_id: c.b_device_id, b_port: c.b_port ?? '',
      cable_type: c.cable_type ?? '', note: c.note ?? '',
    });
    setFormOpen(true);
  };

  const submit = () => {
    const dto: CreateDcConnectionDto = {
      a_device_id: form.a_device_id,
      a_port: form.a_port?.trim() || null,
      b_device_id: form.b_device_id,
      b_port: form.b_port?.trim() || null,
      cable_type: form.cable_type?.trim() || null,
      note: form.note?.trim() || null,
    };
    if (editId) updateMut.mutate({ id: editId, dto });
    else createMut.mutate(dto);
  };

  const deviceOptions = devices.map(d => ({ value: d.id, label: d.name }));

  const columns = [
    { key: 'a', header: 'A (장비 : 포트)', render: (c: DcConnection) => (
      <span className="text-gray-800">{c.a_device_name ?? c.a_device_id}{c.a_port ? <span className="font-mono text-xs text-gray-500"> : {c.a_port}</span> : null}</span>
    ) },
    { key: 'arrow', header: '', render: () => <span className="text-gray-400">↔</span>, width: 'w-8' },
    { key: 'b', header: 'B (장비 : 포트)', render: (c: DcConnection) => (
      <span className="text-gray-800">{c.b_device_name ?? c.b_device_id}{c.b_port ? <span className="font-mono text-xs text-gray-500"> : {c.b_port}</span> : null}</span>
    ) },
    { key: 'cable', header: '케이블', render: (c: DcConnection) => <span className="text-xs">{c.cable_type ?? '-'}</span> },
    ...(canManage ? [{
      key: 'actions', header: '작업', width: 'text-right', render: (c: DcConnection) => (
        <div className="inline-flex gap-1 justify-end w-full">
          <button onClick={e => { e.stopPropagation(); openEdit(c); }} className="px-2 py-1 rounded text-xs font-medium bg-indigo-100 text-indigo-700 hover:bg-indigo-200 cursor-pointer transition-colors">수정</button>
          <button onClick={e => { e.stopPropagation(); if (window.confirm('이 연결을 삭제하시겠습니까?')) deleteMut.mutate(c.id); }} className="px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-600 hover:bg-red-200 cursor-pointer transition-colors">삭제</button>
        </div>
      ),
    }] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 justify-between">
        <span className="text-sm text-gray-500">{data.length}개 연결</span>
        {canManage && <Button onClick={openCreate}>+ 연결 등록</Button>}
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <Table columns={columns} data={data} rowKey={c => c.id} loading={isLoading} />
      </div>

      <Modal open={formOpen} onClose={() => { setFormOpen(false); reset(); }} title={editId ? '연결 수정' : '연결 등록'} size="md">
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Select label="A 장비 *" value={form.a_device_id} onChange={v => setForm(f => ({ ...f, a_device_id: v }))} options={deviceOptions} placeholder="선택" />
            <Input label="A 포트" value={form.a_port ?? ''} onChange={e => setForm(f => ({ ...f, a_port: e.target.value }))} placeholder="예: eth0" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select label="B 장비 *" value={form.b_device_id} onChange={v => setForm(f => ({ ...f, b_device_id: v }))} options={deviceOptions} placeholder="선택" />
            <Input label="B 포트" value={form.b_port ?? ''} onChange={e => setForm(f => ({ ...f, b_port: e.target.value }))} placeholder="예: Gi0/1" />
          </div>
          <Select
            label="케이블 종류"
            value={form.cable_type ?? ''}
            onChange={v => setForm(f => ({ ...f, cable_type: v || null }))}
            options={CABLE_OPTIONS}
            placeholder="(선택 안함)"
          />
          <Textarea label="메모 (선택)" value={form.note ?? ''} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" onClick={() => { setFormOpen(false); reset(); }}>닫기</Button>
            <Button onClick={submit} loading={createMut.isPending || updateMut.isPending} disabled={!form.a_device_id || !form.b_device_id}>
              {editId ? '수정' : '등록'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
