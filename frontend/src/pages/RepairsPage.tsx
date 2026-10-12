import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { repairsApi, type Repair, type CreateRepairDto } from '../api/repairs';
import { itemsApi, storageApi } from '../api/items';
import { serialNumbersApi } from '../api/serialNumbers';
import { SerialChip, useLatestSerialImages } from '../components/SerialChip';
import { AssetImageGallery } from '../components/AssetImages';
import type { SerialNumber } from '../types';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Table } from '../components/ui/Table';
import { Input, Textarea, Select } from '../components/ui/Input';
import { useAuthStore } from '../store/auth.store';

const STATUS_LABEL: Record<string, string> = {
  REPORTED: '고장신고', REPAIRING: '수리중', DONE: '수리완료', CANCELLED: '취소됨',
};
const STATUS_COLOR: Record<string, 'red' | 'yellow' | 'green' | 'gray'> = {
  REPORTED: 'red', REPAIRING: 'yellow', DONE: 'green', CANCELLED: 'gray',
};

/** 고장 신고 대상 S/N 선택 — 재고사용 등록과 같은 방식 (호버로 사양·사진 확인) */
function SerialPicker({ item_code, storage_code, selected, onChange }: {
  item_code: string; storage_code: string; selected: number[]; onChange: (ids: number[]) => void;
}) {
  const [snSearch, setSnSearch] = useState('');
  const [snMode, setSnMode] = useState<'serial' | 'asset'>('serial');
  const { data: serials = [] } = useQuery({
    queryKey: ['serial-numbers', item_code, storage_code],
    queryFn: () => serialNumbersApi.findAvailable(item_code, storage_code),
    enabled: !!item_code && !!storage_code,
  });
  const snImages = useLatestSerialImages(serials.map((sn: SerialNumber) => sn.id));
  if (!serials.length) return <p className="text-xs text-gray-400 mt-1">사용 가능한 S/N 없음</p>;

  const toggle = (id: number) =>
    onChange(selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id]);
  const snLabel = (sn: SerialNumber) =>
    snMode === 'asset' ? (sn.asset_no ?? sn.serial_no) : sn.serial_no;
  const filtered = snSearch.trim()
    ? serials.filter((sn: SerialNumber) => snLabel(sn).toLowerCase().includes(snSearch.toLowerCase()))
    : serials;

  return (
    <div className="mt-1 space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-blue-600 font-medium">S/N 선택 (필수) — {selected.length}개 선택됨</p>
        <span className="text-xs text-gray-400">{filtered.length}/{serials.length}</span>
      </div>
      <div className="inline-flex rounded border border-gray-200 overflow-hidden">
        <button type="button" onClick={() => setSnMode('serial')}
          className={`text-xs px-2 py-1 cursor-pointer transition-colors ${
            snMode === 'serial' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
          }`}>S/N로 등록하기</button>
        <button type="button" onClick={() => setSnMode('asset')}
          className={`text-xs px-2 py-1 cursor-pointer transition-colors border-l border-gray-200 ${
            snMode === 'asset' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
          }`}>장비번호로 등록하기</button>
      </div>
      <input
        value={snSearch}
        onChange={e => setSnSearch(e.target.value)}
        placeholder={snMode === 'asset' ? '장비번호 검색...' : 'S/N 검색...'}
        className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
      />
      <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto p-1 bg-white border border-gray-200 rounded">
        {filtered.length === 0
          ? <p className="text-xs text-gray-400 p-1">검색 결과 없음</p>
          : filtered.map((sn: SerialNumber) => (
            <SerialChip
              key={sn.id}
              sn={sn}
              label={snLabel(sn)}
              selected={selected.includes(sn.id)}
              onClick={() => toggle(sn.id)}
              image={snImages[sn.id]}
            />
          ))
        }
      </div>
    </div>
  );
}

