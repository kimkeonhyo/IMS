import { useState, useMemo, useEffect, useCallback, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import GridLayout, { WidthProvider, type Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { netboxProxyApi, type NetboxRack, type RackFace, type NetboxSyncResult, type UpdateNetboxDevicePayload } from '../api/netboxProxy';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input, Textarea, Select } from '../components/ui/Input';
import { useAuthStore } from '../store/auth.store';
import { RackEditGrid } from '../components/infra/RackEditGrid';

const ReactGridLayout = WidthProvider(GridLayout);

type View = 'racks' | 'topology' | 'console';

const RACK_LAYOUT_VERSION = 'v1';
/** 랙 U 높이 기반 카드 기본 높이(그리드 행 수). SVG가 폭에 맞춰 스케일되므로 대략적 비율. */
const rackRows = (u: number) => Math.max(8, Math.round(u * 0.5));

export function InfraConsolePage() {
  const { isAdmin, user } = useAuthStore();
  const canManage = isAdmin(); // MASTER/ADMIN

  const [view, setView] = useState<View>('racks');
  const [face, setFace] = useState<RackFace>('front');
  const [editMode, setEditMode] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [syncDetail, setSyncDetail] = useState<NetboxSyncResult | null>(null);
  const [syncListOpen, setSyncListOpen] = useState(false);
  const [regionSlug, setRegionSlug] = useState<string>(''); // '' = 전체 리전
  const [siteSlug, setSiteSlug] = useState<string>('');     // '' = (리전 내) 전체 사이트
  // 범례 역할 필터 — 선택한 역할 색(#hex 소문자)만 남기고 나머지 장비를 흐리게
  const [roleFilter, setRoleFilter] = useState<string | null>(null);

  const { data: sitesData } = useQuery({
    queryKey: ['netbox-sites'],
    queryFn: netboxProxyApi.getSites,
    staleTime: 5 * 60_000,
  });
  const sites = sitesData?.sites ?? [];

  const { data: rolesData } = useQuery({
    queryKey: ['netbox-device-roles'],
    queryFn: netboxProxyApi.getDeviceRoles,
    staleTime: 10 * 60_000,
  });
  const deviceRoles = rolesData?.roles ?? [];
  // 사이트가 속한 Region 목록 (중복 제거)
  const regions = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sites) if (s.region_slug) m.set(s.region_slug, s.region_name ?? s.region_slug);
    return Array.from(m, ([slug, name]) => ({ slug, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [sites]);
  // 선택 리전에 속한 사이트만 (리전 미선택 시 전체)
  const siteOptions = regionSlug ? sites.filter(s => s.region_slug === regionSlug) : sites;

  const { data, isLoading } = useQuery({
    queryKey: ['netbox-racks', regionSlug, siteSlug],
    queryFn: () => netboxProxyApi.getRacks(siteSlug || undefined, siteSlug ? undefined : (regionSlug || undefined)),
    staleTime: 60_000,
  });

  // 범례 = 현재 조회 범위 랙에 실장된 장비 기준 (색은 역할 목록에서, 수는 racks 응답에서)
  const rackRoleCounts = data?.role_counts;
  const legendRoles = useMemo(() => {
    if (!rackRoleCounts) return deviceRoles; // 구버전 백엔드 폴백: NetBox 전체 수
    return deviceRoles
      .map(r => ({ ...r, count: rackRoleCounts[r.name] ?? 0 }))
      .filter(r => r.count > 0);
  }, [deviceRoles, rackRoleCounts]);

  const syncMut = useMutation({
    mutationFn: netboxProxyApi.runSync,
    onSuccess: (res) => {
      setSyncDetail(res);
      const usageSuffix =
        res.usages_created !== undefined && res.usages_returned !== undefined
          ? ` · 사용중 +${res.usages_created}/반납 ${res.usages_returned}`
          : '';
      setSyncResult(
        res.ok
          ? `생성 ${res.created} · 갱신 ${res.updated} · 변동없음 ${res.skipped}${usageSuffix}`
          : (res.message ?? '동기화에 실패했습니다.'),
      );
    },
    onError: () => { setSyncResult('동기화 요청에 실패했습니다.'); setSyncDetail(null); },
  });

  const viewCls = (v: View) =>
    `px-4 py-1.5 text-sm transition-colors ${view === v ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`;

  const configured = data?.configured ?? true;
  const racks = data?.racks ?? [];

  // ─── 랙 카드 자유배치 (대시보드 카드처럼 Master/Admin이 드래그·리사이즈) ───
  const layoutKey = `ims-infra-rack-layout-${RACK_LAYOUT_VERSION}-${user?.man_no ?? 'anon'}`;
  const defaultLayout: Layout[] = useMemo(
    () => racks.map((r, idx) => ({
      i: String(r.id),
      x: (idx % 4) * 3,
      y: Math.floor(idx / 4) * 22,
      w: 3,
      h: rackRows(r.u_height),
      minW: 2,
      minH: 6,
    })),
    [racks],
  );

  const [layout, setLayout] = useState<Layout[] | null>(null);
  useEffect(() => {
    if (racks.length === 0) return;
    const ids = new Set(racks.map(r => String(r.id)));
    try {
      const saved = localStorage.getItem(layoutKey);
      if (saved) {
        const parsed = JSON.parse(saved) as Layout[];
        // 저장 항목이 현재 랙 집합과 일치할 때만 사용 (랙 추가/삭제 대비)
        if (parsed.length === racks.length && parsed.every(l => ids.has(l.i))) {
          setLayout(parsed);
          return;
        }
      }
    } catch { /* ignore */ }
    setLayout(defaultLayout);
  }, [racks, defaultLayout, layoutKey]);

  // 드래그/리사이즈가 끝났을 때만 저장 (마운트 시 발화하는 onLayoutChange로는 저장하지 않음)
  const persistLayout = useCallback((next: Layout[]) => {
    if (!canManage) return;
    setLayout(next);
    try { localStorage.setItem(layoutKey, JSON.stringify(next)); } catch { /* ignore */ }
  }, [canManage, layoutKey]);

  const resetLayout = useCallback(() => {
    setLayout(defaultLayout);
    try { localStorage.removeItem(layoutKey); } catch { /* ignore */ }
  }, [defaultLayout, layoutKey]);

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center gap-3 justify-between flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-bold text-gray-900">인프라 관리</h1>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button onClick={() => setView('racks')} className={viewCls('racks')}>랙 배치도</button>
            <button onClick={() => setView('topology')} className={viewCls('topology')}>토폴로지</button>
            <button onClick={() => setView('console')} className={viewCls('console')}>NetBox 콘솔</button>
          </div>
          {(view === 'racks' || view === 'topology') && (
            <>
              <select
                value={regionSlug}
                onChange={e => { setRegionSlug(e.target.value); setSiteSlug(''); }}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                title="리전 선택"
              >
                <option value="">전체 리전</option>
                {regions.map(r => <option key={r.slug} value={r.slug}>{r.name}</option>)}
              </select>
              <select
                value={siteSlug}
                onChange={e => setSiteSlug(e.target.value)}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                title="사이트 선택"
              >
                <option value="">{regionSlug ? '리전 내 전체 사이트' : '전체 사이트'}</option>
                {siteOptions.map(s => <option key={s.id} value={s.slug}>{s.name}</option>)}
              </select>
            </>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {syncResult && <span className="text-sm text-gray-600">{syncResult}</span>}
          {syncDetail?.details && (
            <button
              onClick={() => setSyncListOpen(true)}
              className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline"
            >동기화 리스트 보기</button>
          )}
          {canManage && (
            <Button
              size="sm"
              onClick={() => { setSyncResult(null); syncMut.mutate(); }}
              loading={syncMut.isPending}
            >재고 동기화</Button>
          )}
          <a
            href="/netbox/"
            target="_blank"
            rel="noreferrer"
            className="text-sm text-indigo-600 hover:text-indigo-800 hover:underline"
          >NetBox 새 탭에서 열기 ↗</a>
        </div>
      </div>

      {view === 'racks' && (
        <div className="space-y-3">
          {isLoading ? (
            <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-gray-400 text-sm">
              랙 정보를 불러오는 중...
            </div>
          ) : !configured ? (
            <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
              <p className="text-gray-600 font-medium">NetBox 미연동 — 관리자에게 문의</p>
              <p className="text-sm text-gray-400 mt-1">NetBox 연동 설정이 완료되면 랙 배치도가 표시됩니다.</p>
            </div>
          ) : racks.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-gray-400 text-sm">
              등록된 랙이 없습니다. NetBox에서 랙을 등록해 주세요.
            </div>
          ) : (
            <>
              {/* 전면/후면 토글 (행 전체 적용) */}
              <div className="flex items-center gap-3">
                <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => setFace('front')}
                    className={`px-3 py-1 text-xs transition-colors ${face === 'front' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  >전면 (Front)</button>
                  <button
                    onClick={() => setFace('rear')}
                    className={`px-3 py-1 text-xs transition-colors ${face === 'rear' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  >후면 (Rear)</button>
                </div>
                {canManage && (
                  <button
                    onClick={() => setEditMode(v => !v)}
                    className={`px-3 py-1 text-xs rounded-lg border transition-colors ${editMode ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                  >{editMode ? '편집 종료' : '배치 편집'}</button>
                )}
                <span className="text-xs text-gray-500 bg-gray-100 rounded-full px-2.5 py-1 font-medium">랙 {racks.length}</span>
                {editMode && (
                  <span className="text-xs text-amber-600">장비를 드래그해서 U 위치를 변경하세요 (랙 간 이동 가능)</span>
                )}
                {canManage && !editMode && (
                  <>
                    <span className="text-xs text-gray-400">랙 카드 헤더를 드래그해 배치를 바꾸거나 우하단으로 크기를 조절할 수 있습니다.</span>
                    <button
                      onClick={resetLayout}
                      className="ml-auto text-xs text-gray-500 hover:text-indigo-600 border border-gray-200 rounded-lg px-3 py-1 transition-colors"
                      title="랙 배치를 기본값으로 되돌립니다"
                    >↺ 레이아웃 초기화</button>
                  </>
                )}
              </div>

              {/* 색상 범례 — 클릭하면 해당 역할만 강조 (다시 클릭하면 해제) */}
              {legendRoles.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 bg-white border border-gray-200 rounded-lg px-3 py-1.5">
                  <span className="text-xs text-gray-400 mr-1">범례</span>
                  {legendRoles.map(r => {
                    const color = `#${r.color.toLowerCase()}`;
                    const active = roleFilter === color;
                    const dimmed = roleFilter !== null && !active;
                    return (
                      <button
                        key={r.name}
                        onClick={() => setRoleFilter(active ? null : color)}
                        aria-pressed={active}
                        title={active ? '필터 해제' : `${r.name}만 강조`}
                        className={`inline-flex items-center gap-1.5 text-xs rounded-md px-1.5 py-0.5 transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                          active ? 'bg-gray-900 text-white' : dimmed ? 'text-gray-300 hover:text-gray-500' : 'text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <span className={`w-2.5 h-2.5 rounded-sm ring-1 ring-inset ring-black/10 transition-opacity ${dimmed ? 'opacity-25' : ''}`} style={{ backgroundColor: color }} />
                        {r.name}
                        <span className={`text-[10px] font-mono ${active ? 'text-gray-300' : 'text-gray-400'}`}>{r.count}</span>
                      </button>
                    );
                  })}
                  {roleFilter && (
                    <button
                      onClick={() => setRoleFilter(null)}
                      className="ml-1 text-[11px] text-indigo-600 hover:text-indigo-800 hover:underline"
                    >전체 보기</button>
                  )}
                </div>
              )}

              {/* 저장된 레이아웃이 해소된 뒤에만 렌더 — null일 때 default로 마운트되면
                  RGL의 초기 onLayoutChange가 저장본을 default로 덮어써 새로고침 시 초기화됨 */}
              {layout && (
                <ReactGridLayout
                  className="layout"
                  layout={layout}
                  cols={12}
                  rowHeight={40}
                  margin={[16, 16]}
                  containerPadding={[0, 0]}
                  isDraggable={canManage && !editMode}
                  isResizable={canManage && !editMode}
                  draggableHandle=".rack-drag-handle"
                  onLayoutChange={(next) => setLayout(next)}
                  onDragStop={persistLayout}
                  onResizeStop={persistLayout}
                  compactType="vertical"
                >
                  {racks.map(rack => (
                    <div key={String(rack.id)}>
                      <RackCard rack={rack} face={face} editMode={editMode} draggable={canManage && !editMode} roleFilter={roleFilter} canManage={canManage} />
                    </div>
                  ))}
                </ReactGridLayout>
              )}
            </>
          )}
        </div>
      )}

      {view === 'topology' && (
        <TopologyView filterName={siteSlug ? (sites.find(s => s.slug === siteSlug)?.name ?? 'All') : 'All'} />
      )}

      {view === 'console' && (
        <div className="space-y-2">
          <p className="text-xs text-gray-400">NetBox 자체 로그인이 필요할 수 있습니다.</p>
          <iframe
            src="/netbox/"
            title="NetBox"
            className="w-full rounded-xl border border-gray-200"
            style={{ height: 'calc(100vh - 220px)' }}
          />
        </div>
      )}

      <Modal open={syncListOpen} onClose={() => setSyncListOpen(false)} title="재고 동기화 상세" size="lg">
        {syncDetail && (
          <div className="p-5 space-y-4 text-sm">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <div className="bg-gray-50 rounded-lg px-3 py-2"><span className="text-gray-500">생성</span> <strong className="ml-1">{syncDetail.created}</strong></div>
              <div className="bg-gray-50 rounded-lg px-3 py-2"><span className="text-gray-500">갱신</span> <strong className="ml-1">{syncDetail.updated}</strong></div>
              <div className="bg-gray-50 rounded-lg px-3 py-2"><span className="text-gray-500">변동없음</span> <strong className="ml-1">{syncDetail.skipped}</strong></div>
              <div className="bg-green-50 rounded-lg px-3 py-2"><span className="text-gray-500">사용중 등록</span> <strong className="ml-1 text-green-700">{syncDetail.usages_created ?? 0}</strong></div>
              <div className="bg-blue-50 rounded-lg px-3 py-2"><span className="text-gray-500">반납</span> <strong className="ml-1 text-blue-700">{syncDetail.usages_returned ?? 0}</strong></div>
              {syncDetail.details && syncDetail.details.errors.length > 0 && (
                <div className="bg-red-50 rounded-lg px-3 py-2"><span className="text-gray-500">실패</span> <strong className="ml-1 text-red-600">{syncDetail.details.errors.length}</strong></div>
              )}
            </div>

            <SyncSection title="사용중 등록" color="text-green-700" items={syncDetail.details?.usagesCreated ?? []} empty="신규 사용중 없음" />
            <SyncSection title="반납" color="text-blue-700" items={syncDetail.details?.usagesReturned ?? []} empty="반납 없음" />
            <SyncSection title="스킵" color="text-gray-500" items={syncDetail.details?.notes ?? []} empty="스킵 없음" />
            <SyncSection title="실패" color="text-red-600" items={syncDetail.details?.errors ?? []} empty="실패 없음" />
          </div>
        )}
      </Modal>
    </div>
  );
}

function SyncSection({ title, color, items, empty }: { title: string; color: string; items: string[]; empty: string }) {
  return (
    <div>
      <p className={`text-xs font-semibold ${color} mb-1`}>{title} ({items.length})</p>
      <div className="border border-gray-200 rounded-lg max-h-40 overflow-y-auto divide-y divide-gray-50">
        {items.length === 0
          ? <p className="text-xs text-gray-400 px-3 py-2">{empty}</p>
          : items.map((it, i) => <p key={i} className="text-xs text-gray-700 px-3 py-1.5 font-mono">{it}</p>)}
      </div>
    </div>
  );
}

// ─── 토폴로지 뷰 (NetBox topology-views iframe, 공유 저장 필터 고정 적용) ────
function TopologyView({ filterName }: { filterName: string }) {
  const { data } = useQuery({
    queryKey: ['netbox-topology-filter'],
    queryFn: netboxProxyApi.getTopologyFilter,
    staleTime: 5 * 60_000,
  });
  const base = '/netbox/plugins/netbox_topology_views/topology/';
  const filters = data?.filters ?? [];
  // topology-views의 ?site= 는 동작하지 않아, 사이트명(또는 'All')과 일치하는 저장 필터로 매칭.
  const match = filters.find(f => f.name === filterName) ?? filters.find(f => f.name === 'All');
  const src = match ? `${base}?filter_id=${match.id}` : base;
  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-400">
        {match
          ? `저장 필터 '${match.name}' 적용 중 (사이트 선택 시 해당 사이트 필터로 전환).`
          : 'NetBox → Topology Views에서 사이트별 저장 필터를 만들면 자동 적용됩니다.'}
        {' '}NetBox 로그인이 필요할 수 있습니다.
      </p>
      <iframe
        src={src}
        title="Network Topology"
        className="w-full rounded-xl border border-gray-200"
        style={{ height: 'calc(100vh - 220px)' }}
      />
    </div>
  );
}

// ─── 랙 카드 (elevation SVG / 편집 그리드) ──────────────────────────────────

interface RackTip {
  x: number;
  y: number;
  lines: string[];
}

/** 장비 툴팁 — react-grid-layout 아이템은 transform이 걸려 있어 카드 내부의
 *  position:fixed가 뷰포트 기준으로 동작하지 않으므로 body로 포털 렌더링. */
function RackDeviceTooltip({ tip }: { tip: RackTip }) {
  const left = Math.min(tip.x + 14, window.innerWidth - 250);
  const top = Math.min(tip.y + 16, window.innerHeight - 90);
  return createPortal(
    <div
      className="fixed z-[9999] pointer-events-none rounded-lg bg-slate-900/95 px-3 py-2 shadow-xl ring-1 ring-white/10 max-w-[240px]"
      style={{ left, top }}
      role="tooltip"
    >
      <p className="text-xs font-semibold text-white truncate">{tip.lines[0]}</p>
      {tip.lines.slice(1).map((l, i) => (
        <p
          key={i}
          className={`text-[11px] mt-0.5 truncate ${l.startsWith('Mgmt IP') ? 'font-mono text-emerald-300' : 'text-slate-300'}`}
        >{l}</p>
      ))}
    </div>,
    document.body,
  );
}

/** 배치도 로딩 스켈레톤 — 랙에 장비가 꽂힌 형태의 셔머 */
function RackSkeleton() {
  return (
    <div className="animate-pulse motion-reduce:animate-none px-4 py-3 space-y-1" role="status" aria-label="배치도 로딩 중">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className={`rounded-sm ${i % 4 === 1 ? 'h-4 bg-slate-200' : 'h-2.5 bg-slate-100'}`} />
      ))}
    </div>
  );
}

interface DeviceMenu {
  x: number;
  y: number;
  name: string;
  nbId: number | null;       // NetBox 장비 id (속성 수정·NetBox 열기)
}

function RackCard({ rack, face, editMode, draggable, roleFilter, canManage }: {
  rack: NetboxRack; face: RackFace; editMode: boolean; draggable: boolean; roleFilter: string | null; canManage: boolean;
}) {
  const svgWrapRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<RackTip | null>(null);
  const [menu, setMenu] = useState<DeviceMenu | null>(null);
  const [editNbId, setEditNbId] = useState<number | null>(null);

  // 장비 클릭 → 팝오버 메뉴 (속성 수정 / NetBox에서 열기).
  // 빈 슬롯(add device) 앵커는 기본 동작(NetBox 새 탭) 유지.
  const onSvgClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    const a = (e.target as HTMLElement).closest('a');
    if (!a) return;
    const dataTip = a.getAttribute('data-tip');
    if (!dataTip) return; // 빈 슬롯
    e.preventDefault();
    // NetBox SVG 앵커는 href가 아니라 xlink:href를 사용 (내부 상세 재작성 앵커만 href)
    const href = a.getAttribute('href') ?? a.getAttribute('xlink:href') ?? '';
    const nbIdRaw = href.match(/\/netbox\/dcim\/devices\/(\d+)\//)?.[1] ?? null;
    setTip(null);
    setMenu({
      x: e.clientX,
      y: e.clientY,
      name: dataTip.split('\n')[0].replace(/^Name:\s*/, '').trim(),
      nbId: nbIdRaw != null ? Number(nbIdRaw) : null,
    });
  };
  const { data: svg, isLoading, isError } = useQuery({
    queryKey: ['netbox-elevation', rack.id, face],
    queryFn: () => netboxProxyApi.getElevationSvg(rack.id, face),
    staleTime: 5 * 60_000, // 서버측 캐시(5분)와 정합
    enabled: !editMode, // 편집 모드에서는 SVG 대신 그리드 렌더링
  });

  // 네이티브 <title> 툴팁(표시 지연 ~1초, 스타일 불가)을 원천 차단 —
  // DOM 삽입 전에 문자열 단계에서 <title>을 제거하고 data-tip/data-fill 속성으로 변환.
  // (DOM 삽입 후 제거하는 방식은 브라우저가 먼저 title을 인식하면 네이티브 툴팁이 떠버림)
  const processedSvg = useMemo(() => {
    if (!svg) return svg;
    return svg.replace(/<a\b[^>]*>[\s\S]*?<\/a>/g, (block) => {
      const t = block.match(/<title>([\s\S]*?)<\/title>/);
      if (!t) return block; // 빈 슬롯(add device) 앵커 — 툴팁·필터 대상 아님
      const tip = t[1].trim().replace(/"/g, '&quot;').replace(/\n/g, '&#10;');
      const fill = block.match(/fill:\s*(#[0-9a-fA-F]{6})/);
      return block
        .replace(/<title>[\s\S]*?<\/title>/, '')
        .replace(/<a\b/, `<a data-tip="${tip}" data-fill="${fill ? fill[1].toLowerCase() : 'other'}" `);
    });
  }, [svg]);

  // 범례 역할 필터 — 선택 색이 아닌 장비는 흐리게 (구조·빈 슬롯은 그대로 유지)
  useEffect(() => {
    const root = svgWrapRef.current;
    if (!root) return;
    root.querySelectorAll<SVGElement>('a[data-fill]').forEach(a => {
      const match = roleFilter === null || a.getAttribute('data-fill') === roleFilter;
      a.style.opacity = match ? '' : '0.12';
      a.style.filter = match ? '' : 'saturate(0.3)';
    });
  }, [roleFilter, svg, editMode]);

  const onSvgMouseMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (menu) return; // 메뉴가 열려있는 동안 툴팁 억제
    const a = (e.target as HTMLElement).closest('a[data-tip]');
    const lines = a ? (a.getAttribute('data-tip') ?? '').split('\n').map(s => s.trim()).filter(Boolean) : [];
    setTip(lines.length > 0 ? { x: e.clientX, y: e.clientY, lines } : null);
  };

  // 잔존 툴팁 방지 — 스크롤·창 이탈·빠른 포인터 이동은 wrapper의 mouseleave가 안 잡히는
  // 경우가 있어, 툴팁이 떠 있는 동안 전역 감시로 wrapper 밖이면 즉시 제거한다.
  const tipActive = tip != null;
  useEffect(() => {
    if (!tipActive) return;
    const onMove = (e: MouseEvent) => {
      const root = svgWrapRef.current;
      if (!root || !root.contains(e.target as Node)) setTip(null);
    };
    const clear = () => setTip(null);
    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('scroll', clear, true);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('mousemove', onMove, true);
      window.removeEventListener('scroll', clear, true);
      window.removeEventListener('blur', clear);
    };
  }, [tipActive]);

  const occupied = rack.occupied_u;
  const pct = occupied != null && rack.u_height > 0
    ? Math.min(100, Math.round((occupied / rack.u_height) * 100))
    : null;
  const barColor = pct == null ? '' : pct >= 90 ? 'bg-red-400' : pct >= 70 ? 'bg-amber-400' : 'bg-emerald-400';

  return (
    <div className="bg-white rounded-xl border border-gray-200 h-full flex flex-col overflow-hidden shadow-sm">
      {/* 네임플레이트 헤더 — 랙 전면 상단의 명판 느낌 */}
      <div className={`px-3.5 py-2.5 bg-gradient-to-b from-slate-700 to-slate-900 flex items-center justify-between gap-2 ${draggable ? 'rack-drag-handle cursor-move' : ''}`}>
        <p className="font-mono font-semibold tracking-wide text-slate-100 text-sm truncate" title={rack.name}>{rack.name}</p>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-slate-300">
            {pct != null ? `${occupied}/${rack.u_height}U` : `${rack.u_height}U`}
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-slate-300">장비 {rack.device_count}</span>
          <a
            href={`/netbox/dcim/racks/${rack.id}/`}
            target="_blank"
            rel="noreferrer"
            onMouseDown={e => e.stopPropagation()}
            title="NetBox에서 열기"
            aria-label="NetBox에서 열기"
            className="ml-0.5 text-slate-400 hover:text-white transition-colors text-sm leading-none focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded"
          >↗</a>
        </div>
      </div>
      {/* U 사용률 게이지 — 네임플레이트 하단의 얇은 용량 바 (70%↑ 주황, 90%↑ 빨강) */}
      {pct != null && (
        <div className="h-1 bg-slate-800 shrink-0" title={`U 사용률 ${pct}% (${occupied}/${rack.u_height}U)`}>
          <div className={`h-full ${barColor} transition-[width] duration-500`} style={{ width: `${pct}%` }} />
        </div>
      )}
      <div className="p-3 flex-1 min-h-0 overflow-auto">
        {editMode ? (
          <RackEditGrid rack={rack} face={face} />
        ) : isLoading ? (
          <RackSkeleton />
        ) : isError || !svg ? (
          <div className="py-12 text-center text-xs text-gray-400">배치도를 불러오지 못했습니다.</div>
        ) : (
          <div
            ref={svgWrapRef}
            className="max-w-full [&_svg]:w-full [&_svg]:h-auto [&_a]:cursor-pointer [&_a]:[transition:opacity_.18s_ease,filter_.18s_ease] [&_a:hover]:[filter:brightness(1.12)_saturate(1.1)]"
            onClick={onSvgClick}
            onMouseMove={onSvgMouseMove}
            onMouseLeave={() => setTip(null)}
            dangerouslySetInnerHTML={{ __html: processedSvg ?? '' }}
          />
        )}
      </div>
      {tip && <RackDeviceTooltip tip={tip} />}
      {menu && (
        <DeviceMenuPopover
          menu={menu}
          canManage={canManage}
          onClose={() => setMenu(null)}
          onEdit={id => { setMenu(null); setEditNbId(id); }}
        />
      )}
      {editNbId != null && <DeviceEditModal nbId={editNbId} onClose={() => setEditNbId(null)} />}
    </div>
  );
}

/** 장비 클릭 팝오버 — 속성 수정 / NetBox에서 열기 */
function DeviceMenuPopover({ menu, canManage, onClose, onEdit }: {
  menu: DeviceMenu;
  canManage: boolean;
  onClose: () => void;
  onEdit: (nbId: number) => void;
}) {
  const left = Math.min(menu.x + 6, window.innerWidth - 200);
  const top = Math.min(menu.y + 6, window.innerHeight - 160);
  const itemCls = 'w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors focus:outline-none focus-visible:bg-gray-50';
  return createPortal(
    <>
      {/* 바깥 클릭 시 닫기 */}
      <div className="fixed inset-0 z-[9998]" onClick={onClose} onContextMenu={e => { e.preventDefault(); onClose(); }} />
      <div className="fixed z-[9999] w-48 rounded-lg bg-white shadow-xl ring-1 ring-black/10 py-1" style={{ left, top }} role="menu">
        <p className="px-3 py-1.5 text-xs font-semibold text-gray-900 border-b border-gray-100 truncate" title={menu.name}>{menu.name}</p>
        {canManage && menu.nbId != null && (
          <button className={itemCls} role="menuitem" onClick={() => onEdit(menu.nbId!)}>속성 수정</button>
        )}
        {menu.nbId != null && (
          <button
            className={itemCls}
            role="menuitem"
            onClick={() => { window.open(`/netbox/dcim/devices/${menu.nbId}/`, '_blank', 'noreferrer'); onClose(); }}
          >NetBox에서 열기 ↗</button>
        )}
      </div>
    </>,
    document.body,
  );
}

const DEVICE_STATUS_OPTIONS = [
  { value: 'active', label: 'Active (운영중)' },
  { value: 'inventory', label: 'Inventory (재고)' },
  { value: 'planned', label: 'Planned (도입 예정)' },
  { value: 'staged', label: 'Staged (설치 대기)' },
  { value: 'offline', label: 'Offline (전원 꺼짐)' },
  { value: 'failed', label: 'Failed (장애)' },
  { value: 'decommissioning', label: 'Decommissioning (철거 중)' },
];

/** 장비 속성 편집 — 자주 쓰는 필드만 IMS에서 바로 수정 (저장 시 NetBox 반영 + 배치도 즉시 갱신) */
function DeviceEditModal({ nbId, onClose }: { nbId: number; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: device, isLoading } = useQuery({
    queryKey: ['netbox-device', nbId],
    queryFn: () => netboxProxyApi.getDevice(nbId),
  });
  const { data: rolesData } = useQuery({
    queryKey: ['netbox-device-roles'],
    queryFn: netboxProxyApi.getDeviceRoles,
    staleTime: 10 * 60_000,
  });
  const { data: ownersData } = useQuery({
    queryKey: ['netbox-owners'],
    queryFn: netboxProxyApi.getOwners,
    staleTime: 5 * 60_000,
  });
  const { data: typesData } = useQuery({
    queryKey: ['netbox-device-types'],
    queryFn: netboxProxyApi.getDeviceTypes,
    staleTime: 10 * 60_000,
  });

  const [form, setForm] = useState({
    name: '', serial: '', description: '', status: 'active', role: '', owner: '',
    position: '', deviceType: '', mgmtIp: '',
  });
  useEffect(() => {
    if (!device) return;
    setForm({
      name: device.name,
      serial: device.serial,
      description: device.description,
      status: device.status,
      role: device.role_id != null ? String(device.role_id) : '',
      owner: device.owner_id != null ? String(device.owner_id) : '',
      position: device.position != null ? String(device.position) : '',
      deviceType: device.device_type_id != null ? String(device.device_type_id) : '',
      mgmtIp: device.primary_ip4 ?? '',
    });
  }, [device]);

  const saveMut = useMutation({
    mutationFn: () => {
      const dto: UpdateNetboxDevicePayload = {
        name: form.name.trim(),
        serial: form.serial.trim(),
        description: form.description.trim(),
        status: form.status,
        ...(form.role ? { role: Number(form.role) } : {}),
        owner: form.owner ? Number(form.owner) : null,
        ...(form.deviceType ? { device_type: Number(form.deviceType) } : {}),
      };
      // 위치: 변경/해제 시에만 전송 (빈칸 = 랙에서 내림)
      const newPos = form.position.trim() === '' ? null : Number(form.position);
      if (newPos !== (device?.position ?? null)) {
        dto.position = newPos;
        if (newPos !== null) dto.face = device?.face ?? 'front';
      }
      // mgmt IP: 변경 시에만 전송 (빈칸 = primary 해제)
      const newIp = form.mgmtIp.trim();
      if (newIp !== (device?.primary_ip4 ?? '')) {
        dto.mgmt_ip = newIp === '' ? null : newIp;
      }
      return netboxProxyApi.updateDevice(nbId, dto);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['netbox-elevation'] });
      qc.invalidateQueries({ queryKey: ['netbox-racks'] });
      qc.invalidateQueries({ queryKey: ['netbox-device', nbId] });
      qc.invalidateQueries({ queryKey: ['netbox-rack-devices'] });
      onClose();
    },
  });

  const roleOptions = (rolesData?.roles ?? []).map(r => ({ value: String(r.id), label: r.name }));
  const ownerOptions = [
    { value: '', label: '담당팀 없음' },
    ...(ownersData?.owners ?? []).map(o => ({ value: String(o.id), label: o.name })),
  ];
  const typeOptions = (typesData?.types ?? []).map(t => ({ value: String(t.id), label: `${t.model} (${t.u_height}U)` }));

  return (
    <Modal open onClose={onClose} title="장비 속성 수정" size="md">
      <div className="p-5 space-y-4">
        {isLoading || !device ? (
          <p className="text-sm text-gray-400 py-8 text-center">장비 정보를 불러오는 중...</p>
        ) : (
          <>
            <Input label="장비명 *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="시리얼" value={form.serial} onChange={e => setForm(f => ({ ...f, serial: e.target.value }))} />
              <Select label="상태" value={form.status} onChange={v => setForm(f => ({ ...f, status: v }))} options={DEVICE_STATUS_OPTIONS} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Select label="역할" value={form.role} onChange={v => setForm(f => ({ ...f, role: v }))} options={roleOptions} placeholder="역할 선택" />
              <Select label="담당팀" value={form.owner} onChange={v => setForm(f => ({ ...f, owner: v }))} options={ownerOptions} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="시작 U 위치"
                type="number"
                value={form.position}
                onChange={e => setForm(f => ({ ...f, position: e.target.value }))}
                placeholder="비우면 랙에서 내림"
              />
              <Select label="장비 타입 (U 높이)" value={form.deviceType} onChange={v => setForm(f => ({ ...f, deviceType: v }))} options={typeOptions} placeholder="타입 선택" />
            </div>
            <Input
              label="Mgmt IP (primary IPv4)"
              value={form.mgmtIp}
              onChange={e => setForm(f => ({ ...f, mgmtIp: e.target.value }))}
              placeholder="예: 192.0.2.99 (/16 기본, 비우면 해제)"
            />
            <Textarea
              label="설명 (GPU 사양 등)"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2}
            />
            <p className="text-[11px] text-gray-400">
              Mgmt IP는 mgmt 인터페이스에 등록 후 primary IPv4로 지정됩니다. 그 외 인터페이스·케이블 변경은 NetBox에서 해주세요.
            </p>
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="secondary" onClick={onClose}>닫기</Button>
              <Button onClick={() => saveMut.mutate()} loading={saveMut.isPending} disabled={!form.name.trim()}>저장</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
