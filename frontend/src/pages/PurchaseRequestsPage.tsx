import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { purchaseRequestsApi, type CreatePRDto } from '../api/purchaseRequests';
import { itemsApi, storageApi } from '../api/items';
import { Table } from '../components/ui/Table';
import { Badge, statusColor, statusLabel } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input, Select } from '../components/ui/Input';
import { useAuthStore } from '../store/auth.store';
import type { PurchaseRequest } from '../types';

interface PRItemForm {
  item_code: string; storage_code: string; quantity: string;
  unit_price: string; spec: string; note: string;
}

const emptyItem = (): PRItemForm => ({
  item_code: '', storage_code: '', quantity: '',
  unit_price: '', spec: '', note: '',
});

/** 숫자 문자열 → 쉼표 표시 (입력 중에도 적용) */
const toDisplayPrice = (val: string) => {
  const num = val.replace(/,/g, '');
  if (!num) return '';
  const n = Number(num);
  return isNaN(n) ? val : n.toLocaleString('ko-KR');
};
/** 쉼표 제거 → 순수 숫자 문자열 */
const toRawPrice = (val: string) => val.replace(/,/g, '');

export function PurchaseRequestsPage() {
  const qc = useQueryClient();
  const { hasPermission } = useAuthStore();

  const { data = [], isLoading } = useQuery({ queryKey: ['purchase-requests'], queryFn: purchaseRequestsApi.findAll });
  const { data: items = [] }    = useQuery({ queryKey: ['items'],   queryFn: itemsApi.findAll });
  const { data: storages = [] } = useQuery({ queryKey: ['storage'], queryFn: storageApi.findAll });

  const [formOpen, setFormOpen]   = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailId, setDetailId]   = useState<string | null>(null);

  const { data: detail } = useQuery({
    queryKey: ['purchase-request', detailId],
    queryFn: () => purchaseRequestsApi.findOne(detailId!),
    enabled: !!detailId,
  });

  // ── 폼 상태 ──────────────────────────────────────────
  const [title,       setTitle]       = useState('');
  const [background,  setBackground]  = useState('');
  const [note,        setNote]        = useState('');
  const [supplier,    setSupplier]    = useState('');
  const [fundSource,  setFundSource]  = useState('');   // 자체자금 | 정부사업 | 투자금
  const [fundBudget,  setFundBudget]  = useState('');   // 소요예산
  const [fundProject, setFundProject] = useState('');   // 정부사업명
  const [flexLink,    setFlexLink]    = useState('');
  const [prItems,    setPrItems]    = useState<PRItemForm[]>([emptyItem()]);

  const resetForm = () => {
    setTitle(''); setBackground(''); setNote('');
    setSupplier(''); setFundSource(''); setFundBudget(''); setFundProject('');
    setFlexLink('');
    setPrItems([emptyItem()]);
  };

  const openCreate = () => { setEditingId(null); resetForm(); setFormOpen(true); };
  const openEdit = (pr: PurchaseRequest) => {
    setEditingId(pr.request_id);
    setTitle(pr.title);
    setBackground(pr.background ?? '');
    setNote(pr.description ?? pr.note ?? '');
    setSupplier(pr.supplier ?? '');
    setFundSource(pr.fund_source ?? '');
    setFundBudget(pr.fund_budget ?? '');
    setFundProject(pr.fund_project ?? '');
    setFlexLink(pr.flex_link ?? '');
    setPrItems(pr.items?.map(i => ({
      item_code:    i.item_code,
      storage_code: i.storage_code ?? '',
      quantity:     String(i.quantity),
      unit_price:   String(i.unit_price ?? ''),
      spec:         i.spec ?? '',
      note:         i.note ?? '',
    })) ?? [emptyItem()]);
    setDetailId(null);
    setFormOpen(true);
  };

  // ── Mutation ──────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: (dto: CreatePRDto) => purchaseRequestsApi.create(dto),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchase-requests'] }); setFormOpen(false); resetForm(); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: CreatePRDto }) => purchaseRequestsApi.update(id, dto),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchase-requests'] }); setFormOpen(false); resetForm(); setEditingId(null); },
  });
  const submitMut = useMutation({
    mutationFn: (id: string) => purchaseRequestsApi.submit(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['purchase-requests'] });
      qc.invalidateQueries({ queryKey: ['purchase-request', id] });
    },
  });
  const cancelMut = useMutation({
    mutationFn: (id: string) => purchaseRequestsApi.cancel(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['purchase-requests'] });
      qc.invalidateQueries({ queryKey: ['purchase-request', id] });
    },
  });

  const buildDto = (): CreatePRDto => ({
    title,
    note: note || undefined,
    background: background || undefined,
    supplier: supplier || undefined,
    fund_source:  fundSource  || undefined,
    fund_budget:  fundSource === '정부사업' ? (fundBudget  || undefined) : undefined,
    fund_project: fundSource === '정부사업' ? (fundProject || undefined) : undefined,
    flex_link: flexLink || undefined,
    items: prItems
      .filter(i => i.item_code && i.storage_code && i.quantity)
      .map(i => ({
        item_code:    i.item_code,
        storage_code: i.storage_code,
        quantity:     Number(i.quantity),
        unit_price:   i.unit_price ? Number(i.unit_price) : undefined,
        spec:         i.spec || undefined,
        note:         i.note || undefined,
      })),
  });

  const handleSave = () => {
    if (!title.trim()) return;
    if (editingId) updateMut.mutate({ id: editingId, dto: buildDto() });
    else createMut.mutate(buildDto());
  };

  const addItem    = () => setPrItems(prev => [...prev, emptyItem()]);
  const removeItem = (idx: number) => setPrItems(prev => prev.filter((_, i) => i !== idx));
  const updateItem = (idx: number, field: keyof PRItemForm, val: string) =>
    setPrItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: val } : item));

  // ── 필터 ─────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const filtered = data.filter(r => {
    if (statusFilter && r.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.request_id.toLowerCase().includes(q)
        || r.title.toLowerCase().includes(q)
        || (r.requester?.name ?? '').toLowerCase().includes(q);
    }
    return true;
  });

  const itemOptions    = items.filter(i => i.is_active !== 0).map(i => ({ value: i.item_code, label: `${i.item_name} (${i.item_code})` }));
  const storageOptions = storages.map(s => ({ value: s.storage_code, label: `${s.storage_name} (${s.storage_code})` }));

  const columns = [
    { key: 'request_id', header: '번호',  render: (r: PurchaseRequest) => <span className="font-mono text-xs text-gray-500">{r.request_id}</span> },
    { key: 'title',      header: '제목',  render: (r: PurchaseRequest) => <span className="font-medium">{r.title}</span> },
    { key: 'supplier',   header: '거래처', render: (r: PurchaseRequest) => <span className="text-sm text-gray-500">{r.supplier ?? '-'}</span> },
    { key: 'requester',  header: '요청자', render: (r: PurchaseRequest) => r.requester?.name ?? r.request_man_no },
    { key: 'status',     header: '상태',  render: (r: PurchaseRequest) => <Badge label={statusLabel(r.status)} color={statusColor(r.status)} /> },
    { key: 'created_at', header: '요청일', render: (r: PurchaseRequest) => new Date(r.created_at).toLocaleDateString('ko-KR') },
  ];

  // 예상 금액 합계
  const totalAmount = prItems.reduce((sum, i) => {
    const qty = Number(i.quantity) || 0;
    const price = Number(i.unit_price) || 0;
    return sum + qty * price;
  }, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 justify-between">
        <div className="flex gap-2 items-center">
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="번호·제목·요청자 검색"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 w-56"
          />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
            <option value="">전체 상태</option>
            <option value="DRAFT">임시저장</option>
            <option value="SUBMITTED">제출됨</option>
            <option value="CANCELLED">취소됨</option>
            <option value="ORDERED">발주됨</option>
            <option value="RECEIVED">입고완료</option>
          </select>
          <span className="text-sm text-gray-500">{filtered.length}건</span>
        </div>
        {hasPermission('pr:create') && <Button onClick={openCreate}>+ 구매요청 작성</Button>}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <Table columns={columns} data={filtered} rowKey={r => r.request_id} loading={isLoading} onRowClick={r => setDetailId(r.request_id)} />
      </div>

      {/* ── 등록/수정 모달 (Flex 품의서 레이아웃) ── */}
      <Modal open={formOpen} onClose={() => { setFormOpen(false); resetForm(); setEditingId(null); }} title={editingId ? '구매요청 수정' : '구매요청 작성'} size="2xl">
        <div className="p-5 space-y-5">
          {/* 제목 */}
          <Input label="제목 *" value={title} onChange={e => setTitle(e.target.value)} placeholder="구매 요청 제목" />

          {/* 품의 개요 */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
              <p className="text-sm font-semibold text-gray-700">품의 개요</p>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-[80px_1fr] items-center gap-3 text-sm">
                <span className="text-gray-500 font-medium">추진배경</span>
                <input
                  value={background} onChange={e => setBackground(e.target.value)}
                  placeholder="예) [사우디] Aramco PoC"
                  className="border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 w-full"
                />
              </div>
              <div className="grid grid-cols-[80px_1fr] items-center gap-3 text-sm">
                <span className="text-gray-500 font-medium">목&nbsp;&nbsp;&nbsp;&nbsp;적</span>
                <input
                  value={note} onChange={e => setNote(e.target.value)}
                  placeholder="예) 카메라 설치를 위한 장비 구매"
                  className="border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 w-full"
                />
              </div>
              <div className="grid grid-cols-[80px_1fr] items-center gap-3 text-sm">
                <span className="text-gray-500 font-medium">거&nbsp;래&nbsp;처</span>
                <input
                  value={supplier} onChange={e => setSupplier(e.target.value)}
                  placeholder="예) 쿠팡, 네이버스토어 등"
                  className="border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 w-full"
                />
              </div>
              <div className="grid grid-cols-[80px_1fr] items-start gap-3 text-sm">
                <span className="text-gray-500 font-medium pt-1.5">지출재원</span>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    {['자체자금', '정부사업', '투자금'].map(opt => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => { setFundSource(opt); if (opt !== '정부사업') { setFundBudget(''); setFundProject(''); } }}
                        className={`px-4 py-1.5 rounded-full text-sm border transition-colors cursor-pointer ${
                          fundSource === opt
                            ? 'bg-indigo-600 border-indigo-600 text-white font-medium'
                            : 'border-gray-300 text-gray-600 hover:border-indigo-400 hover:text-indigo-600'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                  {fundSource === '정부사업' && (
                    <div className="space-y-2 pl-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 w-16 shrink-0">소요예산</span>
                        <input
                          value={fundBudget} onChange={e => setFundBudget(e.target.value)}
                          placeholder="(관)사업비 (항)연구활동비 (목)전문가활용"
                          className="flex-1 border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 w-16 shrink-0">사업명</span>
                        <input
                          value={fundProject} onChange={e => setFundProject(e.target.value)}
                          placeholder="예) 한국연구재단 기본연구사업"
                          className="flex-1 border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-[80px_1fr] items-center gap-3 text-sm">
                <span className="text-gray-500 font-medium">Flex 링크</span>
                <input
                  value={flexLink} onChange={e => setFlexLink(e.target.value)}
                  placeholder="https://example.com/approval/..."
                  className="border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 w-full"
                />
              </div>
            </div>
          </div>

          {/* 예상 비용 */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">예상 비용</p>
              <button onClick={addItem} className="text-xs text-indigo-600 hover:underline cursor-pointer">+ 품목 추가</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <colgroup>
                  <col style={{ width: '220px' }} />
                  <col style={{ width: '120px' }} />
                  <col style={{ width: '90px' }} />
                  <col style={{ width: '60px' }} />
                  <col style={{ width: '100px' }} />
                  <col style={{ width: '120px' }} />
                  <col style={{ width: '120px' }} />
                  <col style={{ width: '32px' }} />
                </colgroup>
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs text-gray-500 font-medium">품명</th>
                    <th className="px-3 py-2 text-left text-xs text-gray-500 font-medium">규격</th>
                    <th className="px-3 py-2 text-right text-xs text-gray-500 font-medium">단가</th>
                    <th className="px-3 py-2 text-right text-xs text-gray-500 font-medium">수량</th>
                    <th className="px-3 py-2 text-right text-xs text-gray-500 font-medium">금액</th>
                    <th className="px-3 py-2 text-left text-xs text-gray-500 font-medium">입고창고</th>
                    <th className="px-3 py-2 text-left text-xs text-gray-500 font-medium">비고</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {prItems.map((item, idx) => {
                    const amount = (Number(item.quantity) || 0) * (Number(item.unit_price) || 0);
                    return (
                      <tr key={idx} className="border-t border-gray-100">
                        <td className="px-2 py-1.5">
                          <Select value={item.item_code} onChange={v => updateItem(idx, 'item_code', v)} options={itemOptions} placeholder="품목 선택" />
                        </td>
                        <td className="px-2 py-1.5">
                          <input value={item.spec} onChange={e => updateItem(idx, 'spec', e.target.value)} placeholder="RJ-45" className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={toDisplayPrice(item.unit_price)}
                            onChange={e => updateItem(idx, 'unit_price', toRawPrice(e.target.value))}
                            placeholder="0"
                            className="w-full border border-gray-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-indigo-300"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="number" value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} placeholder="1" className="w-full border border-gray-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                        </td>
                        <td className="px-2 py-1.5 text-right text-sm font-medium text-gray-700">
                          {amount > 0 ? `₩${amount.toLocaleString()}` : '-'}
                        </td>
                        <td className="px-2 py-1.5">
                          <Select value={item.storage_code} onChange={v => updateItem(idx, 'storage_code', v)} options={storageOptions} placeholder="창고 선택" />
                        </td>
                        <td className="px-2 py-1.5">
                          <input value={item.note} onChange={e => updateItem(idx, 'note', e.target.value)} placeholder="링크 등" className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                        </td>
                        <td className="px-1 py-1.5 text-center">
                          {prItems.length > 1 && (
                            <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600 text-base cursor-pointer">×</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                  <tr>
                    <td colSpan={4} className="px-3 py-2 text-right text-sm font-semibold text-gray-600">합계</td>
                    <td className="px-3 py-2 text-right text-sm font-bold text-gray-800">
                      {totalAmount > 0 ? `₩${totalAmount.toLocaleString()}` : '-'}
                    </td>
                    <td colSpan={3} className="px-3 py-2 text-xs text-gray-400">VAT 포함</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <Button variant="secondary" onClick={() => { setFormOpen(false); resetForm(); setEditingId(null); }}>취소</Button>
            <Button onClick={handleSave} loading={createMut.isPending || updateMut.isPending}>저장</Button>
          </div>
        </div>
      </Modal>

      {/* ── 상세 모달 ── */}
      <Modal open={!!detailId} onClose={() => setDetailId(null)} title="구매요청 상세" size="2xl">
        {detail && (
          <div className="p-5 space-y-4">
            {/* 헤더 메타 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-gray-400">{detail.request_id}</span>
                <Badge label={statusLabel(detail.status)} color={statusColor(detail.status)} />
              </div>
              <span className="text-xs text-gray-400">{new Date(detail.created_at).toLocaleString('ko-KR')}</span>
            </div>
            <h3 className="text-lg font-bold text-gray-800">{detail.title}</h3>
            <p className="text-sm text-gray-500">요청자: <strong>{detail.requester?.name}</strong></p>

            {/* 품의 개요 */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                <p className="text-sm font-semibold text-gray-700">품의 개요</p>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {[
                    ['추진배경', detail.background],
                    ['목    적', detail.description ?? detail.note],
                    ['거 래 처', detail.supplier],
                    ['지출재원', detail.fund_source
                    ? detail.fund_source === '정부사업' && (detail.fund_project || detail.fund_budget)
                      ? `정부사업${detail.fund_project ? ` — ${detail.fund_project}` : ''}${detail.fund_budget ? ` / ${detail.fund_budget}` : ''}`
                      : detail.fund_source
                    : null],
                  ].map(([label, val]) => val ? (
                    <tr key={label as string} className="border-t border-gray-100 first:border-0">
                      <td className="px-4 py-2 text-gray-500 font-medium w-24 bg-gray-50 whitespace-nowrap">{label}</td>
                      <td className="px-4 py-2">{val}</td>
                    </tr>
                  ) : null)}
                  {detail.flex_link && (
                    <tr className="border-t border-gray-100">
                      <td className="px-4 py-2 text-gray-500 font-medium bg-gray-50 whitespace-nowrap">Flex 결의서</td>
                      <td className="px-4 py-2">
                        <a href={detail.flex_link} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline break-all">{detail.flex_link}</a>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* 예상 비용 */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                <p className="text-sm font-semibold text-gray-700">예상 비용</p>
              </div>
              <table className="w-full text-sm table-fixed">
                <colgroup>
                  <col style={{ width: '22%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '16%' }} />
                </colgroup>
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs text-gray-500 font-medium">품명</th>
                    <th className="px-3 py-2 text-left text-xs text-gray-500 font-medium">규격</th>
                    <th className="px-3 py-2 text-right text-xs text-gray-500 font-medium">단가</th>
                    <th className="px-3 py-2 text-right text-xs text-gray-500 font-medium">수량</th>
                    <th className="px-3 py-2 text-right text-xs text-gray-500 font-medium">금액</th>
                    <th className="px-3 py-2 text-left text-xs text-gray-500 font-medium">창고</th>
                    <th className="px-3 py-2 text-left text-xs text-gray-500 font-medium">비고</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items?.map(item => {
                    const amount = (item.quantity || 0) * (Number(item.unit_price) || 0);
                    return (
                      <tr key={item.request_item_id} className="border-t border-gray-100">
                        <td className="px-3 py-2 font-medium">{item.item?.item_name ?? item.item_code}</td>
                        <td className="px-3 py-2 text-gray-500">{item.spec || '-'}</td>
                        <td className="px-3 py-2 text-right">{item.unit_price ? `₩${Number(item.unit_price).toLocaleString()}` : '-'}</td>
                        <td className="px-3 py-2 text-right">{item.quantity.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right font-medium">{amount > 0 ? `₩${amount.toLocaleString()}` : '-'}</td>
                        <td className="px-3 py-2 text-gray-500 text-xs">{item.storage_code || '-'}</td>
                        <td className="px-3 py-2 text-gray-500 text-xs truncate">{item.note || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
                {(detail.items?.length ?? 0) > 0 && (() => {
                  const total = detail.items!.reduce((s, i) => s + (i.quantity || 0) * (Number(i.unit_price) || 0), 0);
                  return total > 0 ? (
                    <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                      <tr>
                        <td colSpan={4} className="px-3 py-2 text-right text-sm font-semibold text-gray-600">합계</td>
                        <td className="px-3 py-2 text-right text-sm font-bold">₩{total.toLocaleString()}</td>
                        <td colSpan={2} className="px-3 py-2 text-xs text-gray-400">VAT 포함</td>
                      </tr>
                    </tfoot>
                  ) : null;
                })()}
              </table>
            </div>

            <div className="flex gap-2 justify-end pt-1">
              {detail.status === 'DRAFT' && hasPermission('pr:update') && (
                <Button variant="secondary" onClick={() => openEdit(detail)}>수정</Button>
              )}
              {detail.status === 'DRAFT' && (
                <Button onClick={() => submitMut.mutate(detail.request_id)} loading={submitMut.isPending}>제출</Button>
              )}
              {['DRAFT', 'SUBMITTED'].includes(detail.status) && hasPermission('pr:cancel') && (
                <Button variant="secondary" onClick={() => cancelMut.mutate(detail.request_id)} loading={cancelMut.isPending}>취소</Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
