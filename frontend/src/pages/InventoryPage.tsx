import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { inventoryApi, storageApi } from '../api/items';
import { Table } from '../components/ui/Table';
import { Select } from '../components/ui/Input';
import type { InventoryRow } from '../types';


export function InventoryPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [selectedStorage, setSelectedStorage] = useState('');

  const { data = [], isLoading } = useQuery({ queryKey: ['inventory'], queryFn: inventoryApi.findAll });
  const { data: storages = [] } = useQuery({ queryKey: ['storage'], queryFn: storageApi.findAll });

  const storageOptions = [
    { value: '', label: '전체 창고 (품목별 합산)' },
    ...storages.map(s => ({ value: s.storage_code, label: `${s.storage_name} (${s.storage_code})` })),
  ];

  const displayed: InventoryRow[] = selectedStorage
    ? data.filter(r => r.storage_code === selectedStorage)
    : Object.values(
        data.reduce<Record<string, InventoryRow>>((acc, r) => {
          if (acc[r.item_code]) {
            acc[r.item_code] = { ...acc[r.item_code], quantity: acc[r.item_code].quantity + r.quantity };
          } else {
            acc[r.item_code] = { ...r };
          }
          return acc;
        }, {}),
      );

  const filtered = displayed.filter(r =>
    r.item?.item_name?.toLowerCase().includes(search.toLowerCase()) ||
    r.item_code.toLowerCase().includes(search.toLowerCase()) ||
    r.storage?.storage_name?.toLowerCase().includes(search.toLowerCase()) ||
    r.storage_code.toLowerCase().includes(search.toLowerCase()),
  );

  const totalQty = filtered.reduce((s, r) => s + r.quantity, 0);

  const handleRowClick = (r: InventoryRow) => {
    if (r.item?.use_serial === 1) navigate(`/inventory/${r.item_code}`);
  };

  const columns = [
    ...(selectedStorage
      ? [{ key: 'storage', header: '창고', render: (r: InventoryRow) => r.storage?.storage_name ?? r.storage_code }]
      : []),
    { key: 'item_code', header: '품목코드', render: (r: InventoryRow) =>
      <span className="font-mono text-xs text-gray-500">{r.item_code}</span>
    },
    { key: 'item_name', header: '품목명', render: (r: InventoryRow) => (
      <span className="flex items-center gap-1.5">
        {r.item?.item_name ?? '-'}
        {r.item?.use_serial === 1 && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-600 font-medium">S/N</span>
        )}
      </span>
    )},
    { key: 'category', header: '분류', render: (r: InventoryRow) => r.item?.category ?? '-' },
    { key: 'unit',     header: '단위',  render: (r: InventoryRow) => r.item?.unit ?? 'EA' },
    { key: 'quantity', header: '재고수량', render: (r: InventoryRow) =>
      <span className={`font-semibold ${r.quantity === 0 ? 'text-red-500' : r.quantity < 10 ? 'text-orange-500' : 'text-gray-800'}`}>
        {r.quantity.toLocaleString()}
      </span>
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-64">
          <Select
            value={selectedStorage}
            onChange={setSelectedStorage}
            options={storageOptions}
            placeholder="전체 창고 (품목별 합산)"
          />
        </div>
        <input
          type="text"
          placeholder="품목명, 품목코드 검색..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 w-64"
        />
        <p className="text-sm text-gray-500 ml-auto">
          {filtered.length}개 품목 · 총 <strong>{totalQty.toLocaleString()}</strong>개
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <Table
          columns={columns}
          data={filtered}
          rowKey={r => selectedStorage ? `${r.storage_code}-${r.item_code}` : r.item_code}
          loading={isLoading}
          onRowClick={handleRowClick}
        />
      </div>
      <p className="text-xs text-gray-400">S/N 관리 품목은 클릭하면 시리얼 번호 상세 페이지로 이동합니다.</p>
    </div>
  );
}
