import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { stockMovementsApi, type CreateMovementDto } from '../api/stockMovements';
import { itemsApi, storageApi } from '../api/items';
import { employeesApi } from '../api/employees';
import { serialNumbersApi } from '../api/serialNumbers';
import { SerialChip, useLatestSerialImages } from '../components/SerialChip';
import { SerialPhotoPicker, AssetImageManager, uploadSerialPhotos, type SerialPhotoMap } from '../components/AssetImages';
import type { SerialNumber } from '../types';
import { Table } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input, Textarea, Select } from '../components/ui/Input';
import { useAuthStore } from '../store/auth.store';
import type { StockMovement } from '../types';

const STATUS_LABEL: Record<string, string> = { PENDING: '대기중', APPROVED: '승인됨', MOVED: '이동완료', CANCELLED: '취소됨' };
const STATUS_COLOR: Record<string, 'blue' | 'green' | 'gray' | 'red'> = { PENDING: 'blue', APPROVED: 'green', MOVED: 'gray', CANCELLED: 'red' };

// S/N(시리얼) 상태 — 이동 장비 목록 표시용 (재고사용 상세와 동일)
const SN_STATUS_LABEL: Record<string, string> = { STOCK: '재고', SHIPPED: '납품됨', USED: '사용됨', BROKEN: '고장', REPAIR: '수리중', CANCELLED: '취소됨' };
const SN_STATUS_COLOR: Record<string, string> = {
  STOCK: 'bg-green-100 text-green-700', SHIPPED: 'bg-blue-100 text-blue-700', USED: 'bg-gray-100 text-gray-600',
  BROKEN: 'bg-red-100 text-red-700', REPAIR: 'bg-amber-100 text-amber-700', CANCELLED: 'bg-red-100 text-red-600',
};

