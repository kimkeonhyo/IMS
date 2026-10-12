import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SerialPhotoPicker, AssetImageGallery, AssetImageManager, uploadSerialPhotos, type SerialPhotoMap, type SerialPhotoTarget } from '../components/AssetImages';
import { stockUsagesApi, type CreateBulkUsageDto, type BulkUsageItem } from '../api/stockUsages';
import { itemsApi, storageApi } from '../api/items';
import { serialNumbersApi } from '../api/serialNumbers';
import { SerialChip, useLatestSerialImages } from '../components/SerialChip';
import { employeesApi } from '../api/employees';
import type { SerialNumber, StockUsage } from '../types';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input, Textarea, Select } from '../components/ui/Input';
import { useAuthStore } from '../store/auth.store';

type ViewMode = 'list' | 'item' | 'user';

// ─── S/N 상태 표시 ────────────────────────────────────────────────────────────
const SN_STATUS_COLOR: Record<string, string> = {
  STOCK: 'bg-green-100 text-green-700', SHIPPED: 'bg-blue-100 text-blue-700',
  USED: 'bg-gray-100 text-gray-500',   CANCELLED: 'bg-red-100 text-red-400',
  BROKEN: 'bg-red-100 text-red-700',   REPAIR: 'bg-amber-100 text-amber-700',
};
const SN_STATUS_LABEL: Record<string, string> = {
  STOCK: '재고', SHIPPED: '납품됨', USED: '사용됨', BROKEN: '고장', REPAIR: '수리중', CANCELLED: '취소됨',
};

/** 사용처 표시 — 외부는 입력한 장소명, 창고면 창고명 (목록에서는 코드 폴백) */
function formatUsePlace(
  u: { use_place_code?: string | null; use_place_name?: string | null },
  storages: { storage_code: string; storage_name: string }[],
) {
  if (!u.use_place_code) return <span className="text-gray-300">-</span>;
  if (u.use_place_code === 'EXTERNAL') return <>{u.use_place_name || '외부'}</>;
  return <>{storages.find(s => s.storage_code === u.use_place_code)?.storage_name ?? u.use_place_code}</>;
}

/** 사용기한 표시 — 무기한이면 '무기한', 지난 기한은 빨강으로 강조 */
function formatUseUntil(u: { use_until?: string | null; is_indefinite?: number; status?: string }) {
  if (u.is_indefinite === 1) return <span className="text-gray-500">무기한</span>;
  if (!u.use_until) return <span className="text-gray-300">-</span>;
  const date = u.use_until.slice(0, 10);
  const active = u.status === 'PENDING' || u.status === 'COMPLETED';
  const overdue = active && date < new Date().toISOString().slice(0, 10);
  return <span className={overdue ? 'text-red-600 font-medium' : ''}>{date}{overdue ? ' (기한 초과)' : ''}</span>;
}

// ─── S/N 선택 (등록 모달용) ───────────────────────────────────────────────────
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
  // 표시/검색용 식별자 — 장비번호 모드에서 장비번호 없으면 S/N으로 fallback
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
function UsagePhotoPicker({ item_code, storage_code, selected, value, onChange }: {
  item_code: string; storage_code: string; selected: number[];
  value: SerialPhotoMap; onChange: (m: SerialPhotoMap) => void;
}) {
  const { data: serials = [] } = useQuery({
    queryKey: ['serial-numbers', item_code, storage_code],
    queryFn: () => serialNumbersApi.findAvailable(item_code, storage_code),
    enabled: !!item_code && !!storage_code,
  });
  const targets: SerialPhotoTarget[] = selected.map(id => {
    const sn = serials.find((x: SerialNumber) => x.id === id);
    return { key: String(id), label: sn?.serial_no ?? `#${id}`, sub: sn?.asset_no ?? undefined };
  });
  return (
    <SerialPhotoPicker
      targets={targets}
      value={value}
      onChange={onChange}
      hint="장비마다 따로 등록합니다. (실물·설치 위치 확인용)"
      emptyText="S/N을 선택하면 장비별로 사진을 등록할 수 있습니다."
    />
  );
}

