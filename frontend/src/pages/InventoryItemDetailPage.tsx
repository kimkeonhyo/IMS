import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AssetImageThumb, AssetImageLightbox, AssetImageManager } from '../components/AssetImages';
import { getLatestAssetImages, type AssetImage } from '../api/assetImages';
import { serialNumbersApi } from '../api/serialNumbers';
import { itemsApi, inventoryApi, storageApi } from '../api/items';
import { Modal } from '../components/ui/Modal';
import type { SerialNumber } from '../types';

const STATUS_LABEL: Record<string, string> = {
  STOCK:     '재고',
  IN_USE:    '사용중',
  USED:      '사용됨',
  SHIPPED:   '납품됨',
  REPAIR:    '수리중',
  CANCELLED: '취소됨',
};
const STATUS_COLOR: Record<string, string> = {
  STOCK:     'bg-green-100 text-green-700',
  IN_USE:    'bg-amber-100 text-amber-700',
  REPAIR:    'bg-orange-100 text-orange-700',
  USED:      'bg-gray-100 text-gray-500',
  SHIPPED:   'bg-blue-100 text-blue-700',
  CANCELLED: 'bg-red-100 text-red-400',
};
// 상태 기본 정렬 순서: 재고 → 사용중 → 사용됨 → 납품됨 → 취소됨
const STATUS_ORDER: Record<string, number> = {
  STOCK: 0, IN_USE: 1, USED: 2, SHIPPED: 3, CANCELLED: 4,
};

/** 창고 컬럼 표시값 — 사용 중(활성 usage)이면 사용처, 그 외엔 보관 창고 */
function placeCell(sn: SerialNumber, storageName: (code: string | null) => string) {
  if (sn.usageStatus && sn.usePlace) {
    return <span className="text-indigo-700">{sn.usePlace}<span className="text-gray-400 ml-1">(사용처)</span></span>;
  }
  return <>{storageName(sn.storage_code)}</>;
}

/** 사용 중인 S/N의 사용기한 배지 — 무기한은 '무기한', 기한 지난 건은 빨강 강조.
 *  수리 진행 중이면 그 자리에 수리완료 예정일을 보여준다. */
