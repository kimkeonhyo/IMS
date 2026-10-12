import { Fragment, useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SerialPhotoPicker, AssetImageGallery, uploadSerialPhotos, type SerialPhotoMap } from '../components/AssetImages';
import { storeApi, type CreateStoreDto } from '../api/purchaseOrders';
import { itemsApi, storageApi } from '../api/items';
import { employeesApi } from '../api/employees';
import { serialNumbersApi } from '../api/serialNumbers';
import { Table } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input, Textarea, Select } from '../components/ui/Input';
import { useAuthStore } from '../store/auth.store';
import type { Store, StoreItem, SerialNumber } from '../types';

interface SerialEntry {
  serial_no: string;
  asset_no: string;
  tags: Record<string, string>;
}

interface StoreItemForm {
  item_code: string;
  storage_code: string;
  quantity: string;
  serials: SerialEntry[];
}

const SN_STATUS_LABEL: Record<string, string> = { STOCK: '재고', SHIPPED: '납품됨', USED: '사용됨', BROKEN: '고장', REPAIR: '수리중', CANCELLED: '취소됨' };
const SN_STATUS_COLOR: Record<string, string> = {
  STOCK: 'bg-green-100 text-green-700', SHIPPED: 'bg-blue-100 text-blue-700',
  USED: 'bg-gray-100 text-gray-500', BROKEN: 'bg-red-100 text-red-700', REPAIR: 'bg-amber-100 text-amber-700',    CANCELLED: 'bg-red-100 text-red-400',
};

