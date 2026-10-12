import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { purchaseOrdersApi, type CreatePODto } from '../api/purchaseOrders';
import { purchaseRequestsApi } from '../api/purchaseRequests';
import { Table } from '../components/ui/Table';
import { Badge, statusColor, statusLabel } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input, Textarea, Select } from '../components/ui/Input';
import { useAuthStore } from '../store/auth.store';
import type { PurchaseOrder } from '../types';

interface POItemForm { item_code: string; storage_code: string; quantity: string; unit_price: string; supplier: string; }

export function PurchaseOrdersPage() {
  const qc = useQueryClient();
  const { hasPermission } = useAuthStore();

  const { data = [], isLoading } = useQuery({ queryKey: ['purchase-orders'], queryFn: purchaseOrdersApi.findAll });
  const { data: prs = [] } = useQuery({ queryKey: ['purchase-requests'], queryFn: purchaseRequestsApi.findAll });

  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data: detail } = useQuery({
    queryKey: ['purchase-order', detailId],
    queryFn: () => purchaseOrdersApi.findOne(detailId!),
    enabled: !!detailId,
  });

  const [selectedPR, setSelectedPR] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [note, setNote] = useState('');
  const [poItems, setPoItems] = useState<POItemForm[]>([
    { item_code: '', storage_code: '', quantity: '', unit_price: '', supplier: '' }
  ]);

  const resetForm = () => {
    setSelectedPR(''); setExpectedDate(''); setNote('');
    setPoItems([{ item_code: '', storage_code: '', quantity: '', unit_price: '', supplier: '' }]);
  };

  const handlePRChange = (prId: string) => {
    setSelectedPR(prId);
    const pr = prs.find(r => r.request_id === prId);
    if (pr?.items?.length) {
      setPoItems(pr.items.map(i => ({
        item_code: i.item_code,
        storage_code: i.storage_code ?? '',
        quantity: String(i.quantity),
        unit_price: i.unit_price ? String(i.unit_price) : '',
        supplier: i.supplier ?? '',
      })));
    }
  };

  const createMut  = useMutation({
    mutationFn: (dto: CreatePODto) => purchaseOrdersApi.create(dto),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchase-orders'] }); setCreateOpen(false); resetForm(); },
  });
  const confirmMut = useMutation({ mutationFn: (id: string) => purchaseOrdersApi.confirm(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchase-orders'] }); qc.invalidateQueries({ queryKey: ['purchase-order', detailId] }); } });
  const cancelMut  = useMutation({ mutationFn: (id: string) => purchaseOrdersApi.cancel(id),  onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchase-orders'] }); qc.invalidateQueries({ queryKey: ['purchase-order', detailId] }); } });

  const approvedPRs = prs.filter(r => r.status === 'APPROVED');
  const prOptions = approvedPRs.map(r => ({ value: r.request_id, label: `${r.request_id} - ${r.title}` }));

  const addItem = () => setPoItems(prev => [...prev, { item_code: '', storage_code: '', quantity: '', unit_price: '', supplier: '' }]);
  const removeItem = (idx: number) => setPoItems(prev => prev.filter((_, i) => i !== idx));
  const updateItem = (idx: number, field: keyof POItemForm, val: string) =>
    setPoItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: val } : item));

  const handleCreate = () => {
    if (!selectedPR) return;
    createMut.mutate({
      request_id: selectedPR, expected_date: expectedDate || undefined, note: note || undefined,
      items: poItems
        .filter(i => i.item_code && i.storage_code && i.quantity && i.unit_price)
        .map(i => ({
          item_code: i.item_code, storage_code: i.storage_code,
          quantity: Number(i.quantity), unit_price: Number(i.unit_price),
          supplier: i.supplier || undefined,
        })),
    });
  };

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const filtered = data.filter(r => {
    if (statusFilter && r.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.order_id.toLowerCase().includes(q) || (r.supplier ?? '').toLowerCase().includes(q);
    }
    return true;
  });

  const columns = [
    { key: 'order_id', header: '발주번호', render: (r: PurchaseOrder) => <span className="font-mono text-xs text-gray-500">{r.order_id}</span> },
    { key: 'pr_title', header: '구매요청', render: (r: PurchaseOrder) => <span className="text-xs text-gray-600">{r.purchaseRequest?.title ?? r.request_id}</span> },
    { key: 'supplier', header: '공급업체', render: (r: PurchaseOrder) => <span className="font-medium">{r.supplier}</span> },
    { key: 'total_amount', header: '총금액', render: (r: PurchaseOrder) => `₩ ${Number(r.total_amount).toLocaleString()}` },
    { key: 'orderedBy', header: '생성자', render: (r: PurchaseOrder) => r.orderedBy?.name ?? r.order_man_no },
    { key: 'status', header: '상태', render: (r: PurchaseOrder) => <Badge label={statusLabel(r.status)} color={statusColor(r.status)} /> },
    { key: 'created_at', header: '발주일', render: (r: PurchaseOrder) => new Date(r.created_at).toLocaleDateString('ko-KR') },
  ];

  const id = detailId ?? '';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 justify-between">
        <div className="flex gap-2 items-center">
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="발주번호·공급업체 검색"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 w-56"
          />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
            <option value="">전체 상태</option>
            <option value="PENDING">대기중</option>
            <option value="CONFIRMED">확정됨</option>
            <option value="RECEIVED">입고완료</option>
            <option value="CANCELLED">취소됨</option>
          </select>
          <span className="text-sm text-gray-500">{filtered.length}건</span>
        </div>
        {hasPermission('po:create') && <Button onClick={() => setCreateOpen(true)}>+ 발주 생성</Button>}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <Table columns={columns} data={filtered} rowKey={r => r.order_id} loading={isLoading} onRowClick={r => setDetailId(r.order_id)} />
      </div>

      {/* 생성 모달 */}
      <Modal open={createOpen} onClose={() => { setCreateOpen(false); resetForm(); }} title="발주 생성" size="lg">
        <div className="p-5 space-y-4">
          <Select label="구매요청 선택 *" value={selectedPR} onChange={handlePRChange} options={prOptions} placeholder="APPROVED 구매요청 선택" />
          <Input label="예정 납기일" type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} />
          <Textarea label="메모" value={note} onChange={e => setNote(e.target.value)} />

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-700">품목 목록</p>
              <button onClick={addItem} className="text-xs text-indigo-600 hover:underline cursor-pointer">+ 추가</button>
            </div>
            {poItems.map((item, idx) => (
              <div key={idx} className="grid grid-cols-6 gap-2 p-3 bg-gray-50 rounded-lg mb-2">
                <Input placeholder="품목코드" value={item.item_code} onChange={e => updateItem(idx, 'item_code', e.target.value)} />
                <Input placeholder="창고코드" value={item.storage_code} onChange={e => updateItem(idx, 'storage_code', e.target.value)} />
                <Input placeholder="공급업체" value={item.supplier} onChange={e => updateItem(idx, 'supplier', e.target.value)} />
                <Input type="number" placeholder="수량" value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} />
                <Input type="number" placeholder="단가" value={item.unit_price} onChange={e => updateItem(idx, 'unit_price', e.target.value)} />
                {poItems.length > 1 && <button onClick={() => removeItem(idx)} className="text-red-400 text-lg cursor-pointer">×</button>}
              </div>
            ))}
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" onClick={() => { setCreateOpen(false); resetForm(); }}>취소</Button>
            <Button onClick={handleCreate} loading={createMut.isPending}>저장</Button>
          </div>
        </div>
      </Modal>

      {/* 상세 모달 */}
      <Modal open={!!detailId} onClose={() => setDetailId(null)} title="발주 상세" size="lg">
        {detail && (
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">발주번호:</span> <span className="font-mono ml-1">{detail.order_id}</span></div>
              <div><span className="text-gray-500">상태:</span> <Badge label={statusLabel(detail.status)} color={statusColor(detail.status)} className="ml-1" /></div>
              <div><span className="text-gray-500">구매요청:</span> <span className="font-mono ml-1">{detail.request_id}</span>{detail.purchaseRequest?.title && <span className="ml-2 text-gray-700">{detail.purchaseRequest.title}</span>}</div>
              <div><span className="text-gray-500">공급업체:</span> <strong className="ml-1">{detail.supplier}</strong></div>
              <div><span className="text-gray-500">총금액:</span> <span className="ml-1">₩ {Number(detail.total_amount).toLocaleString()}</span></div>
              <div><span className="text-gray-500">생성자:</span> <span className="ml-1">{detail.orderedBy?.name ?? detail.order_man_no}</span></div>
              {detail.expected_date && <div><span className="text-gray-500">납기예정:</span> <span className="ml-1">{detail.expected_date}</span></div>}
            </div>

            <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
              <thead className="bg-gray-50"><tr>
                <th className="px-3 py-2 text-left text-gray-600">품목</th>
                <th className="px-3 py-2 text-left text-gray-600">창고</th>
                <th className="px-3 py-2 text-left text-gray-600">공급업체</th>
                <th className="px-3 py-2 text-right text-gray-600">수량</th>
                <th className="px-3 py-2 text-right text-gray-600">단가</th>
                <th className="px-3 py-2 text-right text-gray-600">소계</th>
              </tr></thead>
              <tbody>
                {detail.items?.map(item => (
                  <tr key={item.order_item_id} className="border-t border-gray-100">
                    <td className="px-3 py-2">{item.item?.item_name ?? item.item_code}</td>
                    <td className="px-3 py-2 text-gray-500">{item.storage_code}</td>
                    <td className="px-3 py-2 text-gray-500">{(item as any).supplier || '-'}</td>
                    <td className="px-3 py-2 text-right">{item.quantity.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">₩ {Number(item.unit_price).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-medium">₩ {(item.quantity * item.unit_price).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex gap-2 justify-end pt-2">
              {detail.status === 'PENDING' && hasPermission('po:confirm') && (
                <Button onClick={() => confirmMut.mutate(id)} loading={confirmMut.isPending}>확정</Button>
              )}
              {!['RECEIVED', 'CANCELLED'].includes(detail.status) && hasPermission('po:cancel') && (
                <Button variant="secondary" onClick={() => cancelMut.mutate(id)} loading={cancelMut.isPending}>취소</Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
