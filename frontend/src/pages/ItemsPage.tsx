import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { itemsApi, type CreateItemDto, type ImportResult } from '../api/items';
import { Table } from '../components/ui/Table';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input, Textarea, Select } from '../components/ui/Input';
import { CATEGORY_LABEL, type Item, type ItemCategory } from '../types';
import { useAuthStore } from '../store/auth.store';

const CATEGORY_OPTIONS = (Object.keys(CATEGORY_LABEL) as ItemCategory[]).map(k => ({
  value: k,
  label: `${CATEGORY_LABEL[k]} (${k})`,
}));

const UNIT_OPTIONS = ['EA', 'BOX', 'SET', 'KG', 'L'].map(u => ({ value: u, label: u }));

// 자주 쓰는 스펙 키 힌트
const SPEC_KEY_HINTS = ['CPU', 'RAM', 'Storage', 'GPU', 'OS', '버전', '해상도', '크기', '색상', '재질', '전압', '용량'];

const EMPTY_FORM: CreateItemDto = {
  category: 'HW', item_name: '', description: '', unit: 'EA', unit_price: 0, use_serial: 0, specs: undefined, visibility: 'PUBLIC',
};

export function ItemsPage() {
  const qc = useQueryClient();
  const { hasPermission } = useAuthStore();
  const { data = [], isLoading } = useQuery({ queryKey: ['items'], queryFn: itemsApi.findAll });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [form, setForm] = useState<CreateItemDto>(EMPTY_FORM);
  const [specKeys, setSpecKeys] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterActive, setFilterActive]     = useState('');

  // CSV import
  const fileRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const createMut = useMutation({
    mutationFn: (dto: CreateItemDto) => itemsApi.create(dto),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['items'] }); closeModal(); },
  });
  const updateMut = useMutation({
    mutationFn: ({ code, dto }: { code: string; dto: Partial<CreateItemDto> }) => itemsApi.update(code, dto),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['items'] }); closeModal(); },
  });
  const toggleMut = useMutation({
    mutationFn: (code: string) => itemsApi.toggleActive(code),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['items'] }),
  });
  const importMut = useMutation({
    mutationFn: (file: File) => itemsApi.importFile(file),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['items'] });
      setImportResult(result);
      setImportOpen(true);
    },
  });

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setSpecKeys([]); setOpen(true); };
  const openEdit = (item: Item) => {
    setEditing(item);
    setForm({
      category: item.category, item_name: item.item_name,
      description: item.description ?? '', unit: item.unit,
      unit_price: item.unit_price, use_serial: item.use_serial,
      visibility: item.visibility ?? 'PUBLIC',
    });
    setSpecKeys(item.specs ?? []);
    setOpen(true);
  };
  const closeModal = () => { setOpen(false); setEditing(null); };

  const addSpecKey = () => setSpecKeys(prev => [...prev, '']);
  const removeSpecKey = (i: number) => setSpecKeys(prev => prev.filter((_, idx) => idx !== i));
  const updateSpecKey = (i: number, val: string) => setSpecKeys(prev => prev.map((k, idx) => idx === i ? val : k));

  const handleSave = () => {
    const specs = specKeys.filter(k => k.trim()).length > 0
      ? specKeys.filter(k => k.trim())
      : undefined;
    if (editing) {
      const { category: _c, ...dto } = form;
      updateMut.mutate({ code: editing.item_code, dto: { ...dto, specs, visibility: form.visibility } });
    } else {
      createMut.mutate({ ...form, specs });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) importMut.mutate(file);
    e.target.value = '';
  };

  // 필터링
  const filtered = data.filter(item => {
    if (filterCategory && item.category !== filterCategory) return false;
    if (filterActive === '1' && item.is_active !== 1) return false;
    if (filterActive === '0' && item.is_active !== 0) return false;
    if (search) {
      const q = search.toLowerCase();
      return item.item_code.toLowerCase().includes(q) || item.item_name.toLowerCase().includes(q);
    }
    return true;
  });

  const columns = [
    { key: 'item_code', header: '품목코드',
      render: (r: Item) => <span className="font-mono text-xs font-semibold text-indigo-600">{r.item_code}</span> },
    { key: 'category',  header: '품종',
      render: (r: Item) => (
        <span className="text-xs font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-700">
          {CATEGORY_LABEL[r.category] ?? r.category}
        </span>
      )},
    { key: 'item_name', header: '품목명', render: (r: Item) => <span className="font-medium">{r.item_name}</span> },
    { key: 'specs', header: '태그 항목',
      render: (r: Item) => {
        const keys = r.specs ?? [];
        if (keys.length === 0) return <span className="text-gray-300 text-xs">-</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {keys.map(k => (
              <span key={k} className="text-xs px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100">
                {k}
              </span>
            ))}
          </div>
        );
      }
    },
    { key: 'unit',      header: '단위' },
    { key: 'unit_price',header: '단가', render: (r: Item) => `₩ ${Number(r.unit_price).toLocaleString()}` },
    { key: 'use_serial', header: 'S/N',
      render: (r: Item) => r.use_serial === 1
        ? <span className="text-xs font-medium px-2 py-0.5 rounded bg-blue-100 text-blue-700">S/N 관리</span>
        : <span className="text-xs text-gray-400">-</span>
    },
    { key: 'visibility', header: '공개범위',
      render: (r: Item) => (r.visibility ?? 'PUBLIC') === 'PRIVATE'
        ? <span className="text-xs font-medium px-2 py-0.5 rounded bg-orange-100 text-orange-700">개별(Master)</span>
        : <span className="text-xs font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-600">공동</span>
    },
    { key: 'is_active', header: '활성',
      render: (r: Item) => (
        <button
          onClick={e => { e.stopPropagation(); toggleMut.mutate(r.item_code); }}
          className={`text-xs font-medium px-2 py-0.5 rounded cursor-pointer transition-colors ${
            r.is_active === 1 ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-600 hover:bg-red-200'
          }`}
        >
          {r.is_active === 1 ? '활성' : '비활성'}
        </button>
      )},
  ];

  return (
    <div className="space-y-4">
      {/* 필터 + 버튼 */}
      <div className="flex items-center gap-3 justify-between">
        <div className="flex gap-2">
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="코드·품목명 검색"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 w-48"
          />
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
          >
            <option value="">전체 품종</option>
            {CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select
            value={filterActive}
            onChange={e => setFilterActive(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
          >
            <option value="">전체 상태</option>
            <option value="1">활성</option>
            <option value="0">비활성</option>
          </select>
          <span className="self-center text-sm text-gray-500">{filtered.length}건</span>
        </div>
        <div className="flex gap-2">
          {hasPermission('item:create') && (
            <>
              <a
                href="/templates/items_template.csv"
                download="items_template.csv"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <span>⬇</span> 예시 파일
              </a>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xlsm" onChange={handleFileChange} className="hidden" />
              <Button variant="secondary" onClick={() => fileRef.current?.click()} loading={importMut.isPending}>
                CSV/Excel 가져오기
              </Button>
            </>
          )}
          {hasPermission('item:create') && <Button onClick={openCreate}>+ 품목 등록</Button>}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <Table columns={columns} data={filtered} rowKey={r => r.item_code} loading={isLoading} onRowClick={openEdit} />
      </div>

      {/* 등록/수정 모달 */}
      <Modal
        open={open}
        onClose={closeModal}
        title={editing ? `품목 수정 — ${editing.item_code}` : '품목 등록'}
        size="md"
      >
        <div className="p-5 space-y-4">
          {editing ? (
            <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm space-y-1">
              <div><span className="text-gray-500">품목코드:</span> <strong className="font-mono text-indigo-600 ml-1">{editing.item_code}</strong></div>
              <div><span className="text-gray-500">품종:</span> <span className="ml-1">{CATEGORY_LABEL[editing.category]}</span></div>
              <p className="text-xs text-gray-400 mt-1">품목코드와 품종은 변경할 수 없습니다.</p>
            </div>
          ) : (
            <div className="space-y-1">
              <Select
                label="품종 *"
                value={form.category ?? 'HW'}
                onChange={v => setForm(f => ({ ...f, category: v }))}
                options={CATEGORY_OPTIONS}
              />
              <p className="text-xs text-gray-400">품목코드는 저장 시 자동 채번됩니다.</p>
            </div>
          )}

          <Input
            label="품목명 *"
            value={form.item_name}
            onChange={e => setForm(f => ({ ...f, item_name: e.target.value }))}
            placeholder="예) 사무용 의자"
          />
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="단위"
              value={form.unit ?? 'EA'}
              onChange={v => setForm(f => ({ ...f, unit: v }))}
              options={UNIT_OPTIONS}
            />
            <Input
              label="단가"
              type="number"
              value={form.unit_price ?? ''}
              onChange={e => setForm(f => ({ ...f, unit_price: Number(e.target.value) }))}
              placeholder="0"
            />
          </div>
          <Textarea
            label="설명"
            value={form.description ?? ''}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="품목 설명 (선택)"
          />

          <div className="space-y-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.use_serial === 1}
                onChange={e => {
                  setForm(f => ({ ...f, use_serial: e.target.checked ? 1 : 0 }));
                  if (!e.target.checked) setSpecKeys([]);
                }}
                className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm font-medium text-gray-700">S/N (시리얼 번호) 관리</span>
            </label>

            {form.use_serial === 1 && (
              <div className="ml-6 p-3 bg-indigo-50 rounded-lg border border-indigo-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-indigo-700">스펙 태그 항목 정의</span>
                  <button type="button" onClick={addSpecKey} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                    + 항목 추가
                  </button>
                </div>
                <p className="text-xs text-indigo-500 mb-2">입고 시 각 S/N마다 입력할 항목을 정의하세요.</p>
                {specKeys.length === 0 && (
                  <p className="text-xs text-gray-400">예) CPU, RAM, Storage, GPU, 버전...</p>
                )}
                <div className="flex flex-wrap gap-2">
                  {specKeys.map((key, i) => (
                    <div key={i} className="flex items-center gap-1 bg-white border border-indigo-200 rounded-lg px-2 py-1">
                      <input
                        value={key}
                        onChange={e => updateSpecKey(i, e.target.value)}
                        placeholder="항목명"
                        list="spec-key-hints"
                        className="text-xs outline-none w-20 bg-transparent"
                      />
                      <button type="button" onClick={() => removeSpecKey(i)} className="text-gray-300 hover:text-red-400 text-sm leading-none">×</button>
                    </div>
                  ))}
                </div>
                <datalist id="spec-key-hints">
                  {SPEC_KEY_HINTS.map(h => <option key={h} value={h} />)}
                </datalist>
              </div>
            )}
          </div>

          {/* 공개범위 */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">공개범위</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, visibility: 'PUBLIC' }))}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  (form.visibility ?? 'PUBLIC') === 'PUBLIC'
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400'
                }`}
              >
                공동 (전체 공개)
              </button>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, visibility: 'PRIVATE' }))}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  form.visibility === 'PRIVATE'
                    ? 'bg-orange-500 text-white border-orange-500'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-orange-400'
                }`}
              >
                개별 (Master만)
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              <strong>공동</strong>: 모든 사용자 재고현황에 표시 · <strong>개별</strong>: Master 권한자에게만 표시
            </p>
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" onClick={closeModal}>취소</Button>
            <Button
              onClick={handleSave}
              loading={createMut.isPending || updateMut.isPending}
              disabled={!form.item_name.trim()}
            >
              저장
            </Button>
          </div>
        </div>
      </Modal>

      {/* Import 결과 모달 */}
      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="가져오기 완료" size="sm">
        <div className="p-5 space-y-3">
          {importResult && (
            <>
              <div className="flex gap-4 text-sm">
                <div className="flex-1 bg-green-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-green-600">{importResult.created}</p>
                  <p className="text-gray-500 text-xs mt-1">등록 완료</p>
                </div>
                <div className="flex-1 bg-yellow-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-yellow-600">{importResult.skipped}</p>
                  <p className="text-gray-500 text-xs mt-1">건너뜀</p>
                </div>
              </div>
              {importResult.errors.length > 0 && (
                <div className="bg-red-50 rounded-lg p-3 max-h-40 overflow-y-auto">
                  <p className="text-xs font-semibold text-red-700 mb-1">오류 내역</p>
                  {importResult.errors.map((e, i) => (
                    <p key={i} className="text-xs text-red-600">{e}</p>
                  ))}
                </div>
              )}
            </>
          )}
          <div className="flex justify-end">
            <Button onClick={() => setImportOpen(false)}>확인</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