/** 입고 품목별 S/N 서브테이블 */
function StoreItemSnList({ item }: { item: StoreItem }) {
  const specKeys: string[] = (item.item as any)?.specs ?? [];
  const { data: serials = [], isLoading } = useQuery({
    queryKey: ['sn-by-store-item', item.store_item_id],
    queryFn: () => serialNumbersApi.findByStoreItem(item.store_item_id),
    enabled: (item.item as any)?.use_serial === 1,
  });

  if ((item.item as any)?.use_serial !== 1) return null;

  return (
    <tr className="bg-blue-50">
      <td colSpan={4} className="px-3 pb-3">
        {isLoading ? (
          <p className="text-xs text-gray-400 py-1">S/N 불러오는 중...</p>
        ) : serials.length === 0 ? (
          <p className="text-xs text-gray-400 py-1">S/N 정보 없음</p>
        ) : (
          <div className="overflow-x-auto mt-1">
            <table className="text-xs border-collapse table-fixed">
              <colgroup>
                <col style={{ width: '180px' }} />   {/* S/N */}
                <col style={{ width: '140px' }} />   {/* 장비번호 */}
                <col style={{ width: '80px' }} />    {/* 상태 */}
                {specKeys.map(k => <col key={k} style={{ width: '180px' }} />)}
              </colgroup>
              <thead>
                <tr className="text-gray-500 border-b border-blue-200">
                  <th className="text-left pb-1 pt-1.5 font-semibold">S/N</th>
                  <th className="text-left pb-1 pt-1.5 font-semibold whitespace-nowrap">장비번호</th>
                  <th className="text-left pb-1 pt-1.5 font-semibold">상태</th>
                  {specKeys.map(k => <th key={k} className="text-left pb-1 pt-1.5 font-semibold">{k}</th>)}
                </tr>
              </thead>
              <tbody>
                {serials.map((sn: SerialNumber) => (
                  <tr key={sn.id} className="border-t border-blue-100">
                    <td className="py-1.5 font-mono text-gray-700 truncate pr-3">{sn.serial_no}</td>
                    <td className="py-1.5 font-mono text-gray-700 truncate pr-3">{sn.asset_no ?? '-'}</td>
                    <td className="py-1.5 pr-3">
                      <span className={`px-1.5 py-0.5 rounded whitespace-nowrap ${SN_STATUS_COLOR[sn.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {SN_STATUS_LABEL[sn.status] ?? sn.status}
                      </span>
                    </td>
                    {specKeys.map(k => <td key={k} className="py-1.5 pr-3 text-gray-600 truncate">{sn.tags?.[k] ?? '-'}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </td>
    </tr>
  );
}

/* ─── SerialInputBlock — 컴포넌트 외부 정의 (포커스 유지) ──────────────────
   반드시 StorePage 밖에 있어야 함. 내부에 두면 상태 변경 시마다 새 컴포넌트
   타입이 생성되어 React가 unmount/remount → 입력 중 커서 소실 발생.
── */
function SerialInputBlock({
  serials, specKeys, itemIdx,
  onSerialChange, onAssetChange, onTagChange,
}: {
  serials: SerialEntry[];
  specKeys: string[];
  itemIdx: number;
  onSerialChange: (itemIdx: number, snIdx: number, val: string) => void;
  onAssetChange: (itemIdx: number, snIdx: number, val: string) => void;
  onTagChange: (itemIdx: number, snIdx: number, key: string, val: string) => void;
}) {
  return (
    <div className="pl-1 space-y-2">
      <p className="text-xs text-blue-600 font-medium">S/N(필수)·장비번호(선택) 및 스펙 태그 입력</p>
      {serials.map((entry, snIdx) => (
        <div key={snIdx} className="bg-white border border-blue-100 rounded-lg p-2 space-y-1.5">
          <div className="grid grid-cols-2 gap-1.5">
            <Input
              placeholder={`S/N #${snIdx + 1}`}
              value={entry.serial_no}
              onChange={e => onSerialChange(itemIdx, snIdx, e.target.value)}
            />
            <Input
              placeholder={`장비번호 #${snIdx + 1} (선택)`}
              value={entry.asset_no}
              onChange={e => onAssetChange(itemIdx, snIdx, e.target.value)}
            />
          </div>
          {specKeys.length > 0 && (
            <div className="grid grid-cols-2 gap-1">
              {specKeys.map(key => (
                <div key={key} className="flex items-center gap-1">
                  <span className="text-xs text-gray-500 w-14 shrink-0">{key}</span>
                  <input
                    value={entry.tags[key] ?? ''}
                    onChange={e => onTagChange(itemIdx, snIdx, key, e.target.value)}
                    placeholder={key}
                    className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ─── 플로우차트 헬퍼 컴포넌트 ──────────────────────────────────────────── */
const STEP_COLORS = {
  blue:   { box: 'bg-blue-500 text-white',   num: 'bg-white text-blue-600' },
  orange: { box: 'bg-orange-500 text-white',  num: 'bg-white text-orange-600' },
  green:  { box: 'bg-green-500 text-white',   num: 'bg-white text-green-600' },
};

function StepBox({ num, color, title, sub }: { num: number; color: keyof typeof STEP_COLORS; title: string; sub: string }) {
  const c = STEP_COLORS[color];
  return (
    <div className={`rounded-lg px-3 py-2.5 flex items-start gap-2.5 ${c.box}`}>
      <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5 ${c.num}`}>
        {num}
      </span>
      <div>
        <p className="text-xs font-semibold leading-tight">{title}</p>
        <p className="text-[10px] opacity-80 mt-0.5 leading-tight">{sub}</p>
      </div>
    </div>
  );
}

function Arrow() {
  return (
    <div className="flex justify-center">
      <svg width="16" height="20" viewBox="0 0 16 20" className="text-gray-400">
        <line x1="8" y1="0" x2="8" y2="14" stroke="currentColor" strokeWidth="1.5" />
        <polygon points="4,12 12,12 8,18" fill="currentColor" />
      </svg>
    </div>
  );
}

export function StorePage() {
  const qc = useQueryClient();
  const { hasPermission } = useAuthStore();
  const { data = [], isLoading } = useQuery({ queryKey: ['store'], queryFn: storeApi.findAll });
  const { data: allItems = [] }  = useQuery({ queryKey: ['items'],     queryFn: itemsApi.findAll });
  const { data: storages = [] }  = useQuery({ queryKey: ['storage'],   queryFn: storageApi.findAll });
  const { data: employees = [] } = useQuery({ queryKey: ['employees-active'], queryFn: employeesApi.findActiveList });

  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId]     = useState<string | null>(null);
  const [flowOpen, setFlowOpen]     = useState(false);  // 프로세스 플로우 접기/펼치기 (기본: 접힘)
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelSerialIds, setCancelSerialIds] = useState<number[]>([]);

  const { data: detail } = useQuery({
    queryKey: ['store-detail', detailId],
    queryFn: () => storeApi.findOne(detailId!),
    enabled: !!detailId,
  });

  // 입고취소 모달용 — 해당 입고건의 '재고(STOCK)' 상태 S/N만 (취소 가능 대상)
  const { data: cancelSerials = [] } = useQuery({
    queryKey: ['store-cancel-serials', detailId],
    queryFn: async () => {
      const snItems = (detail?.receiptItems ?? []).filter(i => (i.item as any)?.use_serial === 1);
      const lists = await Promise.all(snItems.map(i => serialNumbersApi.findByStoreItem(i.store_item_id)));
      return lists.flat().filter((sn: SerialNumber) => sn.status === 'STOCK');
    },
    enabled: cancelOpen && !!detail,
  });

  const cancelInitRef = useRef(false);
  const openCancel = () => { cancelInitRef.current = false; setCancelSerialIds([]); setCancelOpen(true); };
  // 모달 오픈 시 STOCK S/N 전체 선택으로 1회 초기화
  useEffect(() => {
    if (cancelOpen && !cancelInitRef.current && cancelSerials.length > 0) {
      setCancelSerialIds(cancelSerials.map((s: SerialNumber) => s.id));
      cancelInitRef.current = true;
    }
  }, [cancelOpen, cancelSerials]);

  /* ─── 공통 옵션 ─────────────────────────────────── */
  const itemOptions    = allItems.filter(i => i.is_active !== 0).map(i => ({ value: i.item_code, label: `${i.item_name} (${i.item_code})` }));
  const storageOptions = storages.map(s => ({ value: s.storage_code, label: `${s.storage_name} (${s.storage_code})` }));

  const getItem = (item_code: string) => allItems.find(i => i.item_code === item_code);

  const makeEmptySerials = (item_code: string, count: number): SerialEntry[] => {
    const specKeys = getItem(item_code)?.specs ?? [];
    return Array.from({ length: count }, () => ({
      serial_no: '',
      asset_no: '',
      tags: Object.fromEntries(specKeys.map(k => [k, ''])),
    }));
  };

  /* ─── 입고 처리 폼 ──────────────────────────────── */
  const [title, setTitle]                   = useState('');
  const [requesterManNo, setRequesterManNo] = useState('');
  const [note, setNote]                     = useState('');
  const [photos, setPhotos]                 = useState<SerialPhotoMap>({});   // S/N별 최초 실물 사진 (키: 입력한 S/N 문자열)
  const [storeItems, setStoreItems] = useState<StoreItemForm[]>([
    { item_code: '', storage_code: '', quantity: '', serials: [] },
  ]);

  const resetForm = () => {
    setTitle(''); setRequesterManNo(''); setNote('');
    setStoreItems([{ item_code: '', storage_code: '', quantity: '', serials: [] }]);
    setPhotos({});
  };

  const employeeOptions = [
    { value: '', label: '선택 안함' },
    ...employees.map(e => ({ value: e.man_no, label: `${e.name} (${e.man_team})` })),
  ];

  const addItem    = () => setStoreItems(prev => [...prev, { item_code: '', storage_code: '', quantity: '', serials: [] }]);
  const removeItem = (idx: number) => setStoreItems(prev => prev.filter((_, i) => i !== idx));

  const updateItem = (idx: number, field: keyof Omit<StoreItemForm, 'serials'>, val: string) => {
    setStoreItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const updated = { ...item, [field]: val };
      if (field === 'quantity') {
        const useSerial = getItem(item.item_code)?.use_serial === 1;
        if (useSerial) {
          const n = Number(val) || 0;
          updated.serials = n > item.serials.length
            ? [...item.serials, ...makeEmptySerials(item.item_code, n - item.serials.length)]
            : item.serials.slice(0, n);
        }
      }
      if (field === 'item_code') updated.serials = [];
      return updated;
    }));
  };

  const updateSerialNo = (itemIdx: number, snIdx: number, val: string) =>
    setStoreItems(prev => prev.map((item, i) => i !== itemIdx ? item : {
      ...item,
      serials: item.serials.map((s, si) => si === snIdx ? { ...s, serial_no: val } : s),
    }));

  const updateSerialAsset = (itemIdx: number, snIdx: number, val: string) =>
    setStoreItems(prev => prev.map((item, i) => i !== itemIdx ? item : {
      ...item,
      serials: item.serials.map((s, si) => si === snIdx ? { ...s, asset_no: val } : s),
    }));

  const updateSerialTag = (itemIdx: number, snIdx: number, key: string, val: string) =>
    setStoreItems(prev => prev.map((item, i) => i !== itemIdx ? item : {
      ...item,
      serials: item.serials.map((s, si) => si === snIdx ? { ...s, tags: { ...s.tags, [key]: val } } : s),
    }));


  /* ─── Mutations ─────────────────────────────────── */
  const receiveMut = useMutation({
    mutationFn: (dto: CreateStoreDto) => storeApi.receive(dto),
    onSuccess: async (store) => {
      // 저장 후에야 S/N id가 정해진다 — 입력한 S/N 문자열로 매칭한다
      const created: { id: number; serial_no: string }[] = (store as any)?.created_serials ?? [];
      const idBySerialNo = new Map(created.map(c => [c.serial_no, c.id]));
      await uploadSerialPhotos(photos, 'STORE', store?.store_id, key => idBySerialNo.get(key));
      qc.invalidateQueries({ queryKey: ['store'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      setCreateOpen(false); resetForm();
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message ?? '입고 처리 중 오류가 발생했습니다.';
      alert(msg);
    },
  });

  const cancelMut = useMutation({
    mutationFn: ({ id, serialIds }: { id: string; serialIds?: number[] }) => storeApi.cancel(id, serialIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['store'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['store-detail', detailId] });
      qc.invalidateQueries({ queryKey: ['sn-by-store-item'] });
      qc.invalidateQueries({ queryKey: ['store-cancel-serials'] });
      setCancelOpen(false);
    },
  });

  const handleReceive = () => {
    if (!title.trim()) { alert('입고 제목을 입력해주세요.'); return; }
    const items = storeItems.filter(i => i.item_code && i.storage_code && i.quantity);
    if (!items.length) return;
    receiveMut.mutate({
      title: title.trim(),
      requester_man_no: requesterManNo || undefined,
      note,
      items: items.map(i => ({
        item_code: i.item_code,
        storage_code: i.storage_code,
        quantity: Number(i.quantity),
        serials: i.serials.length
          ? i.serials.filter(s => s.serial_no).map(s => ({
              serial_no: s.serial_no,
              asset_no: s.asset_no?.trim() || undefined,
              tags: Object.keys(s.tags).length ? s.tags : undefined,
            }))
          : undefined,
      })),
    });
  };


  /* ─── 테이블 ─────────────────────────────────────── */
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get('search') ?? '');
  const filtered = data.filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    const inBasic = r.store_id.toLowerCase().includes(q)
      || (r.request_id ?? '').toLowerCase().includes(q)
      || (r.purchaseRequest?.title ?? '').toLowerCase().includes(q)
      || (r.order_id ?? '').toLowerCase().includes(q)
      || (r.note ?? '').toLowerCase().includes(q);
    if (inBasic) return true;
    // 품목명/코드 검색
    return (r.receiptItems ?? []).some(i =>
      i.item_code.toLowerCase().includes(q) ||
      (i.item?.item_name ?? '').toLowerCase().includes(q),
    );
  });

  const columns = [
    { key: 'store_id', header: '입고번호', render: (r: Store) => <span className="font-mono text-xs text-gray-500">{r.store_id}</span> },
    { key: 'title',    header: '제목',     render: (r: Store) => <span className="font-medium text-gray-800">{(r as any).title ?? '-'}</span> },
    { key: 'items',        header: '입고품목',  render: (r: Store) => (
        <div className="flex flex-wrap gap-1">
          {(r.receiptItems ?? []).slice(0, 2).map(i => (
            <span key={i.store_item_id} className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
              {i.item?.item_name ?? i.item_code}
              {(i.item as any)?.use_serial === 1 && <span className="ml-0.5 text-blue-500">S/N</span>}
            </span>
          ))}
          {(r.receiptItems?.length ?? 0) > 2 && (
            <span className="text-xs text-gray-400">+{(r.receiptItems!.length) - 2}개</span>
          )}
        </div>
      )
    },
    { key: 'note',         header: '사유/메모', render: (r: Store) => r.note
        ? <span className="text-xs text-gray-500 truncate max-w-[160px] block" title={r.note}>{r.note}</span>
        : <span className="text-gray-300 text-xs">-</span>
    },
    { key: 'receiver',     header: '입고자',    render: (r: Store) => r.receiver?.name ?? r.order_man_no },
    { key: 'status',       header: '상태',      render: (r: Store) => <Badge label={r.status === 'CANCELLED' ? '취소됨' : '입고완료'} color={r.status === 'CANCELLED' ? 'red' : 'green'} /> },
    { key: 'received_at',  header: '입고일시',  render: (r: Store) => new Date(r.received_at).toLocaleString('ko-KR') },
  ];

  return (
    <div className="space-y-4">

      {/* 입고관리 프로세스 플로우차트 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* 타이틀 — 클릭 시 접기/펼치기 */}
        <button
          onClick={() => setFlowOpen(o => !o)}
          className="w-full flex items-center justify-between px-6 py-3.5 hover:bg-gray-50 transition-colors cursor-pointer"
        >
          <h3 className="text-sm font-semibold text-gray-700">입고관리 프로세스 플로우</h3>
          <span className="text-xs text-gray-400">{flowOpen ? '▲ 접기' : '▼ 펼치기'}</span>
        </button>

        {flowOpen && (
          <>
            {/* Swimlane 헤더 */}
            <div className="grid grid-cols-3 text-center text-xs font-semibold border-y border-gray-200">
              <div className="py-2.5 bg-blue-50 text-blue-700 border-r border-gray-200">구매요청자 (User)</div>
              <div className="py-2.5 bg-orange-50 text-orange-700 border-r border-gray-200">경영지원팀</div>
              <div className="py-2.5 bg-green-50 text-green-700">IMS 시스템</div>
            </div>

            {/* Swimlane 바디 */}
            <div className="grid grid-cols-3 divide-x divide-gray-100">

              {/* 구매요청자 컬럼 */}
              <div className="p-5 space-y-3 bg-blue-50/30">
                <StepBox num={1} color="blue" title="Flex 품의서 결재" sub="품목·목적·금액 포함 품의서 작성 후 결재" />
                <Arrow />
                <StepBox num={2} color="blue" title="Flex 지출결의 결재" sub="지출결의서 작성 후 결재 완료" />
              </div>

              {/* 경영지원팀 컬럼 */}
              <div className="p-5 space-y-3 bg-orange-50/30">
                <div className="h-[56px]" />
                <div className="h-[20px]" />
                <div className="h-[56px]" />
                <Arrow />
                <StepBox num={3} color="orange" title="발주 진행" sub="거래처 발주 및 납품 일정 조율" />
                <Arrow />
                <StepBox num={4} color="orange" title="실물 입고 확인" sub="물품 수령 및 검수 완료" />
              </div>

              {/* IMS 컬럼 */}
              <div className="p-5 space-y-3 bg-green-50/30">
                <div className="h-[56px]" />
                <div className="h-[20px]" />
                <div className="h-[56px]" />
                <div className="h-[20px]" />
                <div className="h-[56px]" />
                <Arrow />
                <StepBox num={5} color="green" title="IMS 입고처리" sub="입고 제목·품목·S/N 입력 후 등록" />
                <div className="mt-2 rounded-lg border border-green-300 bg-green-50 px-3 py-2.5 text-xs text-green-700">
                  <p className="font-semibold mb-0.5">✅ 상태: RECEIVED</p>
                  <p className="opacity-75">재고 자동 증가 (S/N 등록 완료)</p>
                </div>
              </div>
            </div>

            {/* 범례 */}
            <div className="flex gap-5 px-6 py-3 border-t border-gray-100 bg-gray-50">
              {[
                { color: 'bg-blue-500', label: '구매요청자 작업' },
                { color: 'bg-orange-500', label: '경영지원팀 작업' },
                { color: 'bg-green-500', label: 'IMS 시스템' },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span className={`w-3 h-3 rounded ${l.color}`} />
                  {l.label}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-3 justify-between">
        <div className="flex gap-2 items-center">
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="입고번호·품목명 검색"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 w-64"
          />
          <span className="text-sm text-gray-500">{filtered.length}건</span>
        </div>
        <div className="flex gap-2">
          {hasPermission('store:receive') && (
            <Button onClick={() => setCreateOpen(true)}>+ 입고 처리</Button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <Table columns={columns} data={filtered} rowKey={r => r.store_id} loading={isLoading} onRowClick={r => setDetailId(r.store_id)} />
      </div>

      {/* 입고 처리 모달 */}
      <Modal open={createOpen} onClose={() => { setCreateOpen(false); resetForm(); }} title="입고 처리" size="xl">
        <div className="p-5 space-y-4">
          <Input label="제목 *" value={title} onChange={e => setTitle(e.target.value)} placeholder="예) 노트북 구매 입고" />
          <div className="grid grid-cols-2 gap-3">
            <Select label="입고요청자" value={requesterManNo} onChange={setRequesterManNo} options={employeeOptions} placeholder="선택 안함" />
            <Textarea label="메모" value={note} onChange={e => setNote(e.target.value)} rows={1} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-700">입고 품목</p>
              <button onClick={addItem} className="text-xs text-indigo-600 hover:underline cursor-pointer">+ 추가</button>
            </div>
            {storeItems.map((item, idx) => {
              const useSerial = getItem(item.item_code)?.use_serial === 1;
              return (
                <div key={idx} className="p-3 bg-gray-50 rounded-lg mb-2 space-y-2">
                  <div className="grid grid-cols-4 gap-2 items-end">
                    <Select
                      placeholder="품목 선택"
                      value={item.item_code}
                      onChange={v => updateItem(idx, 'item_code', v)}
                      options={itemOptions}
                    />
                    <Select
                      placeholder="창고 선택"
                      value={item.storage_code}
                      onChange={v => updateItem(idx, 'storage_code', v)}
                      options={storageOptions}
                    />
                    <Input type="number" placeholder="수량" value={item.quantity}
                      onChange={e => updateItem(idx, 'quantity', e.target.value)} />
                    {storeItems.length > 1
                      ? <button onClick={() => removeItem(idx)} className="text-red-400 text-lg cursor-pointer pb-2">×</button>
                      : <div />}
                  </div>
                  {useSerial && item.serials.length > 0 && (
                    <SerialInputBlock
                      serials={item.serials}
                      specKeys={getItem(item.item_code)?.specs ?? []}
                      itemIdx={idx}
                      onSerialChange={updateSerialNo}
                      onAssetChange={updateSerialAsset}
                      onTagChange={updateSerialTag}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <SerialPhotoPicker
            targets={storeItems.flatMap(it => it.serials
              .filter(sn => sn.serial_no.trim())
              .map(sn => ({
                key: sn.serial_no.trim(),
                label: sn.serial_no.trim(),
                sub: [getItem(it.item_code)?.item_name, sn.asset_no?.trim()].filter(Boolean).join(' · ') || undefined,
              })))}
            value={photos}
            onChange={setPhotos}
            hint="장비마다 따로 등록합니다. S/N을 먼저 입력하면 목록에 나타납니다."
            emptyText="S/N을 입력하면 장비별로 사진을 등록할 수 있습니다."
          />

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" onClick={() => { setCreateOpen(false); resetForm(); }}>취소</Button>
            <Button onClick={handleReceive} loading={receiveMut.isPending}>입고 처리</Button>
          </div>
        </div>
      </Modal>

      {/* 상세 모달 */}
      <Modal open={!!detailId} onClose={() => setDetailId(null)} title="입고 상세" size="2xl">
        {detail && (
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="col-span-2"><span className="text-gray-500">제목:</span> <strong className="ml-1">{(detail as any).title ?? '-'}</strong></div>
              <div><span className="text-gray-500">입고번호:</span> <span className="font-mono ml-1">{detail.store_id}</span></div>
              <div><span className="text-gray-500">상태:</span> <Badge label={(detail as any).status === 'CANCELLED' ? '취소됨' : '입고완료'} color={(detail as any).status === 'CANCELLED' ? 'red' : 'green'} className="ml-1" /></div>
              <div><span className="text-gray-500">입고자:</span> <span className="ml-1">{detail.receiver?.name ?? detail.order_man_no}</span></div>
              <div><span className="text-gray-500">입고요청자:</span> <span className="ml-1">{(detail as any).requester?.name ?? (detail as any).requester_man_no ?? '-'}</span></div>
              <div><span className="text-gray-500">입고일시:</span> <span className="ml-1">{new Date(detail.received_at).toLocaleString('ko-KR')}</span></div>
              {detail.note && <div className="col-span-2"><span className="text-gray-500">메모:</span> <span className="ml-1">{detail.note}</span></div>}
            </div>
            <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
              <thead className="bg-gray-50"><tr>
                <th className="px-3 py-2 text-left text-gray-600">품목</th>
                <th className="px-3 py-2 text-left text-gray-600">창고</th>
                <th className="px-3 py-2 text-right text-gray-600">수량</th>
                <th className="px-3 py-2 text-left text-gray-600 w-16"></th>
              </tr></thead>
              <tbody>
                {detail.receiptItems?.map(item => (
                  <Fragment key={item.store_item_id}>
                    <tr className="border-t border-gray-100">
                      <td className="px-3 py-2">
                        {item.item?.item_name ?? item.item_code}
                        {(item.item as any)?.use_serial === 1 && (
                          <span className="ml-1 text-xs text-blue-500">S/N</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-500">
                        {item.storage?.storage_name ?? item.storage_code}
                      </td>
                      <td className="px-3 py-2 text-right font-medium">{item.quantity.toLocaleString()}</td>
                      <td />
                    </tr>
                    <StoreItemSnList item={item} />
                  </Fragment>
                ))}
              </tbody>
            </table>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">입고 사진</p>
              <AssetImageGallery eventType="STORE" eventNo={detail.store_id} canDelete={hasPermission('store:cancel')} />
            </div>

            {hasPermission('store:cancel') && (detail as any).status !== 'CANCELLED' && (
              <div className="flex justify-end pt-2">
                <Button variant="secondary" onClick={openCancel} loading={cancelMut.isPending}>
                  입고 취소 (재고 복원)
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* 입고 취소 모달 — S/N 선택(부분 취소) */}
      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="입고 취소" size="md">
        {detail && (
          <div className="p-5 space-y-4">
            <p className="text-sm text-gray-600">
              취소할 S/N을 선택하세요. 선택한 재고가 취소되고 수량이 차감됩니다.
              <span className="text-gray-400"> (이미 납품/사용된 S/N은 취소 불가)</span>
            </p>

            {cancelSerials.length > 0 ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-600">취소할 S/N — {cancelSerialIds.length}/{cancelSerials.length}개</span>
                  <button
                    type="button"
                    onClick={() => setCancelSerialIds(
                      cancelSerialIds.length === cancelSerials.length ? [] : cancelSerials.map((s: SerialNumber) => s.id)
                    )}
                    className="text-xs text-indigo-600 hover:underline"
                  >{cancelSerialIds.length === cancelSerials.length ? '전체 해제' : '전체 선택'}</button>
                </div>
                <div className="border border-gray-200 rounded-lg max-h-56 overflow-y-auto divide-y divide-gray-50">
                  {cancelSerials.map((sn: SerialNumber) => {
                    const checked = cancelSerialIds.includes(sn.id);
                    return (
                      <label key={sn.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setCancelSerialIds(prev => checked ? prev.filter(id => id !== sn.id) : [...prev, sn.id])}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-400"
                        />
                        <span className="font-mono text-xs text-gray-700">{sn.serial_no}</span>
                        <span className="text-xs text-gray-400 ml-auto">{(sn as any).tags?.['모델명'] ?? ''}</span>
                      </label>
                    );
                  })}
                </div>
                {cancelSerialIds.length < cancelSerials.length && cancelSerialIds.length > 0 && (
                  <p className="text-xs text-amber-600">선택한 {cancelSerialIds.length}개만 부분 취소됩니다. 나머지는 입고 상태로 유지됩니다.</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400 bg-gray-50 rounded-lg px-3 py-2.5">
                취소 가능한 재고 S/N이 없습니다. (S/N 미관리 품목은 전체 취소됩니다)
              </p>
            )}

            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setCancelOpen(false)}>닫기</Button>
              <Button
                variant="danger"
                onClick={() => cancelMut.mutate({
                  id: detail.store_id,
                  serialIds: cancelSerials.length > 0 ? cancelSerialIds : undefined,
                })}
                loading={cancelMut.isPending}
                disabled={cancelSerials.length > 0 && cancelSerialIds.length === 0}
              >입고 취소</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