// ─── 재고사용 상세 모달 ────────────────────────────────────────────────────────
function UsageDetailModal({ usage, onClose, canEdit, canCancel, storages }: {
  usage: StockUsage; onClose: () => void; canEdit: boolean; canCancel: boolean;
  storages: { storage_code: string; storage_name: string; is_active?: number }[];
}) {
  const qc = useQueryClient();
  const [editMode, setEditMode]         = useState(false);
  const [editPurpose, setEditPurpose]   = useState(usage.purpose ?? '');
  const [editQuantity, setEditQuantity] = useState(usage.quantity);
  const [editUsePlace, setEditUsePlace] = useState(usage.use_place_code ?? '');
  const [editUsePlaceName, setEditUsePlaceName] = useState(usage.use_place_name ?? '');
  const [editUseUntil, setEditUseUntil] = useState(usage.use_until ?? '');
  const [editIndefinite, setEditIndefinite] = useState(usage.is_indefinite === 1);
  const [cancelOpen, setCancelOpen]     = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [returnOpen, setReturnOpen]     = useState(false);
  const [returnStorage, setReturnStorage] = useState(usage.storage_code ?? '');
  const [returnSerialIds, setReturnSerialIds] = useState<number[]>([]);
  const [returnPhotos, setReturnPhotos] = useState<SerialPhotoMap>({});   // 회수 시 S/N별 실물 상태 기록

  const { data: serials = [], isLoading: snLoading } = useQuery({
    queryKey: ['sn-by-usage', usage.usage_no],
    queryFn: () => serialNumbersApi.findByUsage(usage.usage_no),
    enabled: usage.item?.use_serial === 1,
  });
  const specKeys: string[] = usage.item?.specs ?? [];

  const updateMut = useMutation({
    mutationFn: (dto: { purpose?: string; quantity?: number; use_until?: string; is_indefinite?: number; use_place_code?: string; use_place_name?: string }) =>
      stockUsagesApi.update(usage.usage_no, dto),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['stock-usages'] }); setEditMode(false); },
  });
  const cancelMut = useMutation({
    mutationFn: (reason?: string) => stockUsagesApi.cancel(usage.usage_no, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock-usages'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      onClose();
    },
  });
  const completeMut = useMutation({
    mutationFn: (id: string) => stockUsagesApi.complete(id),
    onSuccess: (_, id) => { qc.invalidateQueries({ queryKey: ['stock-usages'] }); qc.invalidateQueries({ queryKey: ['stock-usage', id] }); },
    onError: (err: any) => alert(err?.response?.data?.message ?? '오류가 발생했습니다.'),
  });
  const returnMut = useMutation({
    mutationFn: ({ id, storageCode, serialIds }: { id: string; storageCode: string; serialIds?: number[] }) =>
      stockUsagesApi.returnStock(id, storageCode || undefined, serialIds),
    onSuccess: async (_, vars) => {
      await uploadSerialPhotos(returnPhotos, 'RETURN', vars.id);
      setReturnPhotos({});
      qc.invalidateQueries({ queryKey: ['stock-usages'] });
      qc.invalidateQueries({ queryKey: ['stock-usage', vars.id] });
      qc.invalidateQueries({ queryKey: ['sn-by-usage', vars.id] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['serial-numbers'] });
      setReturnOpen(false);
    },
    onError: (err: any) => alert(err?.response?.data?.message ?? '오류가 발생했습니다.'),
  });

  return (
    <Modal open onClose={onClose} title={`재고사용 상세 — ${usage.usage_no}`} size="xl">
      <div className="p-5 space-y-5">
        {/* 기본 정보 */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-gray-500">품목:</span>
            <strong className="ml-1">{usage.item?.item_name ?? usage.item_code}</strong>
            {usage.item?.use_serial === 1 && (
              <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-600 font-medium">S/N</span>
            )}
          </div>
          <div><span className="text-gray-500">창고:</span><span className="ml-1">{usage.storage?.storage_name ?? usage.storage_code}</span></div>
          <div><span className="text-gray-500">수량:</span><span className="font-semibold ml-1">{usage.quantity.toLocaleString()}</span></div>
          <div><span className="text-gray-500">사용자:</span><span className="ml-1">{usage.user?.name ?? usage.use_name ?? usage.use_man_no ?? '-'}</span></div>
          <div><span className="text-gray-500">등록일:</span><span className="ml-1">{new Date(usage.created_at).toLocaleString('ko-KR')}</span></div>
          <div>
            <span className="text-gray-500">사용처:</span>
            <span className="ml-1">{
              usage.use_place_code === 'EXTERNAL'
                ? (usage.use_place_name || '외부')
                : (storages.find(s => s.storage_code === usage.use_place_code)?.storage_name
                    ?? <span className="text-gray-300">-</span>)
            }</span>
          </div>
          <div>
            <span className="text-gray-500">사용기한:</span>
            <span className="ml-1">{formatUseUntil(usage)}</span>
          </div>
          <div>
            <span className="text-gray-500">상태:</span>
            <Badge
              label={usage.status === 'COMPLETED' ? '사용완료' : usage.status === 'RETURNED' ? '반납됨' : usage.status === 'CANCELLED' || usage.is_cancelled ? '취소됨' : '사용중'}
              color={usage.status === 'COMPLETED' ? 'green' : usage.status === 'RETURNED' ? 'blue' : usage.status === 'CANCELLED' || usage.is_cancelled ? 'red' : 'green'}
              className="ml-1"
            />
          </div>
          {!!usage.is_cancelled && usage.canceller && (
            <div><span className="text-gray-500">취소자:</span><span className="ml-1">{usage.canceller.name ?? usage.cancel_man_no}</span></div>
          )}
          {!!usage.is_cancelled && usage.cancelled_at && (
            <div><span className="text-gray-500">취소일:</span><span className="ml-1">{new Date(usage.cancelled_at).toLocaleString('ko-KR')}</span></div>
          )}
        </div>

        {!!usage.is_cancelled && usage.cancel_reason && (
          <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-2.5 text-sm">
            <span className="text-red-500 font-medium">취소 사유:</span>
            <span className="ml-2 text-red-700">{usage.cancel_reason}</span>
          </div>
        )}

        {/* 사용목적 / 수정 폼 */}
        {!editMode ? (
          <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm">
            <span className="text-gray-500 font-medium">사용목적:</span>
            <span className="ml-2 text-gray-700">{usage.purpose || '-'}</span>
          </div>
        ) : (
          <div className="space-y-3 border border-indigo-200 rounded-lg p-4 bg-indigo-50">
            <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">수정 중</p>
            <Input label="수량 *" type="number" value={editQuantity} onChange={e => setEditQuantity(Number(e.target.value))} />
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="사용처"
                value={editUsePlace}
                onChange={v => { setEditUsePlace(v); if (v !== 'EXTERNAL') setEditUsePlaceName(''); }}
                options={[
                  ...storages.filter(s => s.is_active !== 0).map(s => ({ value: s.storage_code, label: s.storage_name })),
                  { value: 'EXTERNAL', label: '외부 (직접 입력)' },
                ]}
                placeholder="사용처 선택"
              />
              {editUsePlace === 'EXTERNAL' && (
                <Input label="외부 사용처명" value={editUsePlaceName} onChange={e => setEditUsePlaceName(e.target.value)} placeholder="예: 고객사 site-a 현장" />
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">사용기한 *</label>
              <div className="flex items-center gap-3 mt-1">
                <input
                  type="date"
                  value={editUseUntil}
                  onChange={e => setEditUseUntil(e.target.value)}
                  disabled={editIndefinite}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-gray-100 disabled:text-gray-400"
                />
                <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editIndefinite}
                    onChange={e => { setEditIndefinite(e.target.checked); if (e.target.checked) setEditUseUntil(''); }}
                    className="rounded text-indigo-600 focus:ring-indigo-400"
                  />
                  무기한
                </label>
              </div>
            </div>
            <Textarea label="사용목적" value={editPurpose} onChange={e => setEditPurpose(e.target.value)} rows={2} />
          </div>
        )}

        {/* S/N 목록 */}
        {usage.item?.use_serial === 1 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">사용 S/N 목록</p>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              {snLoading ? (
                <p className="text-xs text-gray-400 py-4 text-center">불러오는 중...</p>
              ) : serials.length === 0 ? (
                <p className="text-xs text-gray-400 py-4 text-center">S/N 정보 없음</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-gray-500">
                      <th className="text-left px-4 py-2 font-medium">S/N</th>
                      <th className="text-left px-4 py-2 font-medium whitespace-nowrap">장비번호</th>
                      <th className="text-left px-4 py-2 font-medium">상태</th>
                      {specKeys.map(k => <th key={k} className="text-left px-4 py-2 font-medium">{k}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {serials.map((sn: SerialNumber) => (
                      <tr key={sn.id} className="border-t border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-2 font-mono text-gray-700">{sn.serial_no}</td>
                        <td className="px-4 py-2 font-mono text-gray-700 whitespace-nowrap">{sn.asset_no ?? '-'}</td>
                        <td className="px-4 py-2">
                          <span className={`px-1.5 py-0.5 rounded ${SN_STATUS_COLOR[sn.status] ?? 'bg-gray-100 text-gray-500'}`}>{SN_STATUS_LABEL[sn.status] ?? sn.status}</span>
                        </td>
                        {specKeys.map(k => <td key={k} className="px-4 py-2 text-gray-600">{sn.tags?.[k] ?? '-'}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* 장비 사진 — 등록 시점을 놓쳤어도 여기서 장비별로 추가할 수 있다 */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">장비 사진</p>
          {usage.item?.use_serial === 1 && serials.length > 0 ? (
            <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
              {serials.map((sn: SerialNumber) => (
                <div key={sn.id} className="flex items-start gap-3 px-3 py-2">
                  <div className="w-40 shrink-0 pt-1">
                    <p className="truncate font-mono text-xs text-gray-700" title={sn.serial_no}>{sn.serial_no}</p>
                    {sn.asset_no && <p className="truncate text-[11px] text-gray-400">{sn.asset_no}</p>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <AssetImageManager
                      serialNumberId={sn.id}
                      eventType="USAGE"
                      eventNo={usage.usage_no}
                      canEdit={canEdit}
                      compact
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <AssetImageGallery eventType="USAGE" eventNo={usage.usage_no} canDelete={canEdit} />
          )}
        </div>

        {/* 액션 */}
        {!usage.is_cancelled && usage.status !== 'CANCELLED' && (canEdit || canCancel) && (
          <div className="flex gap-2 pt-1 border-t border-gray-100 items-center">
            {!editMode ? (
              <>
                {/* 수정 — 맨 왼쪽 */}
                {canEdit && (
                  <Button variant="secondary" onClick={() => { setEditPurpose(usage.purpose ?? ''); setEditQuantity(usage.quantity); setEditUseUntil(usage.use_until ?? ''); setEditIndefinite(usage.is_indefinite === 1); setEditUsePlace(usage.use_place_code ?? ''); setEditUsePlaceName(usage.use_place_name ?? ''); setEditMode(true); }}>
                    수정
                  </Button>
                )}
                <div className="flex-1" />
                {usage.status === 'PENDING' && !usage.is_cancelled && (
                  <>
                    <button
                      onClick={() => { if (confirm('사용완료 처리하면 재고가 차감됩니다. 진행하시겠습니까?')) completeMut.mutate(usage.usage_no); }}
                      disabled={completeMut.isPending}
                      className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-100 text-indigo-700 hover:bg-indigo-200 disabled:opacity-50 cursor-pointer transition-colors"
                    >사용완료 (재고 차감)</button>
                    <button
                      onClick={() => { setReturnStorage(usage.storage_code ?? ''); setReturnSerialIds(serials.map((s: SerialNumber) => s.id)); setReturnOpen(true); }}
                      className="px-4 py-2 rounded-lg text-sm font-medium bg-green-100 text-green-700 hover:bg-green-200 cursor-pointer transition-colors"
                    >반납 (재고 복원)</button>
                  </>
                )}
                {canCancel && (
                  <button
                    onClick={() => setCancelOpen(true)}
                    className="px-4 py-2 rounded-lg text-sm font-medium bg-red-100 text-red-600 hover:bg-red-200 cursor-pointer transition-colors"
                  >취소 처리</button>
                )}
              </>
            ) : (
              <>
                <Button variant="secondary" onClick={() => setEditMode(false)}>취소</Button>
                <Button
                  onClick={() => updateMut.mutate({
                    purpose: editPurpose,
                    quantity: editQuantity,
                    ...(editIndefinite ? { is_indefinite: 1 } : { use_until: editUseUntil, is_indefinite: 0 }),
                    use_place_code: editUsePlace,
                    ...(editUsePlace === 'EXTERNAL' ? { use_place_name: editUsePlaceName.trim() } : {}),
                  })}
                  loading={updateMut.isPending}
                  disabled={!editIndefinite && !editUseUntil}
                >저장</Button>
              </>
            )}
          </div>
        )}
      </div>

      <Modal open={cancelOpen} onClose={() => { setCancelOpen(false); setCancelReason(''); }} title="취소 사유 입력" size="sm">
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-600">재고가 복구됩니다. 취소 사유를 입력해주세요.</p>
          <Textarea label="취소 사유" value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="취소 사유를 입력하세요" rows={3} />
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => { setCancelOpen(false); setCancelReason(''); }}>돌아가기</Button>
            <Button variant="danger" onClick={() => cancelMut.mutate(cancelReason || undefined)} loading={cancelMut.isPending}>취소 확정</Button>
          </div>
        </div>
      </Modal>

      {/* 반납 모달 — 창고 선택 + S/N 선택(부분 반납) */}
      <Modal open={returnOpen} onClose={() => setReturnOpen(false)} title="반납 처리" size="sm">
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-600">반납할 창고를 선택하세요. 기존 창고와 다르면 재고가 이동됩니다.</p>
          <Select
            label="반납 창고 *"
            value={returnStorage}
            onChange={setReturnStorage}
            options={storages.filter(s => s.is_active !== 0).map(s => ({ value: s.storage_code, label: s.storage_name }))}
            placeholder="창고 선택"
          />

          {/* S/N 품목: 반납할 S/N 선택 (부분 반납 지원) */}
          {usage.item?.use_serial === 1 && serials.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-600">반납할 S/N 선택 — {returnSerialIds.length}/{serials.length}개</span>
                <button
                  type="button"
                  onClick={() => setReturnSerialIds(
                    returnSerialIds.length === serials.length ? [] : serials.map((s: SerialNumber) => s.id)
                  )}
                  className="text-xs text-indigo-600 hover:underline"
                >{returnSerialIds.length === serials.length ? '전체 해제' : '전체 선택'}</button>
              </div>
              <div className="border border-gray-200 rounded-lg max-h-40 overflow-y-auto divide-y divide-gray-50">
                {serials.map((sn: SerialNumber) => {
                  const checked = returnSerialIds.includes(sn.id);
                  return (
                    <label key={sn.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setReturnSerialIds(prev =>
                          checked ? prev.filter(id => id !== sn.id) : [...prev, sn.id]
                        )}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-400"
                      />
                      <span className="font-mono text-xs text-gray-700">{sn.serial_no}</span>
                    </label>
                  );
                })}
              </div>
              {returnSerialIds.length < serials.length && returnSerialIds.length > 0 && (
                <p className="text-xs text-amber-600">선택한 {returnSerialIds.length}개만 부분 반납됩니다. 나머지는 계속 사용중으로 유지됩니다.</p>
              )}
            </div>
          )}

          <SerialPhotoPicker
            targets={serials
              .filter((sn: SerialNumber) => returnSerialIds.includes(sn.id))
              .map((sn: SerialNumber) => ({ key: String(sn.id), label: sn.serial_no, sub: sn.asset_no ?? undefined }))}
            value={returnPhotos}
            onChange={setReturnPhotos}
            label="회수 사진"
            hint="회수한 장비의 실물 상태와 보관 위치를 장비별로 남겨두면 이후 담당자가 확인할 수 있습니다."
            emptyText="반납할 S/N을 선택하면 장비별로 사진을 등록할 수 있습니다."
          />

          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setReturnOpen(false)}>취소</Button>
            <Button
              onClick={() => returnMut.mutate({
                id: usage.usage_no,
                storageCode: returnStorage,
                serialIds: usage.item?.use_serial === 1 ? returnSerialIds : undefined,
              })}
              loading={returnMut.isPending}
              disabled={!returnStorage || (usage.item?.use_serial === 1 && serials.length > 0 && returnSerialIds.length === 0)}
            >반납 확정</Button>
          </div>
        </div>
      </Modal>
    </Modal>
  );
}

// ─── 품목별 그룹 카드 ─────────────────────────────────────────────────────────
function ItemGroupCard({ itemName, itemCode, usages, onSelect, storages }: {
  itemName: string; itemCode: string; usages: StockUsage[]; onSelect: (u: StockUsage) => void;
  storages: { storage_code: string; storage_name: string }[];
}) {
  const [expanded, setExpanded] = useState(true);
  const activeUsages    = usages.filter(u => !u.is_cancelled && u.status !== 'CANCELLED' && u.status !== 'RETURNED');
  const cancelledUsages = usages.filter(u => u.is_cancelled || u.status === 'CANCELLED' || u.status === 'RETURNED');
  const totalQty  = activeUsages.reduce((s, u) => s + u.quantity, 0);
  const latest    = usages.reduce((d, u) => new Date(u.created_at) > d ? new Date(u.created_at) : d, new Date(0));

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-2.5 px-5 py-3.5 hover:bg-gray-50 transition-colors text-left overflow-hidden"
      >
        <span className="font-semibold text-gray-800 shrink-0">{itemName}</span>
        <span className="text-xs font-mono text-gray-400 shrink-0">{itemCode}</span>
        {activeUsages.length > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium whitespace-nowrap shrink-0">
            사용중 {activeUsages.length}건
          </span>
        )}
        {cancelledUsages.length > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium whitespace-nowrap shrink-0">
            취소 {cancelledUsages.length}건
          </span>
        )}
        {/* 빈 공간 */}
        <div className="flex-1" />
        {/* 우측: ml-auto + shrink-0으로 항상 같은 위치 */}
        <span className="text-sm font-semibold text-indigo-600 whitespace-nowrap shrink-0">{totalQty.toLocaleString()}개 사용 중</span>
        <span className="text-xs text-gray-400 whitespace-nowrap shrink-0">최근 {latest.toLocaleDateString('ko-KR')}</span>
        <span className="text-xs text-gray-400 shrink-0">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <table className="w-full text-sm border-t border-gray-100 table-fixed">
          <colgroup>
            <col className="w-[160px]" />{/* 사용번호 */}
            <col className="w-[140px]" />{/* 창고 */}
            <col className="w-[72px]" />{/* 수량 */}
            <col className="w-[180px]" />{/* 사용자 */}
            <col />{/* 사용목적 (가변) */}
            <col className="w-[120px]" />{/* 사용처 */}
            <col className="w-[118px]" />{/* 사용기한 */}
            <col className="w-[110px]" />{/* 등록일 */}
            <col className="w-[96px]" />{/* 상태 */}
          </colgroup>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">사용번호</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">창고</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">수량</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">사용자</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">사용목적</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">사용처</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">사용기한</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">등록일</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">상태</th>
            </tr>
          </thead>
          <tbody>
            {usages.map(u => (
              <tr
                key={u.usage_no}
                onClick={() => onSelect(u)}
                className="border-b border-gray-50 last:border-0 hover:bg-indigo-50 cursor-pointer transition-colors"
              >
                <td className="px-4 py-2.5 font-mono text-xs text-gray-400 truncate">{u.usage_no}</td>
                <td className="px-4 py-2.5 text-gray-600 truncate">{u.storage?.storage_name ?? u.storage_code}</td>
                <td className="px-4 py-2.5 font-semibold text-gray-800">{u.quantity.toLocaleString()}</td>
                <td className="px-4 py-2.5">
                  <span className="flex items-center gap-1.5 overflow-hidden">
                    <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs flex items-center justify-center font-semibold shrink-0">
                      {(u.user?.name ?? (u as any).use_name ?? u.use_man_no ?? '?')[0]}
                    </span>
                    <span className="text-gray-700 truncate">{u.user?.name ?? (u as any).use_name ?? u.use_man_no}</span>
                  </span>
                </td>
                <td className="px-4 py-2.5 text-gray-500 truncate">{u.purpose || <span className="text-gray-300">-</span>}</td>
                <td className="px-4 py-2.5 text-xs text-gray-600 truncate">{formatUsePlace(u, storages)}</td>
                <td className="px-4 py-2.5 text-xs whitespace-nowrap">{formatUseUntil(u)}</td>
                <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">{new Date(u.created_at).toLocaleDateString('ko-KR')}</td>
                <td className="px-4 py-2.5">
                  <Badge
                    label={u.status === 'COMPLETED' ? '사용완료' : u.status === 'RETURNED' ? '반납됨' : u.status === 'CANCELLED' || u.is_cancelled ? '취소됨' : '사용중'}
                    color={u.status === 'COMPLETED' ? 'green' : u.status === 'RETURNED' ? 'blue' : u.status === 'CANCELLED' || u.is_cancelled ? 'red' : 'green'}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── 사용자별 그룹 카드 ───────────────────────────────────────────────────────
function UserGroupCard({ userName, usages, onSelect, storages }: {
  userName: string; usages: StockUsage[]; onSelect: (u: StockUsage) => void;
  storages: { storage_code: string; storage_name: string }[];
}) {
  const [expanded, setExpanded] = useState(true);
  const activeUsages    = usages.filter(u => !u.is_cancelled && u.status !== 'CANCELLED' && u.status !== 'RETURNED');
  const cancelledUsages = usages.filter(u => u.is_cancelled || u.status === 'CANCELLED' || u.status === 'RETURNED');
  const totalQty  = activeUsages.reduce((s, u) => s + u.quantity, 0);
  const latest    = usages.reduce((d, u) => new Date(u.created_at) > d ? new Date(u.created_at) : d, new Date(0));

  // 품목 요약 (상위 3개)
  const itemSummary = useMemo(() => {
    const counts: Record<string, { name: string; qty: number }> = {};
    activeUsages.forEach(u => {
      const k = u.item_code;
      if (!counts[k]) counts[k] = { name: u.item?.item_name ?? u.item_code, qty: 0 };
      counts[k].qty += u.quantity;
    });
    return Object.values(counts).sort((a, b) => b.qty - a.qty).slice(0, 3);
  }, [activeUsages]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors text-left overflow-hidden"
      >
        {/* 아바타 */}
        <span className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 text-sm flex items-center justify-center font-bold shrink-0">
          {userName[0]}
        </span>
        {/* 이름 */}
        <span className="font-semibold text-gray-800 shrink-0">{userName}</span>
        {/* 상태 뱃지 */}
        {activeUsages.length > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium whitespace-nowrap shrink-0">
            사용중 {activeUsages.length}건
          </span>
        )}
        {cancelledUsages.length > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium whitespace-nowrap shrink-0">
            취소 {cancelledUsages.length}건
          </span>
        )}
        {/* 품목 칩 — flex-1 overflow-hidden으로 남은 공간만 사용, 줄 바꿈 없음 */}
        <div className="flex gap-1.5 flex-1 overflow-hidden">
          {itemSummary.map(it => (
            <span key={it.name} className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 whitespace-nowrap shrink-0">
              {it.name} <span className="text-indigo-500 font-medium">×{it.qty}</span>
            </span>
          ))}
        </div>
        {/* 우측 요약 — ml-auto + shrink-0으로 항상 같은 위치 */}
        <span className="text-sm font-semibold text-indigo-600 whitespace-nowrap ml-auto shrink-0">{totalQty.toLocaleString()}개 사용 중</span>
        <span className="text-xs text-gray-400 whitespace-nowrap shrink-0">최근 {latest.toLocaleDateString('ko-KR')}</span>
        <span className="text-xs text-gray-400 shrink-0">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <table className="w-full text-sm border-t border-gray-100 table-fixed">
          <colgroup>
            <col className="w-[160px]" />{/* 사용번호 */}
            <col className="w-[180px]" />{/* 품목 */}
            <col className="w-[140px]" />{/* 창고 */}
            <col className="w-[72px]" />{/* 수량 */}
            <col />{/* 사용목적 (가변) */}
            <col className="w-[120px]" />{/* 사용처 */}
            <col className="w-[118px]" />{/* 사용기한 */}
            <col className="w-[110px]" />{/* 등록일 */}
            <col className="w-[96px]" />{/* 상태 */}
          </colgroup>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">사용번호</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">품목</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">창고</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">수량</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">사용목적</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">사용처</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">사용기한</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">등록일</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">상태</th>
            </tr>
          </thead>
          <tbody>
            {usages.map(u => (
              <tr
                key={u.usage_no}
                onClick={() => onSelect(u)}
                className="border-b border-gray-50 last:border-0 hover:bg-indigo-50 cursor-pointer transition-colors"
              >
                <td className="px-4 py-2.5 font-mono text-xs text-gray-400 truncate">{u.usage_no}</td>
                <td className="px-4 py-2.5">
                  <span className="flex items-center gap-1 overflow-hidden">
                    <span className="text-gray-800 font-medium truncate">{u.item?.item_name ?? u.item_code}</span>
                    {u.item?.use_serial === 1 && (
                      <span className="text-xs px-1 py-0.5 rounded bg-blue-100 text-blue-600 font-medium shrink-0">S/N</span>
                    )}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-gray-600 truncate">{u.storage?.storage_name ?? u.storage_code}</td>
                <td className="px-4 py-2.5 font-semibold text-gray-800">{u.quantity.toLocaleString()}</td>
                <td className="px-4 py-2.5 text-gray-500 truncate">{u.purpose || <span className="text-gray-300">-</span>}</td>
                <td className="px-4 py-2.5 text-xs text-gray-600 truncate">{formatUsePlace(u, storages)}</td>
                <td className="px-4 py-2.5 text-xs whitespace-nowrap">{formatUseUntil(u)}</td>
                <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">{new Date(u.created_at).toLocaleDateString('ko-KR')}</td>
                <td className="px-4 py-2.5">
                  <Badge
                    label={u.status === 'COMPLETED' ? '사용완료' : u.status === 'RETURNED' ? '반납됨' : u.status === 'CANCELLED' || u.is_cancelled ? '취소됨' : '사용중'}
                    color={u.status === 'COMPLETED' ? 'green' : u.status === 'RETURNED' ? 'blue' : u.status === 'CANCELLED' || u.is_cancelled ? 'red' : 'green'}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── 폼 타입 ─────────────────────────────────────────────────────────────────
type FormItem = { item_code: string; storage_code: string; quantity: number; serial_number_ids: number[] };
const emptyItem = (): FormItem => ({ item_code: '', storage_code: '', quantity: 1, serial_number_ids: [] });

// ─── 메인 페이지 ──────────────────────────────────────────────────────────────
export function StockUsagesPage() {
  const qc = useQueryClient();
  const { user, isAdmin, hasPermission } = useAuthStore();

  const { data = [], isLoading }  = useQuery({ queryKey: ['stock-usages'], queryFn: stockUsagesApi.findAll });
  const { data: items = [] }      = useQuery({ queryKey: ['items'],        queryFn: itemsApi.findAll });
  const { data: storages = [] }   = useQuery({ queryKey: ['storage'],      queryFn: storageApi.findAll });
  const { data: employees = [] }  = useQuery({ queryKey: ['employees-active'],    queryFn: employeesApi.findActiveList });

  const getItem = (code: string) => items.find(i => i.item_code === code);

  // ── 뷰 모드 ────────────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // ── 상세 모달 ──────────────────────────────────────────────────────────────
  const [selected, setSelected] = useState<StockUsage | null>(null);
  const { data: detail } = useQuery({
    queryKey: ['stock-usage', selected?.usage_no],
    queryFn: () => stockUsagesApi.findOne(selected!.usage_no),
    enabled: !!selected,
  });

  // ── 등록 모달 ──────────────────────────────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false);
  const [useManNo, setUseManNo]     = useState('');
  const [useName, setUseName]       = useState('');       // 미가입자 이름
  const [userMode, setUserMode]     = useState<'registered' | 'unregistered'>('registered');
  const [purpose, setPurpose]       = useState('');
  const [usePlace, setUsePlace]     = useState('');            // 사용처 (창고코드 | 'EXTERNAL')
  const [usePlaceName, setUsePlaceName] = useState('');        // 외부 선택 시 직접 입력
  const [useUntil, setUseUntil]     = useState('');            // 사용기한 (YYYY-MM-DD)
  const [indefinite, setIndefinite] = useState(false);         // 무기한 사용
  const [formItems, setFormItems]   = useState<FormItem[]>([emptyItem()]);
  const [photos, setPhotos]         = useState<SerialPhotoMap>({});  // S/N별 사진 — 등록 성공 후 올린다

  const resetForm = () => { setUseManNo(''); setUseName(''); setUserMode('registered'); setPurpose(''); setUsePlace(''); setUsePlaceName(''); setUseUntil(''); setIndefinite(false); setFormItems([emptyItem()]); setPhotos({}); };
  const updateFormItem = (idx: number, patch: Partial<FormItem>) =>
    setFormItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));

  const createMut = useMutation({
    mutationFn: (dto: CreateBulkUsageDto) => stockUsagesApi.createBulk(dto),
    onSuccess: async (created) => {
      await uploadSerialPhotos(photos, 'USAGE', created?.[0]?.usage_no);
      qc.invalidateQueries({ queryKey: ['stock-usages'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['serial-numbers'] });
      setCreateOpen(false); resetForm();
    },
  });

  // ── 옵션 목록 ──────────────────────────────────────────────────────────────
  const itemOptions     = items.filter(i => i.is_active !== 0).map(i => ({ value: i.item_code, label: `${i.item_name} (${i.item_code})` }));
  const storageOptions  = storages.map(s => ({ value: s.storage_code, label: `${s.storage_name} (${s.storage_code})` }));
  const employeeOptions = [
    { value: '', label: `본인 (${user?.name ?? user?.man_no})` },
    ...employees.filter(e => e.man_no !== user?.man_no).map(e => ({ value: e.man_no, label: `${e.name} (${e.man_no})` })),
  ];

  const isFormValid = (indefinite || !!useUntil) && formItems.every(it => {
    if (!it.item_code || !it.storage_code) return false;
    return getItem(it.item_code)?.use_serial === 1 ? it.serial_number_ids.length > 0 : it.quantity > 0;
  });

  const handleCreate = () => {
    const bulkItems: BulkUsageItem[] = formItems.map(it => ({
      item_code: it.item_code, storage_code: it.storage_code,
      quantity: it.serial_number_ids.length > 0 ? it.serial_number_ids.length : it.quantity,
      ...(it.serial_number_ids.length > 0 ? { serial_number_ids: it.serial_number_ids } : {}),
    }));
    const dto: CreateBulkUsageDto = {
      purpose: purpose || undefined,
      items: bulkItems,
      ...(indefinite ? { is_indefinite: 1 } : { use_until: useUntil }),
      ...(usePlace ? { use_place_code: usePlace } : {}),
      ...(usePlace === 'EXTERNAL' && usePlaceName.trim() ? { use_place_name: usePlaceName.trim() } : {}),
    };
    if (userMode === 'unregistered' && useName.trim()) {
      dto.use_name = useName.trim();
    } else {
      dto.use_man_no = useManNo || undefined;
    }
    createMut.mutate(dto);
  };

  // ── 권한 ──────────────────────────────────────────────────────────────────
  const canEdit   = (u: StockUsage) => hasPermission('usage:update') && (isAdmin() || (!!u.use_man_no && u.use_man_no === user?.man_no));
  const canCancel = (u: StockUsage) => hasPermission('usage:cancel') && (isAdmin() || (!!u.use_man_no && u.use_man_no === user?.man_no));

  // ── 검색·필터 ─────────────────────────────────────────────────────────────
  const [search, setSearch]             = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const filtered = useMemo(() => data.filter(r => {
    if (statusFilter === 'active'    && r.is_cancelled)  return false;
    if (statusFilter === 'cancelled' && !r.is_cancelled) return false;
    if (search) {
      const q = search.toLowerCase();
      const basicMatch =
        r.usage_no.toLowerCase().includes(q)
        || (r.item?.item_name ?? r.item_code).toLowerCase().includes(q)
        || (r.storage?.storage_name ?? r.storage_code).toLowerCase().includes(q)
        || (r.user?.name ?? r.use_man_no ?? '').toLowerCase().includes(q)
        || (r.purpose ?? '').toLowerCase().includes(q);
      if (basicMatch) return true;
      // S/N 및 태그 값 검색
      return (r.serialNumbers ?? []).some(sn =>
        sn.serial_no.toLowerCase().includes(q)
        || Object.values(sn.tags ?? {}).some(v => v?.toLowerCase().includes(q)),
      );
    }
    return true;
  }), [data, search, statusFilter]);

  // ── 품목별 그룹 ────────────────────────────────────────────────────────────
  const itemGroups = useMemo(() => {
    const groups: Record<string, { itemName: string; itemCode: string; usages: StockUsage[] }> = {};
    filtered.forEach(u => {
      const k = u.item_code;
      if (!groups[k]) groups[k] = { itemName: u.item?.item_name ?? u.item_code, itemCode: u.item_code, usages: [] };
      groups[k].usages.push(u);
    });
    return Object.values(groups).sort((a, b) => a.itemName.localeCompare(b.itemName, 'ko'));
  }, [filtered]);

  // ── 사용자별 그룹 ──────────────────────────────────────────────────────────
  const userGroups = useMemo(() => {
    const groups: Record<string, { userName: string; usages: StockUsage[] }> = {};
    filtered.forEach(u => {
      const k = u.use_man_no ?? `_unregistered_${(u as any).use_name ?? ''}`;
      if (!groups[k]) groups[k] = { userName: u.user?.name ?? (u as any).use_name ?? u.use_man_no ?? '미가입자', usages: [] };
      groups[k].usages.push(u);
    });
    return Object.values(groups).sort((a, b) => a.userName.localeCompare(b.userName, 'ko'));
  }, [filtered]);

  // ── 뷰 토글 버튼 스타일 ────────────────────────────────────────────────────
  const tabCls = (mode: ViewMode) =>
    `px-3 py-1.5 text-sm transition-colors ${viewMode === mode
      ? 'bg-indigo-600 text-white'
      : 'bg-white text-gray-600 hover:bg-gray-50'}`;

  return (
    <div className="space-y-4">
      {/* 툴바 */}
      <div className="flex items-center gap-3 justify-between flex-wrap">
        <div className="flex gap-2 items-center">
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="번호·품목·창고·사용자·목적·S/N·태그 검색"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 w-60"
          />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
            <option value="">전체 상태</option>
            <option value="active">사용중</option>
            <option value="cancelled">취소됨</option>
          </select>
          <span className="text-sm text-gray-500">{filtered.length}건</span>
        </div>

        <div className="flex items-center gap-3">
          {/* 뷰 모드 토글 */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button onClick={() => setViewMode('list')} className={tabCls('list')}>목록</button>
            <button onClick={() => setViewMode('item')} className={tabCls('item')}>품목별</button>
            <button onClick={() => setViewMode('user')} className={tabCls('user')}>사용자별</button>
          </div>
          {hasPermission('usage:create') && <Button onClick={() => setCreateOpen(true)}>+ 재고사용 등록</Button>}
        </div>
      </div>

      {/* ── 목록 뷰 ── */}
      {viewMode === 'list' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {isLoading ? (
            <div className="py-16 text-center text-sm text-gray-400">불러오는 중...</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">재고사용 내역이 없습니다.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">사용번호</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">품목</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">창고</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">수량</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">사용목적</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">사용처</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">사용기한</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">사용자</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">등록일</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">상태</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.usage_no} onClick={() => setSelected(r)}
                    className="border-b border-gray-100 last:border-0 cursor-pointer hover:bg-indigo-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{r.usage_no}</td>
                    <td className="px-4 py-3 text-gray-800">
                      <span className="flex items-center gap-1">
                        {r.item?.item_name ?? r.item_code}
                        {r.item?.use_serial === 1 && <span className="text-xs px-1 py-0.5 rounded bg-blue-100 text-blue-600 font-medium">S/N</span>}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{r.storage?.storage_name ?? r.storage_code}</td>
                    <td className="px-4 py-3 font-medium">{r.quantity.toLocaleString()}</td>
                    <td className="px-4 py-3 text-gray-500 max-w-[160px] truncate">{r.purpose ?? '-'}</td>
                    <td className="px-4 py-3 text-xs text-gray-600 truncate">{formatUsePlace(r, storages)}</td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap">{formatUseUntil(r)}</td>
                    <td className="px-4 py-3 text-gray-600">{r.user?.name ?? (r as any).use_name ?? r.use_man_no ?? '-'}</td>
                    <td className="px-4 py-3 text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString('ko-KR')}</td>
                    <td className="px-4 py-3">
                      <Badge
                        label={r.status === 'COMPLETED' ? '사용완료' : r.status === 'RETURNED' ? '반납됨' : r.status === 'CANCELLED' || r.is_cancelled ? '취소됨' : '사용중'}
                        color={r.status === 'COMPLETED' ? 'green' : r.status === 'RETURNED' ? 'blue' : r.status === 'CANCELLED' || r.is_cancelled ? 'red' : 'green'}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── 품목별 뷰 ── */}
      {viewMode === 'item' && (
        isLoading ? (
          <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-sm text-gray-400">불러오는 중...</div>
        ) : itemGroups.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-sm text-gray-400">재고사용 내역이 없습니다.</div>
        ) : (
          <div className="space-y-3">
            {itemGroups.map(g => (
              <ItemGroupCard
                key={g.itemCode}
                itemName={g.itemName}
                itemCode={g.itemCode}
                usages={g.usages}
                onSelect={setSelected}
                storages={storages}
              />
            ))}
          </div>
        )
      )}

      {/* ── 사용자별 뷰 ── */}
      {viewMode === 'user' && (
        isLoading ? (
          <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-sm text-gray-400">불러오는 중...</div>
        ) : userGroups.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-sm text-gray-400">재고사용 내역이 없습니다.</div>
        ) : (
          <div className="space-y-3">
            {userGroups.map(g => (
              <UserGroupCard
                key={g.userName}
                userName={g.userName}
                usages={g.usages}
                onSelect={setSelected}
                storages={storages}
              />
            ))}
          </div>
        )
      )}

      {/* 상세 모달 */}
      {selected && detail && (
        <UsageDetailModal
          usage={detail}
          onClose={() => setSelected(null)}
          canEdit={canEdit(selected)}
          canCancel={canCancel(selected)}
          storages={storages}
        />
      )}

      {/* 등록 모달 */}
      <Modal open={createOpen} onClose={() => { setCreateOpen(false); resetForm(); }} title="재고사용 등록" size="lg">
        <div className="p-5 space-y-5">
          {/* 사용자 입력 */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">사용자</p>
            <div className="flex gap-2 mb-2">
              <button type="button"
                onClick={() => { setUserMode('registered'); setUseName(''); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${userMode === 'registered' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400'}`}
              >가입자</button>
              <button type="button"
                onClick={() => { setUserMode('unregistered'); setUseManNo(''); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${userMode === 'unregistered' ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-600 border-gray-300 hover:border-orange-400'}`}
              >미가입자</button>
            </div>
            {userMode === 'registered' ? (
              <Select label="" value={useManNo} onChange={setUseManNo} options={employeeOptions} placeholder="본인" />
            ) : (
              <Input label="" value={useName} onChange={e => setUseName(e.target.value)} placeholder="미가입자 이름 직접 입력" />
            )}
          </div>
          <Textarea label="사용목적" value={purpose} onChange={e => setPurpose(e.target.value)} rows={1} />

          {/* 사용처 — 창고 목록 + 외부(직접입력) */}
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="사용처"
              value={usePlace}
              onChange={v => { setUsePlace(v); if (v !== 'EXTERNAL') setUsePlaceName(''); }}
              options={[...storageOptions, { value: 'EXTERNAL', label: '외부 (직접 입력)' }]}
              placeholder="사용처 선택"
            />
            {usePlace === 'EXTERNAL' && (
              <Input
                label="외부 사용처명"
                value={usePlaceName}
                onChange={e => setUsePlaceName(e.target.value)}
                placeholder="예: 고객사 site-a 현장"
              />
            )}
          </div>

          {/* 사용기한 — 필수 (무기한 선택 시 날짜 불필요) */}
          <div>
            <label className="text-sm font-medium text-gray-700">사용기한 *</label>
            <div className="flex items-center gap-3 mt-1">
              <input
                type="date"
                value={useUntil}
                onChange={e => setUseUntil(e.target.value)}
                disabled={indefinite}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-gray-100 disabled:text-gray-400"
              />
              <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={indefinite}
                  onChange={e => { setIndefinite(e.target.checked); if (e.target.checked) setUseUntil(''); }}
                  className="rounded text-indigo-600 focus:ring-indigo-400"
                />
                무기한
              </label>
            </div>
            {!indefinite && !useUntil && (
              <p className="text-xs text-amber-600 mt-1">사용기한을 선택하거나 무기한을 체크해주세요.</p>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">품목 목록</p>
              <button type="button" onClick={() => setFormItems(p => [...p, emptyItem()])}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium cursor-pointer">
                + 품목 추가
              </button>
            </div>
            {formItems.map((it, idx) => {
              const isSerial = getItem(it.item_code)?.use_serial === 1;
              return (
                <div key={idx} className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-500">품목 {idx + 1}</span>
                    {formItems.length > 1 && (
                      <button type="button" onClick={() => setFormItems(p => p.filter((_, i) => i !== idx))}
                        className="text-xs text-red-400 hover:text-red-600 cursor-pointer">삭제</button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Select label="품목 *" value={it.item_code}
                      onChange={v => updateFormItem(idx, { item_code: v, serial_number_ids: [] })}
                      options={itemOptions} placeholder="선택" />
                    <Select label="창고 *" value={it.storage_code}
                      onChange={v => updateFormItem(idx, { storage_code: v, serial_number_ids: [] })}
                      options={storageOptions} placeholder="선택" />
                  </div>
                  {isSerial ? (
                    <>
                      <SerialPicker
                        item_code={it.item_code} storage_code={it.storage_code}
                        selected={it.serial_number_ids}
                        onChange={ids => updateFormItem(idx, { serial_number_ids: ids, quantity: ids.length })}
                      />
                      <UsagePhotoPicker
                        item_code={it.item_code} storage_code={it.storage_code}
                        selected={it.serial_number_ids}
                        value={photos} onChange={setPhotos}
                      />
                    </>
                  ) : (
                    <Input label="수량 *" type="number" value={it.quantity || ''}
                      onChange={e => updateFormItem(idx, { quantity: Number(e.target.value) })} />
                  )}
                </div>
              );
            })}
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-xs text-yellow-700">
            ⚠️ 재고사용 등록 시 PENDING 상태로 저장됩니다. 재고 차감은 사용완료 처리 시 이루어집니다.
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <Button variant="secondary" onClick={() => { setCreateOpen(false); resetForm(); }}>취소</Button>
            <Button onClick={handleCreate} loading={createMut.isPending} disabled={!isFormValid}>
              등록 ({formItems.length}건)
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