export function RepairsPage() {
  const qc = useQueryClient();
  const { hasPermission } = useAuthStore();

  const { data = [], isLoading } = useQuery({ queryKey: ['repairs'], queryFn: repairsApi.findAll });
  const { data: items = [] }     = useQuery({ queryKey: ['items'],   queryFn: itemsApi.findAll });
  const { data: storages = [] }  = useQuery({ queryKey: ['storage'], queryFn: storageApi.findAll });

  const getItem = (code: string) => items.find(i => i.item_code === code);
  const itemOptions    = items.filter(i => i.is_active !== 0).map(i => ({ value: i.item_code, label: `${i.item_name} (${i.item_code})` }));
  const storageOptions = storages.map(s => ({ value: s.storage_code, label: `${s.storage_name} (${s.storage_code})` }));

  /* ── 고장 신고 ─────────────────────────────────────────── */
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<CreateRepairDto>({ item_code: '', storage_code: '', symptom: '', occurred_at: '', vendor_name: '', received_at: '' });
  const [selectedSerials, setSelectedSerials] = useState<number[]>([]);
  const resetForm = () => {
    setForm({ item_code: '', storage_code: '', symptom: '', occurred_at: '', vendor_name: '', received_at: '' });
    setSelectedSerials([]);
  };

  const createMut = useMutation({
    mutationFn: (dto: CreateRepairDto) => repairsApi.create(dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['repairs'] });
      qc.invalidateQueries({ queryKey: ['serial-numbers'] });
      setCreateOpen(false); resetForm();
    },
    onError: (err: any) => alert(err?.response?.data?.message ?? '고장 신고 중 오류가 발생했습니다.'),
  });

  const useSerial = getItem(form.item_code)?.use_serial === 1;
  const canSubmit = !!form.item_code && !!form.storage_code && !!form.symptom.trim()
    && (!useSerial || selectedSerials.length > 0);

  const handleCreate = () => createMut.mutate({
    ...form,
    symptom: form.symptom.trim(),
    occurred_at: form.occurred_at || undefined,
    vendor_name: form.vendor_name?.trim() || undefined,
    received_at: form.received_at || undefined,
    serial_number_ids: selectedSerials.length ? selectedSerials : undefined,
    quantity: selectedSerials.length || 1,
  });

  /* ── 목록 ──────────────────────────────────────────────── */
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);

  const filtered = useMemo(() => data.filter(r => {
    if (statusFilter && r.status !== statusFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return r.repair_no.toLowerCase().includes(q)
      || (r.item?.item_name ?? r.item_code).toLowerCase().includes(q)
      || r.symptom.toLowerCase().includes(q)
      || (r.repair_vendor ?? '').toLowerCase().includes(q)
      || (r.vendor_name ?? '').toLowerCase().includes(q);
  }), [data, search, statusFilter]);

  const columns = [
    { key: 'repair_no', header: '신고번호', render: (r: Repair) => <span className="font-mono text-xs">{r.repair_no}</span> },
    { key: 'item',      header: '품목',     render: (r: Repair) => <>{r.item?.item_name ?? r.item_code}<span className="ml-1 text-xs text-gray-400">×{r.quantity}</span></> },
    { key: 'symptom',   header: '현상',     render: (r: Repair) => <span className="block max-w-[220px] truncate" title={r.symptom}>{r.symptom}</span> },
    { key: 'status',    header: '상태',     render: (r: Repair) => <Badge label={STATUS_LABEL[r.status] ?? r.status} color={STATUS_COLOR[r.status] ?? 'gray'} /> },
    { key: 'vendor',    header: '수리업체', render: (r: Repair) => r.repair_vendor ?? '-' },
    { key: 'paid',      header: '유무상',   render: (r: Repair) => r.status === 'REPORTED' ? '-' : (r.is_paid ? '유상' : '무상') },
    { key: 'expected',  header: '완료예정', render: (r: Repair) => r.expected_done_at ?? '-' },
    { key: 'reporter',  header: '신고자',   render: (r: Repair) => r.reporter?.name ?? r.report_man_no ?? '-' },
    { key: 'occurred',  header: '고장발생일', render: (r: Repair) => r.occurred_at ?? '-' },
    { key: 'created',   header: '신고일',   render: (r: Repair) => new Date(r.created_at).toLocaleDateString('ko-KR') },
  ];

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of data) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-xl font-bold text-gray-800">고장/수리</h1>
          {Object.entries(counts).map(([st, n]) => (
            <Badge key={st} label={`${STATUS_LABEL[st] ?? st} ${n}`} color={STATUS_COLOR[st] ?? 'gray'} />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="신고번호·품목·현상·업체 검색"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="">전체 상태</option>
            <option value="REPORTED">고장신고</option>
            <option value="REPAIRING">수리중</option>
            <option value="DONE">수리완료</option>
            <option value="CANCELLED">취소됨</option>
          </select>
          {hasPermission('repair:create') && <Button onClick={() => setCreateOpen(true)}>+ 고장신고</Button>}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <Table columns={columns} data={filtered} rowKey={r => r.repair_no} loading={isLoading}
          onRowClick={r => setDetailId(r.repair_no)} emptyText="등록된 고장 건이 없습니다." />
      </div>

      {/* 고장 신고 모달 */}
      <Modal open={createOpen} onClose={() => { setCreateOpen(false); resetForm(); }} title="고장 신고" size="lg">
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Select label="품목 (필수)" value={form.item_code}
              onChange={v => { setForm(f => ({ ...f, item_code: v })); setSelectedSerials([]); }}
              options={itemOptions} placeholder="선택" />
            <Select label="창고 (필수)" value={form.storage_code}
              onChange={v => { setForm(f => ({ ...f, storage_code: v })); setSelectedSerials([]); }}
              options={storageOptions} placeholder="선택" />
          </div>

          {useSerial ? (
            <SerialPicker
              item_code={form.item_code} storage_code={form.storage_code}
              selected={selectedSerials} onChange={setSelectedSerials}
            />
          ) : form.item_code && (
            <Input label="수량 (필수)" type="number" value={form.quantity ?? 1}
              onChange={e => setForm(f => ({ ...f, quantity: Number(e.target.value) }))} />
          )}

          <Textarea label="현상 (필수)" value={form.symptom} rows={3}
            onChange={e => setForm(f => ({ ...f, symptom: e.target.value }))}
            placeholder="어떤 증상인지 구체적으로 적어주세요 (예: 전원 인가 시 부팅 안 됨)" />

          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">고장발생일 (선택)</label>
              <input type="date" value={form.occurred_at ?? ''}
                onChange={e => setForm(f => ({ ...f, occurred_at: e.target.value }))}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <Input label="거래처 (선택)" value={form.vendor_name ?? ''}
              onChange={e => setForm(f => ({ ...f, vendor_name: e.target.value }))}
              placeholder="구매처·납품처 (선택)" />
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">입고일 (선택)</label>
              <input type="date" value={form.received_at ?? ''}
                onChange={e => setForm(f => ({ ...f, received_at: e.target.value }))}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-xs text-yellow-700">
            ⚠️ 신고한 S/N은 <strong>고장</strong> 상태가 되어 재고사용·이동·납품에서 선택되지 않습니다.
            수리 등록을 하면 <strong>수리중</strong>으로 바뀝니다.
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <Button variant="secondary" onClick={() => { setCreateOpen(false); resetForm(); }}>취소</Button>
            <Button onClick={handleCreate} loading={createMut.isPending} disabled={!canSubmit}>고장 신고</Button>
          </div>
        </div>
      </Modal>

      {detailId && (
        <RepairDetailModal
          repair_no={detailId}
          onClose={() => setDetailId(null)}
          storageOptions={storageOptions}
        />
      )}
    </div>
  );
}

/* ─── 상세 · 수리 등록 · 수리 완료 ────────────────────────────────────────── */
function RepairDetailModal({ repair_no, onClose, storageOptions }: {
  repair_no: string; onClose: () => void;
  storageOptions: { value: string; label: string }[];
}) {
  const qc = useQueryClient();
  const { hasPermission } = useAuthStore();
  const { data: r } = useQuery({ queryKey: ['repair', repair_no], queryFn: () => repairsApi.findOne(repair_no) });

  const [regOpen, setRegOpen]   = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  const [vendor, setVendor]     = useState('');
  const [isPaid, setIsPaid]     = useState(false);
  const [takenOut, setTakenOut] = useState(false);
  const [expected, setExpected] = useState('');
  const [content, setContent]   = useState('');
  const [returnStorage, setReturnStorage] = useState('');

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['repairs'] });
    qc.invalidateQueries({ queryKey: ['repair', repair_no] });
    qc.invalidateQueries({ queryKey: ['serial-numbers'] });
    qc.invalidateQueries({ queryKey: ['inventory'] });
  };
  const onErr = (err: any) => alert(err?.response?.data?.message ?? '오류가 발생했습니다.');

  const registerMut = useMutation({
    mutationFn: () => repairsApi.register(repair_no, {
      repair_vendor: vendor.trim(),
      is_paid: isPaid ? 1 : 0,
      is_taken_out: takenOut ? 1 : 0,
      expected_done_at: expected,
    }),
    onSuccess: () => { invalidate(); setRegOpen(false); },
    onError: onErr,
  });

  const completeMut = useMutation({
    mutationFn: () => repairsApi.complete(repair_no, {
      repair_content: content.trim(),
      return_storage_code: returnStorage || undefined,
    }),
    onSuccess: () => { invalidate(); setDoneOpen(false); },
    onError: onErr,
  });

  const cancelMut = useMutation({
    mutationFn: (reason?: string) => repairsApi.cancel(repair_no, reason),
    onSuccess: () => { invalidate(); onClose(); },
    onError: onErr,
  });

  if (!r) return null;
  const canEdit = hasPermission('repair:update');

  return (
    <Modal open onClose={onClose} title={`고장/수리 상세 — ${r.repair_no}`} size="xl">
      <div className="p-5 space-y-5">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-gray-500">품목:</span> <strong className="ml-1">{r.item?.item_name ?? r.item_code}</strong></div>
          <div><span className="text-gray-500">상태:</span> <Badge label={STATUS_LABEL[r.status] ?? r.status} color={STATUS_COLOR[r.status] ?? 'gray'} className="ml-1" /></div>
          <div><span className="text-gray-500">창고:</span> <span className="ml-1">{r.storage?.storage_name ?? r.storage_code}</span></div>
          <div><span className="text-gray-500">수량:</span> <span className="ml-1">{r.quantity}</span></div>
          <div><span className="text-gray-500">고장발생일:</span> <span className="ml-1">{r.occurred_at ?? '-'}</span></div>
          <div><span className="text-gray-500">거래처:</span> <span className="ml-1">{r.vendor_name ?? '-'}</span></div>
          <div><span className="text-gray-500">입고일:</span> <span className="ml-1">{r.received_at ?? '-'}</span></div>
          <div><span className="text-gray-500">신고자:</span> <span className="ml-1">{r.reporter?.name ?? r.report_man_no ?? '-'}</span></div>
          <div><span className="text-gray-500">신고일:</span> <span className="ml-1">{new Date(r.created_at).toLocaleString('ko-KR')}</span></div>
          <div className="col-span-2"><span className="text-gray-500">현상:</span> <span className="ml-1 whitespace-pre-wrap">{r.symptom}</span></div>
        </div>

        {r.status !== 'REPORTED' && r.status !== 'CANCELLED' && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-gray-500">수리업체:</span> <strong className="ml-1">{r.repair_vendor}</strong></div>
            <div><span className="text-gray-500">유무상:</span> <span className="ml-1">{r.is_paid ? '유상' : '무상'}</span></div>
            <div>
              <span className="text-gray-500">반출:</span>
              <span className="ml-1">{r.is_taken_out ? '반출함' : '반출 안 함'}</span>
              {r.is_taken_out === 1 && r.status === 'REPAIRING' && <span className="ml-1 text-xs text-amber-600">(재고 차감됨)</span>}
            </div>
            <div><span className="text-gray-500">완료예정일:</span> <span className="ml-1">{r.expected_done_at ?? '-'}</span></div>
            {r.status === 'DONE' && (
              <>
                <div className="col-span-2"><span className="text-gray-500">수리내용:</span> <span className="ml-1 whitespace-pre-wrap">{r.repair_content}</span></div>
                <div><span className="text-gray-500">입고창고:</span> <span className="ml-1">{r.returnStorage?.storage_name ?? r.return_storage_code ?? '-'}</span></div>
                <div><span className="text-gray-500">완료일:</span> <span className="ml-1">{r.completed_at ? new Date(r.completed_at).toLocaleString('ko-KR') : '-'}</span></div>
              </>
            )}
          </div>
        )}

        {r.status === 'CANCELLED' && r.cancel_reason && (
          <p className="text-sm text-red-500">취소 사유: {r.cancel_reason}</p>
        )}

        {(r.serials?.length ?? 0) > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">대상 장비</p>
            <div className="border border-gray-200 rounded-lg overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-gray-500">
                    <th className="text-left px-4 py-2 font-medium">S/N</th>
                    <th className="text-left px-4 py-2 font-medium">장비번호</th>
                    <th className="text-left px-4 py-2 font-medium">사진</th>
                  </tr>
                </thead>
                <tbody>
                  {r.serials!.map(sn => (
                    <tr key={sn.id} className="border-t border-gray-50">
                      <td className="px-4 py-2 font-mono text-gray-700">{sn.serial_no}</td>
                      <td className="px-4 py-2 font-mono text-gray-700">{sn.asset_no ?? '-'}</td>
                      <td className="px-4 py-2"><AssetImageGallery serialNumberId={sn.id} emptyText="사진 없음" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex gap-2 justify-end pt-1 border-t border-gray-100">
          {r.status === 'REPORTED' && canEdit && (
            <Button onClick={() => { setVendor(''); setIsPaid(false); setTakenOut(false); setExpected(''); setRegOpen(true); }}>
              수리 등록
            </Button>
          )}
          {r.status === 'REPAIRING' && canEdit && (
            <Button onClick={() => { setContent(''); setReturnStorage(r.storage_code); setDoneOpen(true); }}>
              수리 완료
            </Button>
          )}
          {(r.status === 'REPORTED' || r.status === 'REPAIRING') && hasPermission('repair:cancel') && (
            <Button variant="secondary" loading={cancelMut.isPending}
              onClick={() => {
                const reason = prompt('취소 사유를 입력하세요 (선택)');
                if (reason !== null) cancelMut.mutate(reason || undefined);
              }}>신고 취소</Button>
          )}
        </div>
      </div>

      {/* 수리 등록 */}
      <Modal open={regOpen} onClose={() => setRegOpen(false)} title="수리 등록" size="md">
        <div className="p-5 space-y-4">
          <Input label="수리업체 (필수)" value={vendor} onChange={e => setVendor(e.target.value)} placeholder="예: OO컴퓨터" />
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-gray-700">비용 구분 (필수)</span>
            <div className="flex items-center gap-5">
              <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={!isPaid} onChange={() => setIsPaid(false)}
                  className="rounded text-indigo-600 focus:ring-indigo-400" />
                무상
              </label>
              <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={isPaid} onChange={() => setIsPaid(true)}
                  className="rounded text-indigo-600 focus:ring-indigo-400" />
                유상
              </label>
              <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer ml-auto">
                <input type="checkbox" checked={takenOut} onChange={e => setTakenOut(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-400" />
                반출 <span className="text-gray-400">(선택)</span>
              </label>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">수리완료 예정일 (필수)</label>
            <input type="date" value={expected} onChange={e => setExpected(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          {takenOut && (
            <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
              반출로 등록하면 창고에 물건이 없으므로 <strong>재고 수량에서 차감</strong>됩니다. 수리 완료 시 입고 창고로 다시 들어옵니다.
            </p>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setRegOpen(false)}>취소</Button>
            <Button onClick={() => registerMut.mutate()} loading={registerMut.isPending}
              disabled={!vendor.trim() || !expected}>등록</Button>
          </div>
        </div>
      </Modal>

      {/* 수리 완료 */}
      <Modal open={doneOpen} onClose={() => setDoneOpen(false)} title="수리 완료" size="md">
        <div className="p-5 space-y-4">
          <Textarea label="수리내용 (필수)" value={content} rows={4}
            onChange={e => setContent(e.target.value)}
            placeholder="어떤 조치를 했는지 적어주세요 (예: 메인보드 교체, 무상 보증 처리)" />
          <Select label="입고창고 (선택)" value={returnStorage} onChange={setReturnStorage}
            options={storageOptions} placeholder="선택 (미선택 시 신고 창고로 복귀)" />
          <p className="text-xs text-gray-500">
            완료 처리하면 대상 S/N이 재고 상태로 돌아갑니다.
            {r.is_taken_out ? ' 반출했던 수량도 입고 창고로 다시 들어옵니다.' : ''}
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setDoneOpen(false)}>취소</Button>
            <Button onClick={() => completeMut.mutate()} loading={completeMut.isPending}
              disabled={!content.trim()}>완료 처리</Button>
          </div>
        </div>
      </Modal>
    </Modal>
  );
}