/** S/N 선택 인라인 컴포넌트 */
function SerialPicker({
  item_code, storage_code, selected, onChange,
}: {
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
  // 표시/검색용 식별자 — 장비번호 모드에서 장비번호 없으면 S/N으로 fallback
  const snLabel = (sn: SerialNumber) =>
    snMode === 'asset' ? (sn.asset_no ?? sn.serial_no) : sn.serial_no;
  const filtered = snSearch.trim()
    ? serials.filter((sn: SerialNumber) => snLabel(sn).toLowerCase().includes(snSearch.toLowerCase()))
    : serials;
  return (
    <div className="space-y-1.5">
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
        type="text"
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

/** 선택한 S/N의 라벨을 SerialPicker와 같은 캐시에서 가져와 사진 대상으로 넘긴다 */
function MovementPhotoPicker({ item_code, storage_code, selected, value, onChange }: {
  item_code: string; storage_code: string; selected: number[];
  value: SerialPhotoMap; onChange: (m: SerialPhotoMap) => void;
}) {
  const { data: serials = [] } = useQuery({
    queryKey: ['serial-numbers', item_code, storage_code],
    queryFn: () => serialNumbersApi.findAvailable(item_code, storage_code),
    enabled: !!item_code && !!storage_code,
  });
  return (
    <SerialPhotoPicker
      targets={selected.map(id => {
        const sn = serials.find((x: SerialNumber) => x.id === id);
        return { key: String(id), label: sn?.serial_no ?? `#${id}`, sub: sn?.asset_no ?? undefined };
      })}
      value={value}
      onChange={onChange}
      hint="이동 전 실물 상태를 장비별로 남겨둡니다."
      emptyText="S/N을 선택하면 장비별로 사진을 등록할 수 있습니다."
    />
  );
}

export function StockMovementsPage() {
  const qc = useQueryClient();
  const { hasPermission } = useAuthStore();
  const { data = [], isLoading } = useQuery({ queryKey: ['stock-movements'], queryFn: stockMovementsApi.findAll });
  const { data: items = [] }     = useQuery({ queryKey: ['items'],      queryFn: itemsApi.findAll });
  const { data: storages = [] }  = useQuery({ queryKey: ['storage'],    queryFn: storageApi.findAll });
  const { data: employees = [] } = useQuery({ queryKey: ['employees-active'],  queryFn: employeesApi.findActiveList });

  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [approveOpen, setApproveOpen] = useState(false);   // 승인 시 보관 상태 사진을 남긴다
  const [approvePhotos, setApprovePhotos] = useState<SerialPhotoMap>({});

  const { data: detail } = useQuery({
    queryKey: ['stock-movement', detailId],
    queryFn: () => stockMovementsApi.findOne(detailId!),
    enabled: !!detailId,
  });

  const [form, setForm] = useState<CreateMovementDto>({ from_storage_code: '', to_storage_code: '', item_code: '', quantity: 0, note: '', to_man_no: '' });
  const [selectedSerials, setSelectedSerials] = useState<number[]>([]);
  const [createPhotos, setCreatePhotos] = useState<SerialPhotoMap>({});   // 이동 전 실물 상태
  const getItem = (item_code: string) => items.find(i => i.item_code === item_code);
  const resetForm = () => { setForm({ from_storage_code: '', to_storage_code: '', item_code: '', quantity: 0, note: '', to_man_no: '' }); setSelectedSerials([]); setCreatePhotos({}); };

  const invalidateAll = (id: string) => {
    qc.invalidateQueries({ queryKey: ['stock-movements'] });
    qc.invalidateQueries({ queryKey: ['stock-movement', id] });
    qc.invalidateQueries({ queryKey: ['inventory'] });
  };

  const createMut  = useMutation({
    mutationFn: (dto: CreateMovementDto) => stockMovementsApi.create(dto),
    onSuccess: async (created) => {
      await uploadSerialPhotos(createPhotos, 'MOVE', created?.movement_no);
      qc.invalidateQueries({ queryKey: ['stock-movements'] });
      qc.invalidateQueries({ queryKey: ['serial-numbers'] });
      setCreateOpen(false); resetForm();
    },
  });
  const approveMut = useMutation({
    mutationFn: ({ id }: { id: string }) => stockMovementsApi.approve(id),
    onSuccess: async (_, vars) => {
      await uploadSerialPhotos(approvePhotos, 'MOVE', vars.id);
      setApprovePhotos({});
      setApproveOpen(false);
      invalidateAll(vars.id);
    },
  });
  const moveMut    = useMutation({ mutationFn: (id: string) => stockMovementsApi.move(id),    onSuccess: (_, id) => { invalidateAll(id); qc.invalidateQueries({ queryKey: ['serial-numbers'] }); } });
  const cancelMut  = useMutation({ mutationFn: (id: string) => stockMovementsApi.cancel(id),  onSuccess: (_, id) => invalidateAll(id) });

  const itemOptions      = items.filter(i => i.is_active !== 0).map(i => ({ value: i.item_code, label: `${i.item_name} (${i.item_code})` }));
  const storageOptions   = storages.map(s => ({ value: s.storage_code, label: `${s.storage_name} (${s.storage_code})` }));
  const receiverOptions  = employees
    .filter(e => e.man_roll === 'ADMIN' || e.man_roll === 'MASTER')
    .map(e => ({ value: e.man_no, label: `${e.name} (${e.man_roll})` }));

  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get('search') ?? '');
  const [statusFilter, setStatusFilter] = useState('');

  const filtered = data.filter(r => {
    if (statusFilter && r.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.movement_no.toLowerCase().includes(q)
        || (r.item?.item_name ?? r.item_code).toLowerCase().includes(q)
        || (r.fromStorage?.storage_name ?? r.from_storage_code).toLowerCase().includes(q)
        || (r.toStorage?.storage_name ?? r.to_storage_code).toLowerCase().includes(q);
    }
    return true;
  });

  const columns = [
    { key: 'movement_no', header: '이동번호', render: (r: StockMovement) => <span className="font-mono text-xs text-gray-500">{r.movement_no}</span> },
    { key: 'item',     header: '품목',      render: (r: StockMovement) => r.item?.item_name ?? r.item_code },
    { key: 'from',     header: '출발 창고', render: (r: StockMovement) => r.fromStorage?.storage_name ?? r.from_storage_code },
    { key: 'to',       header: '도착 창고', render: (r: StockMovement) => r.toStorage?.storage_name ?? r.to_storage_code },
    { key: 'quantity', header: '수량',      render: (r: StockMovement) => <span className="font-medium">{r.quantity.toLocaleString()}</span> },
    { key: 'mover',    header: '인계자',    render: (r: StockMovement) => r.mover?.name ?? r.move_man_no },
    { key: 'receiver', header: '인수자',    render: (r: StockMovement) => r.receiver?.name ?? r.approver?.name ?? '-' },
    { key: 'status',   header: '상태',      render: (r: StockMovement) => <Badge label={STATUS_LABEL[r.status] ?? r.status} color={STATUS_COLOR[r.status] ?? 'gray'} /> },
    { key: 'created_at', header: '등록일시', render: (r: StockMovement) => new Date(r.created_at).toLocaleString('ko-KR') },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 justify-between">
        <div className="flex gap-2 items-center">
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="이동번호·품목·창고 검색"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 w-56"
          />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
            <option value="">전체 상태</option>
            <option value="PENDING">대기중</option>
            <option value="APPROVED">승인됨</option>
            <option value="MOVED">이동완료</option>
            <option value="CANCELLED">취소됨</option>
          </select>
          <span className="text-sm text-gray-500">{filtered.length}건</span>
        </div>
        {hasPermission('movement:create') && <Button onClick={() => setCreateOpen(true)}>+ 재고이동</Button>}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <Table columns={columns} data={filtered} rowKey={r => r.movement_no} loading={isLoading} onRowClick={r => setDetailId(r.movement_no)} />
      </div>

      {/* 등록 모달 */}
      <Modal open={createOpen} onClose={() => { setCreateOpen(false); resetForm(); }} title="재고이동 등록" size="md">
        <div className="p-5 space-y-4">
          <Select label="출발 창고 *" value={form.from_storage_code} onChange={v => { setForm(f => ({ ...f, from_storage_code: v })); setSelectedSerials([]); }} options={storageOptions} placeholder="선택" />
          <Select label="도착 창고 *" value={form.to_storage_code}   onChange={v => setForm(f => ({ ...f, to_storage_code: v }))}   options={storageOptions} placeholder="선택" />
          <Select label="품목 *"      value={form.item_code}          onChange={v => { setForm(f => ({ ...f, item_code: v })); setSelectedSerials([]); }}          options={itemOptions}    placeholder="선택" />
          {getItem(form.item_code)?.use_serial === 1 ? (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-1">S/N 선택 *</p>
              <SerialPicker
                item_code={form.item_code}
                storage_code={form.from_storage_code}
                selected={selectedSerials}
                onChange={ids => { setSelectedSerials(ids); setForm(f => ({ ...f, quantity: ids.length })); }}
              />
            </div>
          ) : (
            <Input label="수량 *" type="number" value={form.quantity || ''} onChange={e => setForm(f => ({ ...f, quantity: Number(e.target.value) }))} />
          )}
          {getItem(form.item_code)?.use_serial === 1 && (
            <MovementPhotoPicker
              item_code={form.item_code} storage_code={form.from_storage_code}
              selected={selectedSerials} value={createPhotos} onChange={setCreatePhotos}
            />
          )}
          <Textarea label="메모" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
          <Select label="인수자 *" value={form.to_man_no ?? ''} onChange={v => setForm(f => ({ ...f, to_man_no: v }))} options={receiverOptions} placeholder="인수자 선택 (Admin/Master)" />
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" onClick={() => { setCreateOpen(false); resetForm(); }}>닫기</Button>
            <Button
              onClick={() => createMut.mutate({ ...form, serial_number_ids: selectedSerials.length ? selectedSerials : undefined })}
              loading={createMut.isPending}
            >등록</Button>
          </div>
        </div>
      </Modal>

      {/* 상세 모달 */}
      <Modal open={!!detailId} onClose={() => setDetailId(null)} title="재고이동 상세" size="xl">
        {detail && (() => {
          const specKeys: string[] = detail.item?.specs ?? [];
          return (
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">이동번호:</span> <span className="font-mono ml-1">{detail.movement_no}</span></div>
              <div><span className="text-gray-500">상태:</span> <Badge label={STATUS_LABEL[detail.status] ?? detail.status} color={STATUS_COLOR[detail.status] ?? 'gray'} className="ml-1" /></div>
              <div>
                <span className="text-gray-500">품목:</span>
                <strong className="ml-1">{detail.item?.item_name ?? detail.item_code}</strong>
                {detail.item?.use_serial === 1 && (
                  <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-600 font-medium">S/N</span>
                )}
              </div>
              <div><span className="text-gray-500">수량:</span> <strong className="ml-1">{detail.quantity?.toLocaleString()}</strong></div>
              <div><span className="text-gray-500">출발 창고:</span> <span className="ml-1">{detail.fromStorage?.storage_name ?? detail.from_storage_code}</span></div>
              <div><span className="text-gray-500">도착 창고:</span> <span className="ml-1">{detail.toStorage?.storage_name ?? detail.to_storage_code}</span></div>
              <div><span className="text-gray-500">인계자:</span> <span className="ml-1">{detail.mover?.name ?? detail.move_man_no}</span></div>
              <div><span className="text-gray-500">인수자:</span> <span className="ml-1">{detail.receiver?.name ?? detail.approver?.name ?? '-'}</span></div>
              {detail.note && <div className="col-span-2"><span className="text-gray-500">메모:</span> <span className="ml-1">{detail.note}</span></div>}
            </div>

            {detail.serials && detail.serials.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">이동 장비 목록 — {detail.item?.item_name ?? detail.item_code} ({detail.serials.length}개)</p>
                <div className="border border-gray-200 rounded-lg overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100 text-gray-500">
                        <th className="text-left px-4 py-2 font-medium">S/N</th>
                        <th className="text-left px-4 py-2 font-medium whitespace-nowrap">장비번호</th>
                        <th className="text-left px-4 py-2 font-medium">상태</th>
                        {specKeys.map(k => <th key={k} className="text-left px-4 py-2 font-medium whitespace-nowrap">{k}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {detail.serials.map(sn => (
                        <tr key={sn.id} className="border-t border-gray-50 hover:bg-gray-50">
                          <td className="px-4 py-2 font-mono text-gray-700 whitespace-nowrap">{sn.serial_no}</td>
                          <td className="px-4 py-2 font-mono text-gray-700 whitespace-nowrap">{sn.asset_no ?? '-'}</td>
                          <td className="px-4 py-2">
                            <span className={`px-1.5 py-0.5 rounded ${SN_STATUS_COLOR[sn.status] ?? 'bg-gray-100 text-gray-500'}`}>{SN_STATUS_LABEL[sn.status] ?? sn.status}</span>
                          </td>
                          {specKeys.map(k => <td key={k} className="px-4 py-2 text-gray-600 whitespace-nowrap">{sn.tags?.[k] ?? '-'}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">보관 사진</p>
              {(detail.serials ?? []).length > 0 ? (
                <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                  {(detail.serials ?? []).map(sn => (
                    <div key={sn.id} className="flex items-start gap-3 px-3 py-2">
                      <div className="w-40 shrink-0 pt-1">
                        <p className="truncate font-mono text-xs text-gray-700" title={sn.serial_no}>{sn.serial_no}</p>
                        {sn.asset_no && <p className="truncate text-[11px] text-gray-400">{sn.asset_no}</p>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <AssetImageManager
                          serialNumberId={sn.id}
                          eventType="MOVE"
                          eventNo={detail.movement_no}
                          canEdit={hasPermission('movement:approve')}
                          compact
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">S/N 관리 품목이 아니어서 장비 사진을 등록할 수 없습니다.</p>
              )}
            </div>

            <Modal open={approveOpen} onClose={() => { setApproveOpen(false); setApprovePhotos({}); }} title="재고이동 승인" size="lg">
              <div className="p-5 space-y-4">
                <p className="text-sm text-gray-600">
                  승인 시 이동 장비를 어디에 어떤 형태로 보관했는지 사진으로 남겨두면 이후 담당자가 확인할 수 있습니다.
                </p>
                <SerialPhotoPicker
                  targets={(detail.serials ?? []).map(sn => ({ key: String(sn.id), label: sn.serial_no, sub: sn.asset_no ?? undefined }))}
                  value={approvePhotos}
                  onChange={setApprovePhotos}
                  label="보관 사진"
                  emptyText="S/N 관리 품목이 아니어서 장비별 사진을 등록할 수 없습니다."
                />
                <div className="flex gap-2 justify-end">
                  <Button variant="secondary" onClick={() => { setApproveOpen(false); setApprovePhotos({}); }}>취소</Button>
                  <Button
                    onClick={() => approveMut.mutate({ id: detail.movement_no })}
                    loading={approveMut.isPending}
                  >승인 확정</Button>
                </div>
              </div>
            </Modal>

            <div className="flex gap-2 justify-end pt-2">
              {detail.status === 'PENDING' && hasPermission('movement:approve') && (
                <Button onClick={() => { setApprovePhotos({}); setApproveOpen(true); }}>승인</Button>
              )}
              {detail.status === 'APPROVED' && hasPermission('movement:approve') && (
                <Button onClick={() => moveMut.mutate(detail.movement_no)} loading={moveMut.isPending}>이동 처리 (재고변경)</Button>
              )}
              {['PENDING', 'APPROVED'].includes(detail.status) && hasPermission('movement:cancel') && (
                <Button variant="secondary" onClick={() => cancelMut.mutate(detail.movement_no)} loading={cancelMut.isPending}>취소</Button>
              )}
            </div>
          </div>
          );
        })()}
      </Modal>
    </div>
  );
}
