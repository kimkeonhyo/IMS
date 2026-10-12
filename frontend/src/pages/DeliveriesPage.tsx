import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { deliveriesApi, type CreateDeliveryDto } from '../api/deliveries';
import { itemsApi, storageApi } from '../api/items';
import { Table } from '../components/ui/Table';
import { Badge, statusColor, statusLabel } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input, Textarea, Select } from '../components/ui/Input';
import { useAuthStore } from '../store/auth.store';
import type { Delivery } from '../types';

interface ItemForm { item_code: string; storage_code: string; quantity: string; }

export function DeliveriesPage() {
  const qc = useQueryClient();
  const { isAdmin } = useAuthStore();
  const { data = [], isLoading } = useQuery({ queryKey: ['deliveries'], queryFn: deliveriesApi.findAll });
  const { data: items = [] }    = useQuery({ queryKey: ['items'],   queryFn: itemsApi.findAll });
  const { data: storages = [] } = useQuery({ queryKey: ['storage'], queryFn: storageApi.findAll });

  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data: detail } = useQuery({
    queryKey: ['delivery', detailId],
    queryFn: () => deliveriesApi.findOne(detailId!),
    enabled: !!detailId,
  });

  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [dItems, setDItems] = useState<ItemForm[]>([{ item_code: '', storage_code: '', quantity: '' }]);

  const resetForm = () => { setTitle(''); setNote(''); setDItems([{ item_code: '', storage_code: '', quantity: '' }]); };

  const createMut  = useMutation({ mutationFn: (dto: CreateDeliveryDto) => deliveriesApi.create(dto),    onSuccess: () => { qc.invalidateQueries({ queryKey: ['deliveries'] }); setCreateOpen(false); resetForm(); } });
  const approveMut = useMutation({ mutationFn: (id: string) => deliveriesApi.approve(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['deliveries'] }); qc.invalidateQueries({ queryKey: ['delivery', detailId] }); qc.invalidateQueries({ queryKey: ['inventory'] }); } });
  const cancelMut  = useMutation({ mutationFn: (id: string) => deliveriesApi.cancel(id),  onSuccess: () => { qc.invalidateQueries({ queryKey: ['deliveries'] }); qc.invalidateQueries({ queryKey: ['delivery', detailId] }); } });

  const updateItem = (idx: number, field: keyof ItemForm, val: string) =>
    setDItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: val } : item));

  const itemOptions = items.map(i => ({ value: i.item_code, label: `${i.item_name} (${i.item_code})` }));
  const storageOptions = storages.map(s => ({ value: s.storage_code, label: `${s.storage_name} (${s.storage_code})` }));

  const handleCreate = () => {
    if (!title.trim()) return;
    createMut.mutate({
      title, note,
      items: dItems.filter(i => i.item_code && i.storage_code && i.quantity)
        .map(i => ({ item_code: i.item_code, storage_code: i.storage_code, quantity: Number(i.quantity) })),
    });
  };

  const id = detailId ?? '';

  const columns = [
    { key: 'delivery_id', header: '출고번호', render: (r: Delivery) => <span className="font-mono text-xs text-gray-500">{r.delivery_id}</span> },
    { key: 'title',       header: '제목',     render: (r: Delivery) => <span className="font-medium">{r.title}</span> },
    { key: 'requester',   header: '요청자',   render: (r: Delivery) => r.requester?.name ?? r.request_man_no },
    { key: 'status',      header: '상태',     render: (r: Delivery) => <Badge label={statusLabel(r.status)} color={statusColor(r.status)} /> },
    { key: 'created_at',  header: '요청일',   render: (r: Delivery) => new Date(r.created_at).toLocaleDateString('ko-KR') },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreateOpen(true)}>+ 출고 요청</Button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <Table columns={columns} data={data} rowKey={r => r.delivery_id} loading={isLoading} onRowClick={r => setDetailId(r.delivery_id)} />
      </div>

      {/* 생성 모달 */}
      <Modal open={createOpen} onClose={() => { setCreateOpen(false); resetForm(); }} title="출고 요청" size="lg">
        <div className="p-5 space-y-4">
          <Input label="제목 *" value={title} onChange={e => setTitle(e.target.value)} placeholder="출고 요청 제목" />
          <Textarea label="메모" value={note} onChange={e => setNote(e.target.value)} />

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-700">출고 품목</p>
              <button onClick={() => setDItems(prev => [...prev, { item_code: '', storage_code: '', quantity: '' }])} className="text-xs text-indigo-600 hover:underline cursor-pointer">+ 추가</button>
            </div>
            {dItems.map((item, idx) => (
              <div key={idx} className="grid grid-cols-4 gap-2 p-3 bg-gray-50 rounded-lg mb-2">
                <Select placeholder="품목" value={item.item_code} onChange={v => updateItem(idx, 'item_code', v)} options={itemOptions} />
                <Select placeholder="창고" value={item.storage_code} onChange={v => updateItem(idx, 'storage_code', v)} options={storageOptions} />
                <Input type="number" placeholder="수량" value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} />
                {dItems.length > 1 && <button onClick={() => setDItems(prev => prev.filter((_, i) => i !== idx))} className="text-red-400 text-lg cursor-pointer">×</button>}
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
      <Modal open={!!detailId} onClose={() => setDetailId(null)} title="출고 상세" size="lg">
        {detail && (
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">번호:</span> <span className="font-mono ml-1">{detail.delivery_id}</span></div>
              <div><span className="text-gray-500">상태:</span> <Badge label={statusLabel(detail.status)} color={statusColor(detail.status)} className="ml-1" /></div>
              <div><span className="text-gray-500">제목:</span> <strong className="ml-1">{detail.title}</strong></div>
              <div><span className="text-gray-500">요청자:</span> <span className="ml-1">{detail.requester?.name}</span></div>
            </div>

            <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
              <thead className="bg-gray-50"><tr>
                <th className="px-3 py-2 text-left text-gray-600">품목</th>
                <th className="px-3 py-2 text-left text-gray-600">창고</th>
                <th className="px-3 py-2 text-right text-gray-600">수량</th>
              </tr></thead>
              <tbody>
                {detail.items?.map(item => (
                  <tr key={item.delivery_item_id} className="border-t border-gray-100">
                    <td className="px-3 py-2">{item.item?.item_name ?? item.item_code}</td>
                    <td className="px-3 py-2 text-gray-500">{item.storage_code}</td>
                    <td className="px-3 py-2 text-right font-medium">{item.quantity.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex gap-2 justify-end pt-2">
              {detail.status === 'PENDING' && isAdmin() && (
                <Button onClick={() => approveMut.mutate(id)} loading={approveMut.isPending}>승인 (재고차감)</Button>
              )}
              {detail.status === 'PENDING' && (
                <Button variant="secondary" onClick={() => cancelMut.mutate(id)} loading={cancelMut.isPending}>취소</Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