function useUntilBadge(sn: SerialNumber) {
  if (sn.repairStatus === 'REPAIRING' || sn.repairStatus === 'REPORTED') {
    const due = sn.repairExpectedDoneAt ? String(sn.repairExpectedDoneAt).slice(0, 10) : null;
    if (!due) return <span className="text-[11px] text-gray-400">수리 예정일 미정</span>;
    const overdue = due < new Date().toISOString().slice(0, 10);
    return (
      <span className={`text-xs ${overdue ? 'text-red-600 font-medium' : 'text-amber-700'}`}
            title={`${sn.repairVendor ?? '수리'} · ${sn.repairNo ?? ''}`}>
        {due}
        <span className="ml-1 text-[10px] text-gray-400">(수리완료 예정)</span>
        {overdue ? <span className="ml-0.5 text-[10px]">지연</span> : null}
      </span>
    );
  }
  if (!sn.usageStatus) return null;   // 활성 사용 건이 없으면 표시 안 함
  if (sn.isIndefinite === 1) return <span className="text-[11px] text-gray-400">무기한</span>;
  if (!sn.useUntil) return null;
  const date = String(sn.useUntil).slice(0, 10);
  const overdue = date < new Date().toISOString().slice(0, 10);
  return (
    <span className={`text-xs ${overdue ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
      {date}{overdue ? ' (초과)' : ''}
    </span>
  );
}

export function InventoryItemDetailPage() {
  const { item_code } = useParams<{ item_code: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [tagSearch, setTagSearch]     = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [storageFilter, setStorageFilter] = useState('');

  // 정렬 상태 — 기본: 상태순(재고→사용중→사용됨→납품됨→취소됨) 오름차순
  const [sortKey, setSortKey] = useState<string>('status');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  // 인라인 수정 상태
  const [editingId, setEditingId]     = useState<number | null>(null);
  const [editSerial, setEditSerial]   = useState('');
  const [editAsset, setEditAsset]     = useState('');
  const [editTags, setEditTags]       = useState<Record<string, string>>({});

  const { data: item } = useQuery({
    queryKey: ['items', item_code],
    queryFn: () => itemsApi.findOne(item_code!),
    enabled: !!item_code,
  });

  const { data: serialList = [], isLoading } = useQuery({
    queryKey: ['serial-numbers', 'by-item', item_code],
    queryFn: () => serialNumbersApi.findByItem(item_code!),
    enabled: !!item_code,
  });

  // 장비별 최신 사진 1장 — 목록에서 실물을 바로 확인할 수 있게
  const serialIds = serialList.map((sn: SerialNumber) => sn.id);
  const { data: latestImages = {} } = useQuery({
    queryKey: ['asset-images', 'latest', item_code, serialIds.length],
    queryFn: () => getLatestAssetImages(serialIds),
    enabled: serialIds.length > 0,
  });
  const [viewingImage, setViewingImage] = useState<AssetImage | null>(null);
  const [photoSerial, setPhotoSerial] = useState<SerialNumber | null>(null);   // 사진 관리 모달 대상

  const { data: inventory = [] } = useQuery({
    queryKey: ['inventory'],
    queryFn: inventoryApi.findAll,
  });

  const { data: allStorages = [] } = useQuery({
    queryKey: ['storage'],
    queryFn: storageApi.findAll,
  });

  // 창고 코드 → 이름 매핑
  const storageName = (code?: string | null) =>
    (code && allStorages.find(s => s.storage_code === code)?.storage_name) || code || '-';

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { serial_no?: string; asset_no?: string | null; tags?: Record<string, string> } }) =>
      serialNumbersApi.updateOne(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['serial-numbers', 'by-item', item_code] });
      setEditingId(null);
    },
  });

  // 창고 목록 (S/N 데이터 기반)
  const storages = useMemo(() => {
    const codes = [...new Set(serialList.map(s => s.storage_code).filter(Boolean))];
    return codes as string[];
  }, [serialList]);

  // 태그 키 목록
  const tagKeys: string[] = item?.specs ?? [];

  // 표시용 실질 상태 — usage(재고사용) 상태 기준으로 판정 (등록/미등록 사용자 공통):
  //  - 납품된 S/N             → 납품됨(SHIPPED)
  //  - 활성 usage COMPLETED   → 사용됨(USED)    : 사용완료 처리됨
  //  - 활성 usage PENDING     → 사용중(IN_USE)  : 사용중 (아직 사용완료 전)
  //  - 그 외                  → 재고(STOCK)
  // ※ serial.status가 아니라 usageStatus를 사용해, 기존 데이터에서 serial.status만
  //   USED로 박혀있고 usage는 PENDING인 불일치 건도 '사용중'으로 정확히 표시.
  const effStatus = (sn: SerialNumber): string => {
    if ((sn as any).shipmentDestination) return 'SHIPPED';
    const us = (sn as any).usageStatus as string | null | undefined;
    if (us === 'COMPLETED') return 'USED';
    if (us === 'PENDING') return 'IN_USE';
    return sn.status;
  };

  // 재고현황 창고별 수량 요약
  // S/N 품목: '재고'(STOCK) 상태 S/N만 창고별로 집계 (사용중/사용됨/납품됨 제외)
  // 비 S/N 품목: inventory 테이블 수량 사용
  const isSerialItem = item?.use_serial === 1;
  const inventorySummary = useMemo(() =>
    inventory
      .filter(r => r.item_code === item_code)
      .map(r => ({
        storage: r.storage?.storage_name ?? r.storage_code,
        storage_code: r.storage_code,
        qty: isSerialItem
          ? serialList.filter(s => s.storage_code === r.storage_code && effStatus(s) === 'STOCK').length
          : r.quantity,
      })),
  [inventory, item_code, isSerialItem, serialList]);

  // 필터링
  const filtered = useMemo(() => {
    return serialList.filter(sn => {
      if (statusFilter && effStatus(sn) !== statusFilter) return false;
      // 창고 선택 시: 해당 창고의 '재고' 상태만 표시 (사용중/사용됨/납품됨 제외)
      if (storageFilter) {
        if (sn.storage_code !== storageFilter) return false;
        if (effStatus(sn) !== 'STOCK') return false;
      }
      if (tagSearch.trim()) {
        const q = tagSearch.trim().toLowerCase();
        const inSerial = sn.serial_no.toLowerCase().includes(q);
        const inAsset = (sn.asset_no ?? '').toLowerCase().includes(q);
        const inTags = sn.tags
          ? Object.values(sn.tags).some(v => v?.toLowerCase().includes(q))
          : false;
        if (!inSerial && !inAsset && !inTags) return false;
      }
      return true;
    });
  }, [serialList, statusFilter, storageFilter, tagSearch]);

  // 상태별 카운트
  const statusCounts = useMemo(() =>
    Object.entries(STATUS_LABEL).map(([status, label]) => ({
      status, label,
      count: serialList.filter(s => effStatus(s) === status).length,
    })).filter(x => x.count > 0),
  [serialList]);

  // 정렬: 컬럼별 정렬값 추출 (status는 지정 순서대로)
  const getSortVal = (sn: SerialNumber): string | number => {
    if (sortKey === 'status') return STATUS_ORDER[effStatus(sn)] ?? 99;
    if (sortKey === 'storage') return (sn.usageStatus && sn.usePlace) ? sn.usePlace : storageName(sn.storage_code);
    if (sortKey === 'user') return (sn as any).currentUser ?? (sn as any).shipmentDestination ?? '';
    if (sortKey === 'serial_no') return sn.serial_no;
    if (sortKey === 'asset_no') return sn.asset_no ?? '';
    // 사용기한: 빠른 기한 먼저, 무기한·해당없음은 뒤로
    if (sortKey === 'useUntil') {
      // 수리 건은 완료 예정일 기준으로 함께 정렬한다
      if (sn.repairStatus === 'REPAIRING' || sn.repairStatus === 'REPORTED') {
        return sn.repairExpectedDoneAt ? String(sn.repairExpectedDoneAt).slice(0, 10) : '~~';
      }
      if (!sn.usageStatus) return '~~~';                 // 사용 건 없음 → 맨 뒤
      if (sn.isIndefinite === 1) return '~~';            // 무기한 → 그 앞
      return sn.useUntil ? String(sn.useUntil).slice(0, 10) : '~~~';
    }
    if (sortKey.startsWith('tag:')) return sn.tags?.[sortKey.slice(4)] ?? '';
    return sn.serial_no;
  };
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const va = getSortVal(a), vb = getSortVal(b);
      let cmp = (typeof va === 'number' && typeof vb === 'number')
        ? va - vb
        : String(va).localeCompare(String(vb), 'ko');
      if (cmp === 0) cmp = a.serial_no.localeCompare(b.serial_no, 'ko'); // 2차 정렬: S/N
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sortKey, sortDir]);

  const startEdit = (sn: SerialNumber) => {
    setEditingId(sn.id);
    setEditSerial(sn.serial_no);
    setEditAsset(sn.asset_no ?? '');
    setEditTags({ ...(sn.tags ?? {}) });
  };

  const saveEdit = () => {
    if (editingId == null) return;
    updateMut.mutate({
      id: editingId,
      data: { serial_no: editSerial, asset_no: editAsset.trim() || null, tags: editTags },
    });
  };

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/inventory')}
          className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 cursor-pointer"
        >
          ← 재고현황
        </button>
        <span className="text-gray-300">/</span>
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {item?.item_name ?? item_code}
          </h1>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs font-mono text-gray-400">{item_code}</span>
            {item?.category && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{item.category}</span>
            )}
            <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-600 font-medium">S/N 관리</span>
          </div>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="flex gap-3 flex-wrap">
        {/* 창고별 재고수량 — 클릭 시 해당 창고 필터 */}
        {inventorySummary.map(s => {
          const isActive = storageFilter === s.storage_code;
          return (
            <button
              key={s.storage_code}
              onClick={() => setStorageFilter(isActive ? '' : s.storage_code)}
              className={`rounded-lg border px-4 py-2.5 text-sm text-left transition-colors cursor-pointer ${
                isActive
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : 'bg-white border-gray-200 hover:border-indigo-400 hover:bg-indigo-50'
              }`}
            >
              <p className={`text-xs mb-0.5 ${isActive ? 'text-indigo-200' : 'text-gray-400'}`}>{s.storage}</p>
              <p className="font-semibold">{s.qty.toLocaleString()}개</p>
            </button>
          );
        })}
        {/* 상태별 S/N 수 */}
        {statusCounts.map(({ status, label, count }) => (
          <div key={status} className={`rounded-lg border px-4 py-2.5 text-sm ${STATUS_COLOR[status]}`}>
            <p className="text-xs opacity-70 mb-0.5">{label}</p>
            <p className="font-semibold">{count}개</p>
          </div>
        ))}
      </div>

      {/* 검색/필터 */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          placeholder="S/N·장비번호 또는 태그 값 검색 (모델명, CPU, RAM...)"
          value={tagSearch}
          onChange={e => setTagSearch(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 w-72"
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
        >
          <option value="">전체 상태</option>
          {Object.entries(STATUS_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <select
          value={storageFilter}
          onChange={e => setStorageFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
        >
          <option value="">전체 창고</option>
          {storages.map(code => (
            <option key={code} value={code}>{storageName(code)}</option>
          ))}
        </select>
        <span className="text-sm text-gray-400 ml-auto">{filtered.length}개</span>
      </div>

      {/* S/N 테이블 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-sm text-gray-400">불러오는 중...</div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-sm text-gray-400">
            {tagSearch || statusFilter || storageFilter ? '검색 결과가 없습니다.' : '등록된 S/N이 없습니다.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 w-16 text-left text-xs font-semibold text-gray-600">사진</th>
                  <SortTh label="S/N"           sortKey="serial_no" active={sortKey} dir={sortDir} onSort={toggleSort} className="w-40" />
                  <SortTh label="장비번호"      sortKey="asset_no"  active={sortKey} dir={sortDir} onSort={toggleSort} className="w-32" />
                  <SortTh label="상태"          sortKey="status"    active={sortKey} dir={sortDir} onSort={toggleSort} className="w-20" />
                  <SortTh label="사용기한"      sortKey="useUntil"  active={sortKey} dir={sortDir} onSort={toggleSort} className="w-28" />
                  <SortTh label="창고"          sortKey="storage"   active={sortKey} dir={sortDir} onSort={toggleSort} className="w-24" />
                  <SortTh label="사용자 / 납품처" sortKey="user"      active={sortKey} dir={sortDir} onSort={toggleSort} className="w-28" />
                  {tagKeys.map(k => (
                    <SortTh key={k} label={k} sortKey={`tag:${k}`} active={sortKey} dir={sortDir} onSort={toggleSort} />
                  ))}
                  <th className="px-4 py-3 w-16" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((sn: SerialNumber) => {
                  const isEditing = editingId === sn.id;
                  return (
                    <tr
                      key={sn.id}
                      className={`border-b border-gray-100 last:border-0 ${isEditing ? 'bg-yellow-50' : 'hover:bg-gray-50'}`}
                    >
                      {/* 최신 사진 — 클릭하면 그 장비의 사진을 추가·삭제할 수 있다 */}
                      <td className="px-4 py-2.5">
                        {latestImages[sn.id] ? (
                          <AssetImageThumb image={latestImages[sn.id]} size={40} onClick={() => setPhotoSerial(sn)} />
                        ) : (
                          <button
                            type="button"
                            onClick={() => setPhotoSerial(sn)}
                            className="flex h-10 w-10 items-center justify-center rounded border border-dashed border-gray-300 text-gray-400 hover:border-indigo-400 hover:text-indigo-500 cursor-pointer"
                            title="사진 등록"
                          >＋</button>
                        )}
                      </td>

                      {/* S/N */}
                      <td className="px-4 py-2.5">
                        {isEditing ? (
                          <input
                            value={editSerial}
                            onChange={e => setEditSerial(e.target.value)}
                            className="border border-gray-300 rounded px-2 py-0.5 text-xs font-mono w-full focus:outline-none focus:ring-1 focus:ring-indigo-400"
                          />
                        ) : (
                          <span className="font-mono text-xs text-gray-700">{sn.serial_no}</span>
                        )}
                      </td>
                      {/* 장비번호 */}
                      <td className="px-4 py-2.5">
                        {isEditing ? (
                          <input
                            value={editAsset}
                            onChange={e => setEditAsset(e.target.value)}
                            placeholder="장비번호"
                            className="border border-gray-300 rounded px-2 py-0.5 text-xs font-mono w-full focus:outline-none focus:ring-1 focus:ring-indigo-400"
                          />
                        ) : (
                          <span className={`font-mono text-xs ${sn.asset_no ? 'text-gray-700' : 'text-gray-300'}`}>
                            {sn.asset_no ?? '-'}
                          </span>
                        )}
                      </td>
                      {/* 상태 */}
                      <td className="px-4 py-2.5">
                        {(() => {
                          const es = effStatus(sn);
                          return (
                            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${STATUS_COLOR[es] ?? 'bg-gray-100 text-gray-500'}`}>
                              {STATUS_LABEL[es] ?? es}
                            </span>
                          );
                        })()}
                      </td>
                      {/* 사용기한 (사용 중인 건만) */}
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {useUntilBadge(sn) ?? <span className="text-gray-300 text-xs">-</span>}
                      </td>
                      {/* 창고 */}
                      <td className="px-4 py-2.5 text-xs text-gray-500">{placeCell(sn, storageName)}</td>
                      {/* 사용자(USED/PENDING) 또는 납품처(SHIPPED) */}
                      <td className="px-4 py-2.5 text-xs">
                        {sn.shipmentDestination ? (
                          <span className="flex items-center gap-1">
                            <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[10px] flex items-center justify-center font-semibold shrink-0">📦</span>
                            <span className="text-blue-700 font-medium">{sn.shipmentDestination}</span>
                          </span>
                        ) : sn.currentUser ? (
                          <span className="flex items-center gap-1">
                            <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] flex items-center justify-center font-semibold shrink-0">
                              {sn.currentUser[0]}
                            </span>
                            <span className="text-gray-700">{sn.currentUser}</span>
                          </span>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                      {/* 태그 */}
                      {tagKeys.map(k => (
                        <td key={k} className="px-4 py-2.5 text-xs text-gray-600">
                          {isEditing ? (
                            <input
                              value={editTags[k] ?? ''}
                              onChange={e => setEditTags(prev => ({ ...prev, [k]: e.target.value }))}
                              placeholder={k}
                              className="border border-gray-300 rounded px-2 py-0.5 text-xs w-full focus:outline-none focus:ring-1 focus:ring-indigo-400"
                            />
                          ) : (
                            <span className={sn.tags?.[k] ? '' : 'text-gray-300'}>
                              {sn.tags?.[k] || '-'}
                            </span>
                          )}
                        </td>
                      ))}
                      {/* 편집 */}
                      <td className="px-4 py-2.5 text-right">
                        {isEditing ? (
                          <div className="flex gap-1 justify-end">
                            <button
                              onClick={saveEdit}
                              disabled={updateMut.isPending}
                              className="text-xs px-2 py-0.5 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
                            >저장</button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-600 hover:bg-gray-300 cursor-pointer"
                            >취소</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startEdit(sn)}
                            className="text-xs text-indigo-500 hover:text-indigo-700 hover:underline cursor-pointer"
                          >수정</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {viewingImage && <AssetImageLightbox image={viewingImage} onClose={() => setViewingImage(null)} />}

      <Modal
        open={!!photoSerial}
        onClose={() => { setPhotoSerial(null); qc.invalidateQueries({ queryKey: ['asset-images', 'latest'] }); }}
        title={`장비 사진 — ${photoSerial?.serial_no ?? ''}`}
        size="lg"
      >
        {photoSerial && (
          <div className="p-5 space-y-3">
            <p className="text-sm text-gray-500">
              입고·납품·사용 등 모든 시점의 사진을 모아 보여줍니다. 여기서 추가한 사진은 &lsquo;직접 등록&rsquo;으로 남습니다.
            </p>
            <AssetImageManager serialNumberId={photoSerial.id} eventType="MANUAL" />
          </div>
        )}
      </Modal>
    </div>
  );
}

/** 정렬 가능한 테이블 헤더 셀 */
function SortTh({
  label, sortKey, active, dir, onSort, className = '',
}: {
  label: string;
  sortKey: string;
  active: string;
  dir: 'asc' | 'desc';
  onSort: (key: string) => void;
  className?: string;
}) {
  const isActive = active === sortKey;
  return (
    <th className={`px-4 py-3 text-left text-xs font-semibold text-gray-600 ${className}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 hover:text-indigo-600 transition-colors cursor-pointer select-none"
        title="정렬"
      >
        <span>{label}</span>
        <span className={isActive ? 'text-indigo-600' : 'text-gray-300'}>
          {isActive ? (dir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  );
}
