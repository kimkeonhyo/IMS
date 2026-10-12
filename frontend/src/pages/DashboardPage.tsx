import { useMemo, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import GridLayout, { WidthProvider, type Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { storeApi } from '../api/purchaseOrders';
import { stockUsagesApi } from '../api/stockUsages';
import { storageApi } from '../api/items';
import { stockMovementsApi } from '../api/stockMovements';
import { shipmentsApi } from '../api/shipments';
import { Badge } from '../components/ui/Badge';
import { useAuthStore } from '../store/auth.store';

const ReactGridLayout = WidthProvider(GridLayout);

// 기본 레이아웃 (12열, rowHeight 40px)
const DEFAULT_LAYOUT: Layout[] = [
  { i: 'myStore',     x: 0, y: 0,  w: 6,  h: 6,  minW: 3, minH: 4 },
  { i: 'myUsage',     x: 6, y: 0,  w: 6,  h: 6,  minW: 3, minH: 4 },
  { i: 'recentStore', x: 0, y: 6,  w: 6,  h: 6,  minW: 3, minH: 4 },
  { i: 'recentShip',  x: 6, y: 6,  w: 6,  h: 6,  minW: 3, minH: 4 },
  { i: 'chart',       x: 0, y: 12, w: 12, h: 12, minW: 4, minH: 8 },
];

const LAYOUT_VERSION = 'v2';

export function DashboardPage() {
  const { user } = useAuthStore();
  const layoutKey = `ims-dashboard-layout-${LAYOUT_VERSION}-${user?.man_no ?? 'anon'}`;

  // 저장된 레이아웃 로드
  const [layout, setLayout] = useState<Layout[]>(() => {
    try {
      const saved = localStorage.getItem(layoutKey);
      if (saved) {
        const parsed = JSON.parse(saved) as Layout[];
        // 저장된 항목이 기본 항목 집합과 일치할 때만 사용 (구조 변경 대비)
        const defKeys = new Set(DEFAULT_LAYOUT.map(l => l.i));
        if (parsed.length === DEFAULT_LAYOUT.length && parsed.every(l => defKeys.has(l.i))) {
          return parsed;
        }
      }
    } catch { /* ignore */ }
    return DEFAULT_LAYOUT;
  });

  const onLayoutChange = useCallback((next: Layout[]) => {
    setLayout(next);
    try { localStorage.setItem(layoutKey, JSON.stringify(next)); } catch { /* ignore */ }
  }, [layoutKey]);

  const resetLayout = useCallback(() => {
    setLayout(DEFAULT_LAYOUT);
    try { localStorage.removeItem(layoutKey); } catch { /* ignore */ }
  }, [layoutKey]);

  const { data: stores    = [] } = useQuery({ queryKey: ['store'],            queryFn: storeApi.findAll });
  const { data: usages    = [] } = useQuery({ queryKey: ['stock-usages'],     queryFn: stockUsagesApi.findAll });
  const { data: storages  = [] } = useQuery({ queryKey: ['storage'],          queryFn: storageApi.findAll });
  const { data: movements = [] } = useQuery({ queryKey: ['stock-movements'],  queryFn: stockMovementsApi.findAll });
  const { data: shipments = [] } = useQuery({ queryKey: ['shipments'],        queryFn: shipmentsApi.findAll });

  // 본인 데이터 필터링
  const myStores = [...stores]
    .filter(s => s.order_man_no === user?.man_no)
    .slice(0, 5);

  const myUsages = [...usages]
    .filter(u => (u as any).use_man_no === user?.man_no || (u as any).request_man_no === user?.man_no)
    .slice(0, 5);

  // 최근 입고 내역 (전체, 5개)
  const recentStores = [...stores]
    .filter(s => (s as any).status !== 'CANCELLED')
    .slice(0, 5);

  // 최근 납품 내역 (전체, 5개)
  const recentShipments = [...shipments]
    .filter(s => s.status !== 'CANCELLED')
    .slice(0, 5);

  // ── 차트: 창고별 최근 15일 일자별 입고/사용 (막대차트) ──────────
  const [chartStorage, setChartStorage] = useState<string>('');

  const warehouseChartData = useMemo(() => {
    const target = chartStorage; // '' = all
    const days = 15;
    const today = new Date();
    const dateMap: Record<string, { date: string; 입고: number; 사용: number }> = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = `${d.getMonth() + 1}/${d.getDate()}`;
      dateMap[key] = { date: key, 입고: 0, 사용: 0 };
    }
    const toKey = (dateStr: string) => {
      const d = new Date(dateStr);
      return `${d.getMonth() + 1}/${d.getDate()}`;
    };
    for (const s of stores) {
      if ((s as any).status === 'CANCELLED' || !s.received_at) continue;
      const key = toKey(s.received_at);
      if (!dateMap[key]) continue;
      for (const item of s.receiptItems ?? []) {
        if (!target || item.storage_code === target) dateMap[key]['입고'] += item.quantity;
      }
    }
    for (const u of usages) {
      if (u.is_cancelled || (u as any).status === 'CANCELLED') continue;
      if (target && (u as any).storage_code !== target) continue;
      const key = toKey(u.created_at);
      if (dateMap[key]) dateMap[key]['사용'] += u.quantity;
    }
    for (const m of movements) {
      if (m.status !== 'MOVED') continue;
      const key = toKey((m as any).moved_at ?? m.created_at);
      if (!dateMap[key]) continue;
      if (!target || m.from_storage_code === target) dateMap[key]['사용'] += m.quantity;
      if (!target || m.to_storage_code   === target) dateMap[key]['입고'] += m.quantity;
    }
    return Object.values(dateMap);
  }, [chartStorage, stores, usages, movements]);

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">안녕하세요, {user?.name}님 👋</h2>
          <p className="text-sm text-gray-500 mt-1">{user?.man_team} · {user?.man_roll}</p>
        </div>
        <button
          onClick={resetLayout}
          className="text-xs text-gray-500 hover:text-indigo-600 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors"
          title="대시보드 배치를 기본값으로 되돌립니다"
        >
          ↺ 레이아웃 초기화
        </button>
      </div>

      <ReactGridLayout
        className="layout"
        layout={layout}
        cols={12}
        rowHeight={40}
        margin={[16, 16]}
        containerPadding={[0, 0]}
        isResizable
        isDraggable
        draggableHandle=".drag-handle"
        onLayoutChange={onLayoutChange}
        compactType="vertical"
      >
        {/* ① 최근 내 입고처리 */}
        <div key="myStore">
          <Card title="최근 내 입고처리" link="/store">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-2.5 text-left text-xs text-gray-500 font-medium">입고번호</th>
                  <th className="px-4 py-2.5 text-left text-xs text-gray-500 font-medium">구분</th>
                  <th className="px-4 py-2.5 text-right text-xs text-gray-500 font-medium">품목수</th>
                  <th className="px-4 py-2.5 text-left text-xs text-gray-500 font-medium">상태</th>
                  <th className="px-4 py-2.5 text-left text-xs text-gray-500 font-medium">일시</th>
                </tr>
              </thead>
              <tbody>
                {myStores.length === 0 ? (
                  <Empty colSpan={5} />
                ) : myStores.map(s => (
                  <tr key={s.store_id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-400 font-mono text-xs">{s.store_id}</td>
                    <td className="px-4 py-2.5 text-gray-700 text-xs truncate max-w-[140px]">
                      {s.request_id ? s.request_id : <span className="text-amber-500">직접등록</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium text-gray-700">
                      {(s.receiptItems?.length ?? 0)}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge
                        label={(s as any).status === 'CANCELLED' ? '취소됨' : '입고완료'}
                        color={(s as any).status === 'CANCELLED' ? 'red' : 'green'}
                      />
                    </td>
                    <td className="px-4 py-2.5 text-gray-400 text-xs">
                      {s.received_at ? new Date(s.received_at).toLocaleDateString('ko-KR') : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>

        {/* ③ 최근 내 재고사용 */}
        <div key="myUsage">
          <Card title="최근 내 재고사용" link="/stock-usages">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-2.5 text-left text-xs text-gray-500 font-medium">사용번호</th>
                  <th className="px-4 py-2.5 text-left text-xs text-gray-500 font-medium">품목</th>
                  <th className="px-4 py-2.5 text-right text-xs text-gray-500 font-medium">수량</th>
                  <th className="px-4 py-2.5 text-left text-xs text-gray-500 font-medium">상태</th>
                  <th className="px-4 py-2.5 text-left text-xs text-gray-500 font-medium">일시</th>
                </tr>
              </thead>
              <tbody>
                {myUsages.length === 0 ? (
                  <Empty colSpan={5} />
                ) : myUsages.map((u: any) => (
                  <tr key={u.usage_id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-400 font-mono text-xs">{u.usage_id}</td>
                    <td className="px-4 py-2.5 text-gray-700 text-xs">{u.item?.item_name ?? u.item_code}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-gray-700">{u.quantity}</td>
                    <td className="px-4 py-2.5">
                      <Badge
                        label={u.status === 'COMPLETED' ? '사용완료' : u.status === 'RETURNED' ? '반납됨' : u.status === 'CANCELLED' || u.is_cancelled ? '취소됨' : '사용중'}
                        color={u.status === 'COMPLETED' ? 'green' : u.status === 'RETURNED' ? 'blue' : u.status === 'CANCELLED' || u.is_cancelled ? 'red' : 'green'}
                      />
                    </td>
                    <td className="px-4 py-2.5 text-gray-400 text-xs">
                      {new Date(u.created_at).toLocaleDateString('ko-KR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>

        {/* ④ 최근 입고 내역 */}
        <div key="recentStore">
          <Card title="최근 입고 내역" link="/store">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-2.5 text-left text-xs text-gray-500 font-medium">입고번호</th>
                  <th className="px-4 py-2.5 text-left text-xs text-gray-500 font-medium">제목</th>
                  <th className="px-4 py-2.5 text-right text-xs text-gray-500 font-medium">품목수</th>
                  <th className="px-4 py-2.5 text-left text-xs text-gray-500 font-medium">담당자</th>
                  <th className="px-4 py-2.5 text-left text-xs text-gray-500 font-medium">일시</th>
                </tr>
              </thead>
              <tbody>
                {recentStores.length === 0 ? (
                  <Empty colSpan={5} />
                ) : recentStores.map(s => (
                  <tr key={s.store_id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-400 font-mono text-xs">{s.store_id}</td>
                    <td className="px-4 py-2.5 text-gray-700 text-xs truncate max-w-[120px]">
                      {s.title ? s.title : <span className="text-amber-500">직접등록</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium text-gray-700">
                      {s.receiptItems?.length ?? 0}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{s.receiver?.name ?? s.order_man_no}</td>
                    <td className="px-4 py-2.5 text-gray-400 text-xs">
                      {s.received_at ? new Date(s.received_at).toLocaleDateString('ko-KR') : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>

        {/* ⑤ 최근 납품 내역 */}
        <div key="recentShip">
          <Card title="최근 납품 내역" link="/shipments">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-2.5 text-left text-xs text-gray-500 font-medium">납품번호</th>
                  <th className="px-4 py-2.5 text-left text-xs text-gray-500 font-medium">거래처</th>
                  <th className="px-4 py-2.5 text-left text-xs text-gray-500 font-medium">상태</th>
                  <th className="px-4 py-2.5 text-left text-xs text-gray-500 font-medium">담당자</th>
                  <th className="px-4 py-2.5 text-left text-xs text-gray-500 font-medium">일시</th>
                </tr>
              </thead>
              <tbody>
                {recentShipments.length === 0 ? (
                  <Empty colSpan={5} />
                ) : recentShipments.map(s => {
                  const statusLabel: Record<string, string> = { DRAFT: '납품예정', CONFIRMED: '납품완료', RETRIEVED: '회수됨', SHIPPED: '발송완료' };
                  const statusColor: Record<string, 'gray' | 'blue' | 'green' | 'red'> = { DRAFT: 'gray', SHIPPED: 'blue', CONFIRMED: 'green', RETRIEVED: 'gray' };
                  return (
                    <tr key={s.shipment_id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-400 font-mono text-xs">{s.shipment_id}</td>
                      <td className="px-4 py-2.5 text-gray-700 text-xs truncate max-w-[120px]">{s.customer_name}</td>
                      <td className="px-4 py-2.5">
                        <Badge label={statusLabel[s.status] ?? s.status} color={statusColor[s.status] ?? 'gray'} />
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs">{(s as any).assignee?.name ?? '-'}</td>
                      <td className="px-4 py-2.5 text-gray-400 text-xs">
                        {new Date(s.created_at).toLocaleDateString('ko-KR')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </div>

        {/* 차트: 창고별 입고/사용 현황 */}
        <div key="chart">
          <div className="bg-white rounded-xl border border-gray-200 h-full flex flex-col overflow-hidden">
            <div className="drag-handle cursor-move flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
                <GripDots />창고별 입고/사용 현황 (최근 15일)
              </h3>
              <select
                value={chartStorage}
                onChange={e => setChartStorage(e.target.value)}
                onMouseDown={e => e.stopPropagation()}
                className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-300 bg-white"
              >
                <option value="">전체 창고</option>
                {storages.map(s => (
                  <option key={s.storage_code} value={s.storage_code}>{s.storage_name}</option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-h-0 flex flex-col px-5 pt-6 pb-4">
              {warehouseChartData.every(d => d['입고'] === 0 && d['사용'] === 0) ? (
                <p className="text-sm text-gray-400 text-center py-8">최근 15일 데이터가 없습니다.</p>
              ) : (() => {
                const rawMax = Math.max(...warehouseChartData.map(d => Math.max(d['입고'], d['사용'])), 1);
                // Y축 눈금(nice) 계산
                let step: number, axisMax: number;
                if (rawMax <= 5) {
                  step = 1; axisMax = Math.max(1, Math.ceil(rawMax));
                } else {
                  const rough = rawMax / 4;
                  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
                  step = ([1, 2, 5, 10].map(c => c * pow).find(c => c >= rough)) ?? 10 * pow;
                  axisMax = Math.ceil(rawMax / step) * step;
                }
                const tickCount = Math.round(axisMax / step);
                const ticks = Array.from({ length: tickCount + 1 }, (_, i) => axisMax - i * step);
                const fmt = (n: number) => Number.isInteger(n) ? String(n) : n.toFixed(1);
                const AXIS_W = 32;
                return (
                  <div className="flex-1 min-h-0 flex flex-col">
                    {/* 플롯 영역: Y축 + 막대 */}
                    <div className="flex-1 min-h-0 flex">
                      {/* Y축 눈금 */}
                      <div className="relative shrink-0" style={{ width: AXIS_W }}>
                        {ticks.map((t, i) => (
                          <span
                            key={i}
                            className="absolute right-1.5 text-[9px] text-gray-400 leading-none -translate-y-1/2"
                            style={{ top: `${(i / tickCount) * 100}%` }}
                          >{fmt(t)}</span>
                        ))}
                      </div>
                      {/* 막대 + 그리드라인 */}
                      <div className="flex-1 min-h-0 relative border-l border-b border-gray-200">
                        {ticks.map((_, i) => (
                          <div
                            key={i}
                            className={`absolute left-0 right-0 border-t ${i === tickCount ? 'border-gray-200' : 'border-gray-100'}`}
                            style={{ top: `${(i / tickCount) * 100}%` }}
                          />
                        ))}
                        <div className="absolute inset-0 flex items-end gap-px">
                          {warehouseChartData.map(d => (
                            <div key={d.date} className="flex-1 group relative flex items-end gap-px h-full">
                              {(d['입고'] > 0 || d['사용'] > 0) && (
                                <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] rounded px-1.5 py-0.5 whitespace-nowrap opacity-0 group-hover:opacity-100 z-10 pointer-events-none">
                                  {d.date} · 입고 {d['입고']} / 사용 {d['사용']}
                                </div>
                              )}
                              <div className="flex-1 rounded-t bg-indigo-400" style={{ height: `${d['입고'] / axisMax * 100}%` }} />
                              <div className="flex-1 rounded-t bg-orange-400" style={{ height: `${d['사용'] / axisMax * 100}%` }} />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    {/* X축 날짜 라벨 (Y축 폭만큼 들여쓰기) */}
                    <div className="flex mt-1 shrink-0">
                      <div className="shrink-0" style={{ width: AXIS_W }} />
                      <div className="flex-1 flex gap-px">
                        {warehouseChartData.map(d => (
                          <div key={d.date} className="flex-1 text-center overflow-hidden">
                            <span className="text-[9px] text-gray-400 leading-none">{d.date}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-4 mt-2 text-xs text-gray-500 shrink-0">
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-indigo-400 inline-block"/>입고</span>
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-orange-400 inline-block"/>사용</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      </ReactGridLayout>
    </div>
  );
}

/** 드래그 핸들 표시용 그립 아이콘 */
function GripDots() {
  return (
    <span className="text-gray-300 select-none leading-none tracking-tighter" aria-hidden>⠿</span>
  );
}

/** 테이블 카드 — 헤더(드래그 핸들) + 스크롤 가능한 본문 */
function Card({ title, link, children }: { title: string; link: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
        <div className="drag-handle cursor-move flex items-center gap-2 flex-1 min-w-0">
          <GripDots />
          <h3 className="font-semibold text-gray-900 text-sm truncate">{title}</h3>
        </div>
        <Link to={link} className="text-xs text-indigo-600 hover:underline shrink-0 ml-2">전체보기</Link>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">{children}</div>
    </div>
  );
}

function Empty({ colSpan, message = '내역이 없습니다.' }: { colSpan: number; message?: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="text-center py-8 text-gray-400 text-sm">{message}</td>
    </tr>
  );
}
