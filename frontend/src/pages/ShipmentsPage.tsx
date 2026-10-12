import { Fragment, useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { shipmentsApi, type CreateShipmentDto, type Shipment, type ServiceInfo, type ServiceKind, type DeployMode, type AccessMode } from '../api/shipments';
import { notionCatalogApi } from '../api/notionCatalog';
import { itemsApi, storageApi } from '../api/items';
import { serialNumbersApi } from '../api/serialNumbers';
import { SerialChip, useLatestSerialImages } from '../components/SerialChip';
import { SerialPhotoPicker, AssetImageGallery, uploadSerialPhotos, type SerialPhotoMap } from '../components/AssetImages';
import { employeesApi } from '../api/employees';
import type { ShipmentItem } from '../api/shipments';
import { Table } from '../components/ui/Table';
import { Badge, statusColor } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input, Textarea, Select } from '../components/ui/Input';
import { useAuthStore } from '../store/auth.store';
import type { SerialNumber } from '../types';

const STATUS_LABEL: Record<string, string> = {
  DRAFT: '납품예정', CONFIRMED: '납품완료', CANCELLED: '취소됨', RETRIEVED: '회수됨',
  SHIPPED: '발송완료',   // 발송 단계 폐지 전 문서
};

interface ItemForm {
  item_code: string;
  storage_code: string;
  quantity: string;
  serial_number_ids: number[];
}

const SN_STATUS_LABEL: Record<string, string> = { STOCK: '재고', SHIPPED: '납품됨', USED: '사용됨', BROKEN: '고장', REPAIR: '수리중', CANCELLED: '취소됨' };
const SN_STATUS_COLOR: Record<string, string> = {
  STOCK: 'bg-green-100 text-green-700', SHIPPED: 'bg-blue-100 text-blue-700',
  USED: 'bg-gray-100 text-gray-500', BROKEN: 'bg-red-100 text-red-700', REPAIR: 'bg-amber-100 text-amber-700',    CANCELLED: 'bg-red-100 text-red-400',
};

/** 납품 상세용 S/N 리스트 */
function ShipmentItemSnList({ item }: { item: ShipmentItem }) {
  const { data: serials = [], isLoading } = useQuery({
    queryKey: ['sn-by-shipment-item', item.shipment_item_id],
    queryFn: () => serialNumbersApi.findByShipmentItem(item.shipment_item_id),
    enabled: (item.serial_number_ids?.length ?? 0) > 0,
  });

  if ((item.serial_number_ids?.length ?? 0) === 0) return null;
  const specKeys = item.item?.specs ?? [];

  return (
    <tr className="bg-blue-50">
      <td colSpan={3} className="px-3 pb-3">
        {isLoading ? (
          <p className="text-xs text-gray-400 py-1">S/N 불러오는 중...</p>
        ) : (
          <div className="overflow-x-auto mt-1">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500">
                  <th className="text-left pr-4 py-1 font-medium">S/N</th>
                  <th className="text-left pr-4 py-1 font-medium whitespace-nowrap">장비번호</th>
                  <th className="text-left pr-4 py-1 font-medium whitespace-nowrap">상태</th>
                  {specKeys.map(k => <th key={k} className="text-left pr-4 py-1 font-medium whitespace-nowrap">{k}</th>)}
                </tr>
              </thead>
              <tbody>
                {serials.map(sn => (
                  <tr key={sn.id} className="border-t border-blue-100">
                    <td className="pr-4 py-1 font-mono text-gray-700">{sn.serial_no}</td>
                    <td className="pr-4 py-1 font-mono text-gray-700 whitespace-nowrap">{sn.asset_no ?? '-'}</td>
                    <td className="pr-4 py-1 whitespace-nowrap">
                      <span className={`inline-block px-1.5 py-0.5 rounded whitespace-nowrap ${SN_STATUS_COLOR[sn.status]}`}>
                        {SN_STATUS_LABEL[sn.status] ?? sn.status}
                      </span>
                    </td>
                    {specKeys.map(k => <td key={k} className="pr-4 py-1 text-gray-600">{sn.tags?.[k] ?? '-'}</td>)}
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

/** S/N 선택 인라인 컴포넌트 */
function SerialPicker({
  item_code, storage_code, selected, onChange,
}: {
  item_code: string;
  storage_code: string;
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  const [snSearch, setSnSearch] = useState('');
  const [snMode, setSnMode] = useState<'serial' | 'asset'>('serial');
  const { data: serials = [] } = useQuery({
    queryKey: ['serial-numbers', item_code, storage_code],
    queryFn: () => serialNumbersApi.findAvailable(item_code, storage_code),
    enabled: !!item_code && !!storage_code,
  });

  const snImages = useLatestSerialImages(serials.map((sn: SerialNumber) => sn.id));
  if (!serials.length) return (
    <p className="text-xs text-gray-400 mt-1">사용 가능한 S/N 없음</p>
  );

  const toggle = (id: number) => {
    if (selected.includes(id)) onChange(selected.filter(s => s !== id));
    else onChange([...selected, id]);
  };

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

const SERVICE_LABEL: Record<string, string> = { VMS: 'VMS', NVR: 'NVR', ETC: '기타' };
const DEPLOY_LABEL: Record<string, string> = { BUNDLE: 'Bundle', MANUAL: 'Manual' };
const ACCESS_LABEL: Record<string, string> = { REMOTE: '원격', CLOSED: '폐쇄망' };

/** 접속 방식별 IP 입력 가이드 — 원격은 VPN 주소, 폐쇄망은 현장 로컬 주소 */
const ACCESS_GUIDE: Record<AccessMode, { ip: string; vip: string; ipPlaceholder: string; vipPlaceholder: string; hint: string }> = {
  REMOTE: {
    ip: 'VPN IP',
    vip: 'VPN VIP',
    ipPlaceholder: '예: 192.0.2.51',
    vipPlaceholder: '예: 192.0.2.52',
    hint: '원격 접속용 VPN 주소를 입력하세요.',
  },
  CLOSED: {
    ip: '로컬 IP (현장)',
    vip: '로컬 VIP (현장)',
    ipPlaceholder: '예: 198.51.100.51',
    vipPlaceholder: '예: 198.51.100.52',
    hint: '폐쇄망이라 외부 접속이 안 됩니다. 현장 내부에서 사용하는 로컬 주소를 입력하세요.',
  },
};

/** 서비스 납품 정보 폼 상태 */
interface ServiceForm {
  enabled: boolean;
  service: ServiceKind | '';
  service_custom_name: string;
  deploy_mode: DeployMode;
  access_mode: AccessMode;
  bundle_version: string;
  delivery_ip: string;
  user_name: string;
  password: string;
  vip: string;
  images: { image_name: string; version: string }[];
}

const emptyServiceForm = (): ServiceForm => ({
  enabled: false,
  service: '',
  service_custom_name: '',
  deploy_mode: 'BUNDLE',
  access_mode: 'REMOTE',
  bundle_version: '',
  delivery_ip: '',
  user_name: '',
  password: '',
  vip: '',
  images: [{ image_name: '', version: '' }],
});

/** 서비스 납품 정보 입력 섹션 (등록/수정 모달용) */
function ServiceInfoSection({ form, setForm }: { form: ServiceForm; setForm: (f: ServiceForm) => void }) {
  const [showPw, setShowPw] = useState(false);
  const patch = (p: Partial<ServiceForm>) => setForm({ ...form, ...p });

  const isVms = form.service === 'VMS';

  const { data: bundlesRes } = useQuery({
    queryKey: ['notion-bundles'],
    queryFn: notionCatalogApi.getBundles,
    enabled: form.enabled,
    staleTime: 5 * 60 * 1000,
  });
  const { data: imagesRes } = useQuery({
    queryKey: ['notion-images'],
    queryFn: notionCatalogApi.getImages,
    enabled: form.enabled,
    staleTime: 5 * 60 * 1000,
  });

  const bundlesConfigured = isVms && bundlesRes?.configured === true && (bundlesRes?.bundles.length ?? 0) > 0;
  const imagesConfigured  = isVms && imagesRes?.configured === true && (imagesRes?.images.length ?? 0) > 0;

  const selectedBundle = bundlesRes?.bundles.find(b => b.name === form.bundle_version);

  return (
    <div className="border border-gray-200 rounded-lg">
      <label className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={form.enabled}
          onChange={e => patch({ enabled: e.target.checked })}
          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-400"
        />
        <span className="text-sm font-medium text-gray-700">서비스 납품 정보</span>
        <span className="text-xs text-gray-400">(선택)</span>
      </label>

      {form.enabled && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
          {/* 서비스 선택 */}
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="서비스"
              value={form.service}
              onChange={v => patch({ service: v as ServiceKind, bundle_version: '', images: [{ image_name: '', version: '' }] })}
              options={[
                { value: 'VMS', label: 'VMS' },
                { value: 'NVR', label: 'NVR' },
                { value: 'ETC', label: '기타' },
              ]}
              placeholder="서비스 선택"
            />
            {form.service === 'ETC' && (
              <Input
                label="서비스명 (기타)"
                value={form.service_custom_name}
                onChange={e => patch({ service_custom_name: e.target.value })}
                placeholder="서비스명 입력"
              />
            )}
          </div>

          {/* 배포 방식 */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-1.5">배포 방식</p>
            <div className="flex gap-4">
              {(['BUNDLE', 'MANUAL'] as DeployMode[]).map(m => (
                <label key={m} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="deploy_mode"
                    checked={form.deploy_mode === m}
                    onChange={() => patch({ deploy_mode: m })}
                    className="text-indigo-600 focus:ring-indigo-400"
                  />
                  {DEPLOY_LABEL[m]}
                </label>
              ))}
            </div>
          </div>

          {/* 접속 방식 — 선택에 따라 아래 IP 입력 라벨·가이드가 바뀜 */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-1.5">접속 방식</p>
            <div className="flex gap-4">
              {(['REMOTE', 'CLOSED'] as AccessMode[]).map(m => (
                <label key={m} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="access_mode"
                    checked={form.access_mode === m}
                    onChange={() => patch({ access_mode: m })}
                    className="text-indigo-600 focus:ring-indigo-400"
                  />
                  {ACCESS_LABEL[m]}
                </label>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-1">{ACCESS_GUIDE[form.access_mode].hint}</p>
          </div>

          {/* Bundle */}
          {form.deploy_mode === 'BUNDLE' && (
            <div className="space-y-2">
              {bundlesConfigured ? (
                <>
                  <Select
                    label="번들 버전"
                    value={form.bundle_version}
                    onChange={v => patch({ bundle_version: v })}
                    options={(bundlesRes?.bundles ?? []).map(b => ({ value: b.name, label: b.name }))}
                    placeholder="번들 선택"
                  />
                  {selectedBundle && (
                    <div className="text-xs text-gray-500 space-y-1.5 bg-gray-50 rounded-lg px-3 py-2">
                      {selectedBundle.applied_sites.length > 0 && (
                        <div className="flex flex-wrap gap-1 items-center">
                          <span className="text-gray-400">적용 사이트:</span>
                          {selectedBundle.applied_sites.map(s => (
                            <span key={s} className="inline-block px-1.5 py-0.5 rounded bg-white border border-gray-200 text-gray-600">{s}</span>
                          ))}
                        </div>
                      )}
                      {Object.keys(selectedBundle.components).length > 0 && (
                        <div>
                          <span className="text-gray-400">구성 요소:</span>
                          <ul className="mt-1 space-y-0.5">
                            {Object.entries(selectedBundle.components).map(([k, v]) => (
                              <li key={k} className="text-gray-600"><span className="font-medium">{k}</span>: {v}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div>
                  <Input
                    label="번들 버전"
                    value={form.bundle_version}
                    onChange={e => patch({ bundle_version: e.target.value })}
                    placeholder="번들 버전 입력"
                  />
                  {isVms && bundlesRes?.configured === false && (
                    <p className="text-xs text-amber-600 mt-1">Notion 미연동 — 수동 입력</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Manual */}
          {form.deploy_mode === 'MANUAL' && (
            <div className="space-y-2">
              {imagesConfigured ? (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-gray-700">이미지 버전</p>
                  {[...new Set((imagesRes?.images ?? []).map(i => i.group))].map(group => {
                    const groupImages = (imagesRes?.images ?? []).filter(i => i.group === group);
                    // 그룹에 이미지가 1개뿐이고 이름이 그룹과 같으면 헤더 생략(Frontend/MediaMTX)
                    const single = groupImages.length === 1 && groupImages[0].image === group;
                    return (
                      <div key={group} className={single ? '' : 'rounded-lg bg-gray-50 border border-gray-100 p-2.5 space-y-1.5'}>
                        {!single && <p className="text-xs font-semibold text-gray-500">{group}</p>}
                        {groupImages.map(img => {
                          const current = form.images.find(r => r.image_name === img.image)?.version ?? '';
                          return (
                            <div key={img.image} className="grid grid-cols-3 gap-2 items-center">
                              <span className="text-sm text-gray-600">{single ? group : img.image}</span>
                              <div className="col-span-2">
                                <Select
                                  value={current}
                                  onChange={v => {
                                    const others = form.images.filter(r => r.image_name !== img.image);
                                    patch({ images: v ? [...others, { image_name: img.image, version: v }] : others });
                                  }}
                                  options={img.versions.map(vr => ({ value: vr, label: vr }))}
                                  placeholder="버전 선택 (미설정)"
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-700">이미지</p>
                    <button
                      type="button"
                      onClick={() => patch({ images: [...form.images, { image_name: '', version: '' }] })}
                      className="text-xs text-indigo-600 hover:underline cursor-pointer"
                    >+ 이미지 추가</button>
                  </div>
                  {isVms && imagesRes?.configured === false && (
                    <p className="text-xs text-amber-600">Notion 미연동 — 수동 입력</p>
                  )}
                  {form.images.map((row, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                      <Input
                        placeholder="이미지명"
                        value={row.image_name}
                        onChange={e => patch({ images: form.images.map((r, i) => i === idx ? { ...r, image_name: e.target.value } : r) })}
                      />
                      <Input
                        placeholder="버전"
                        value={row.version}
                        onChange={e => patch({ images: form.images.map((r, i) => i === idx ? { ...r, version: e.target.value } : r) })}
                      />
                      {form.images.length > 1 && (
                        <button
                          type="button"
                          onClick={() => patch({ images: form.images.filter((_, i) => i !== idx) })}
                          className="text-red-400 text-lg cursor-pointer"
                        >×</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 접속 정보 */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-1.5">접속 정보</p>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label={ACCESS_GUIDE[form.access_mode].ip}
                value={form.delivery_ip}
                onChange={e => patch({ delivery_ip: e.target.value })}
                placeholder={ACCESS_GUIDE[form.access_mode].ipPlaceholder}
              />
              <Input
                label={ACCESS_GUIDE[form.access_mode].vip}
                value={form.vip}
                onChange={e => patch({ vip: e.target.value })}
                placeholder={ACCESS_GUIDE[form.access_mode].vipPlaceholder}
              />
              <Input label="User" value={form.user_name} onChange={e => patch({ user_name: e.target.value })} placeholder="사용자" />
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">Password</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={form.password}
                    onChange={e => patch({ password: e.target.value })}
                    placeholder="비밀번호"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600 cursor-pointer"
                  >{showPw ? '숨김' : '표시'}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** 서비스 납품 정보 읽기 전용 (상세 모달용) */
function ServiceInfoDetail({ info }: { info: ServiceInfo }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 space-y-2 text-sm">
      <p className="font-medium text-gray-700">서비스 납품 정보</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className="text-gray-500">서비스:</span>
          <span className="ml-1">
            {SERVICE_LABEL[info.service] ?? info.service}
            {info.service === 'ETC' && info.service_custom_name ? ` (${info.service_custom_name})` : ''}
          </span>
        </div>
        <div><span className="text-gray-500">배포 방식:</span> <span className="ml-1">{DEPLOY_LABEL[info.deploy_mode] ?? info.deploy_mode}</span></div>
        <div>
          <span className="text-gray-500">접속 방식:</span>
          <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded font-medium ${
            (info.access_mode ?? 'REMOTE') === 'CLOSED' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-600'
          }`}>{ACCESS_LABEL[info.access_mode ?? 'REMOTE']}</span>
        </div>
      </div>

      {info.deploy_mode === 'BUNDLE' ? (
        <div><span className="text-gray-500">번들 버전:</span> <span className="ml-1">{info.bundle_version || '-'}</span></div>
      ) : (
        <div>
          <span className="text-gray-500">이미지:</span>
          {info.images.length > 0 ? (
            <div className="mt-1.5 border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm table-fixed">
                <colgroup><col style={{ width: '45%' }} /><col style={{ width: '55%' }} /></colgroup>
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="text-left font-medium px-3 py-1.5 border-b border-gray-200">이미지</th>
                    <th className="text-left font-medium px-3 py-1.5 border-b border-gray-200">버전</th>
                  </tr>
                </thead>
                <tbody>
                  {info.images.map((im, i) => (
                    <tr key={i} className="border-b border-gray-100 last:border-0">
                      <td className="px-3 py-1.5 font-medium text-gray-700 truncate">{im.image_name}</td>
                      <td className="px-3 py-1.5 font-mono text-gray-700 truncate">{im.version}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <span className="ml-1 text-gray-400">-</span>}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-gray-100">
        <div><span className="text-gray-500">{ACCESS_GUIDE[info.access_mode ?? 'REMOTE'].ip}:</span> <span className="ml-1 font-mono">{info.delivery_ip || '-'}</span></div>
        <div><span className="text-gray-500">{ACCESS_GUIDE[info.access_mode ?? 'REMOTE'].vip}:</span> <span className="ml-1 font-mono">{info.vip || '-'}</span></div>
        <div><span className="text-gray-500">User:</span> <span className="ml-1">{info.user_name || '-'}</span></div>
        <div><span className="text-gray-500">Password:</span> <span className="ml-1 font-mono">{info.password || '-'}</span></div>
      </div>
    </div>
  );
}

/** 납품 상태 타임라인 (진행 이력) */
function ShipmentTimeline({ shipment }: { shipment: Shipment }) {
  type Step = { label: string; at: string | null | undefined; icon: string; note?: string | null };
  const steps: Step[] = [
    { label: '납품일정 등록', at: shipment.created_at, icon: '📝' },
    // 발송 단계는 폐지됐다 — 그 전에 처리된 문서만 이력에 남긴다
    ...(shipment.shipped_at ? [{ label: '발송 처리', at: shipment.shipped_at, icon: '🚚' }] : []),
    ...(shipment.status === 'CANCELLED'
      ? [{ label: '취소',       at: shipment.cancelled_at, icon: '❌', note: shipment.cancel_reason }]
      : shipment.status === 'RETRIEVED'
        ? [
            { label: '납품 완료', at: shipment.confirmed_at, icon: '✅' },
            { label: '회수',      at: shipment.retrieved_at, icon: '↩️', note: shipment.retrieve_reason },
          ]
        : [{ label: '납품 완료', at: shipment.confirmed_at, icon: '✅' }]
    ),
  ];

  return (
    <div className="flex items-start gap-0">
      {steps.map((step, i) => {
        const done = !!step.at;
        return (
          <Fragment key={i}>
            <div className="flex flex-col items-center min-w-[100px]">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm border-2 ${
                done
                  ? step.icon === '❌' ? 'bg-red-100 border-red-400'
                    : step.icon === '↩️' ? 'bg-orange-100 border-orange-400'
                    : 'bg-indigo-100 border-indigo-500'
                  : 'bg-gray-100 border-gray-300'
              }`}>
                {done ? step.icon : <span className="text-gray-400 text-xs">●</span>}
              </div>
              <p className={`text-xs font-medium mt-1 ${done ? (step.icon === '❌' || step.icon === '↩️' ? 'text-orange-600' : 'text-gray-800') : 'text-gray-400'}`}>
                {step.label}
              </p>
              {step.at && (
                <p className="text-[10px] text-gray-400 mt-0.5 text-center">
                  {new Date(step.at).toLocaleDateString('ko-KR')}
                </p>
              )}
              {step.note && (
                <p className="text-[10px] text-red-500 mt-0.5 text-center max-w-[90px] break-words">{step.note}</p>
              )}
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-0.5 mt-4 ${done ? 'bg-indigo-300' : 'bg-gray-200'}`} />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

/** 고객사 카드 (고객사별 그룹 뷰) */
function CustomerCard({
  customer, shipments, onSelect,
}: {
  customer: string;
  shipments: Shipment[];
  onSelect: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  const statusCount = shipments.reduce<Record<string, number>>((acc, s) => {
    acc[s.status] = (acc[s.status] ?? 0) + 1;
    return acc;
  }, {});

  const latestAt = shipments.reduce((latest, s) => {
    const t = new Date(s.updated_at).getTime();
    return t > latest ? t : latest;
  }, 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* 고객사 헤더 */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors text-left"
      >
        <span className="font-semibold text-gray-800">{customer}</span>
        <span className="text-sm text-gray-400">{shipments.length}건</span>
        <div className="flex gap-1.5 ml-1">
          {Object.entries(statusCount).map(([st, cnt]) => (
            <Badge key={st} label={`${STATUS_LABEL[st] ?? st} ${cnt}`} color={statusColor(st)} />
          ))}
        </div>
        <span className="ml-auto text-xs text-gray-400">
          최근 {new Date(latestAt).toLocaleDateString('ko-KR')}
        </span>
        <span className="text-xs text-gray-400 ml-2">{expanded ? '▲' : '▼'}</span>
      </button>

      {/* 납품 목록 */}
      {expanded && (
        <table className="w-full text-sm border-t border-gray-100 table-fixed">
          <colgroup>
            <col className="w-[160px]" />
            <col />
            <col className="w-[180px]" />
            <col className="w-[90px]" />
            <col className="w-[96px]" />
            <col className="w-[80px]" />
            <col className="w-[80px]" />
          </colgroup>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">납품번호</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">납품명</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">품목</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">상태</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">납품완료일</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">담당자</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">최근변경</th>
            </tr>
          </thead>
          <tbody>
            {shipments.map(s => (
              <tr
                key={s.shipment_id}
                className="border-b border-gray-50 last:border-0 hover:bg-indigo-50 cursor-pointer transition-colors"
                onClick={() => onSelect(s.shipment_id)}
              >
                <td className="px-4 py-2.5 font-mono text-xs text-gray-500 truncate">{s.shipment_id}</td>
                <td className="px-4 py-2.5 text-gray-700 truncate">{s.title}</td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {s.items?.slice(0, 2).map(i => (
                      <span key={i.shipment_item_id} className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 truncate max-w-[140px]">
                        {i.item?.item_name ?? i.item_code}
                        {(i.serial_number_ids?.length ?? 0) > 0 && (
                          <span className="ml-1 text-blue-500">×{i.serial_number_ids!.length}</span>
                        )}
                      </span>
                    ))}
                    {(s.items?.length ?? 0) > 2 && (
                      <span className="text-xs text-gray-400">+{(s.items?.length ?? 0) - 2}개</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <Badge label={STATUS_LABEL[s.status] ?? s.status} color={statusColor(s.status)} />
                </td>
                <td className="px-4 py-2.5 text-xs text-gray-500">
                  {s.confirmed_at ? new Date(s.confirmed_at).toLocaleDateString('ko-KR') : '-'}
                </td>
                <td className="px-4 py-2.5 text-xs text-gray-600 truncate">{s.assignee?.name ?? '-'}</td>
                <td className="px-4 py-2.5 text-xs text-gray-400">
                  {new Date(s.updated_at).toLocaleDateString('ko-KR')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function ShipmentsPage() {
  const qc = useQueryClient();
  const { hasPermission } = useAuthStore();

  const { data = [], isLoading } = useQuery({ queryKey: ['shipments'], queryFn: shipmentsApi.findAll });
  const { data: items = [] }      = useQuery({ queryKey: ['items'],     queryFn: itemsApi.findAll });
  const { data: storages = [] }   = useQuery({ queryKey: ['storage'],   queryFn: storageApi.findAll });
  const { data: employees = [] }  = useQuery({ queryKey: ['employees-active'], queryFn: employeesApi.findActiveList });

  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget]     = useState<string | null>(null);
  const [cancelReason, setCancelReason]     = useState('');
  const [retrieveTarget, setRetrieveTarget]   = useState<string | null>(null);
  const [shipTarget, setShipTarget]           = useState<string | null>(null);  // 납품 완료 확인(사진 첨부) 모달
  const [shipPhotos, setShipPhotos]           = useState<SerialPhotoMap>({});
  const [retrievePhotos, setRetrievePhotos]   = useState<SerialPhotoMap>({});
  const [retrieveReason, setRetrieveReason]   = useState('');
  const [retrieveStorage, setRetrieveStorage] = useState('');
  const [retrieveSerialIds, setRetrieveSerialIds] = useState<number[]>([]);
  const retrieveInitRef = useRef(false);

  const { data: detail } = useQuery({
    queryKey: ['shipment', detailId],
    queryFn: () => shipmentsApi.findOne(detailId!),
    enabled: !!detailId,
  });

  // 납품 완료 모달용 — 해당 납품건에 배정된 S/N 목록 (사진 등록 대상)
  const { data: shipSerials = [] } = useQuery({
    queryKey: ['shipment-ship-serials', shipTarget],
    queryFn: async () => {
      const shp = await shipmentsApi.findOne(shipTarget!);
      const snItems = (shp.items ?? []).filter((i: any) => (i.serial_number_ids?.length ?? 0) > 0);
      const lists = await Promise.all(snItems.map((i: any) => serialNumbersApi.findByShipmentItem(i.shipment_item_id)));
      return lists.flat();
    },
    enabled: !!shipTarget,
  });

  // 회수 모달용 — 해당 납품건의 납품된(SHIPPED) S/N 목록 (회수 대상)
  const { data: retrieveSerials = [] } = useQuery({
    queryKey: ['shipment-retrieve-serials', retrieveTarget],
    queryFn: async () => {
      const shp = await shipmentsApi.findOne(retrieveTarget!);
      const snItems = (shp.items ?? []).filter((i: any) => (i.serial_number_ids?.length ?? 0) > 0);
      const lists = await Promise.all(snItems.map((i: any) => serialNumbersApi.findByShipmentItem(i.shipment_item_id)));
      return lists.flat().filter((sn: SerialNumber) => sn.status === 'SHIPPED');
    },
    enabled: !!retrieveTarget,
  });
  // 회수 모달 오픈 시 전체 선택으로 1회 초기화
  useEffect(() => {
    if (retrieveTarget && !retrieveInitRef.current && retrieveSerials.length > 0) {
      setRetrieveSerialIds(retrieveSerials.map((s: SerialNumber) => s.id));
      retrieveInitRef.current = true;
    }
  }, [retrieveTarget, retrieveSerials]);

  const [title, setTitle]           = useState('');
  const [customer, setCustomer]     = useState('');
  const [delivDate, setDelivDate]   = useState('');
  const [note, setNote]             = useState('');
  const [assigneeManNo, setAssigneeManNo] = useState('');
  const [sItems, setSItems] = useState<ItemForm[]>([
    { item_code: '', storage_code: '', quantity: '', serial_number_ids: [] }
  ]);
  const [serviceForm, setServiceForm] = useState<ServiceForm>(emptyServiceForm());
  const [serviceEditId, setServiceEditId] = useState<string | null>(null);

  const resetForm = () => {
    setTitle(''); setCustomer(''); setDelivDate(''); setNote(''); setAssigneeManNo('');
    setSItems([{ item_code: '', storage_code: '', quantity: '', serial_number_ids: [] }]);
    setServiceForm(emptyServiceForm());
  };

  const getItem = (item_code: string) => items.find(i => i.item_code === item_code);

  const openEdit = (s: Shipment) => {
    setEditingId(s.shipment_id);
    setTitle(s.title); setCustomer(s.customer_name);
    setDelivDate(s.delivery_date ?? ''); setNote(s.note ?? '');
    setAssigneeManNo(s.assignee_man_no ?? '');
    setSItems(s.items?.map(i => ({
      item_code: i.item_code,
      storage_code: i.storage_code,
      quantity: String(i.quantity),
      serial_number_ids: (i as any).serial_number_ids ?? [],
    })) ?? [{ item_code: '', storage_code: '', quantity: '', serial_number_ids: [] }]);
    const si = s.service_info;
    setServiceForm(si ? {
      enabled: true,
      service: si.service,
      service_custom_name: si.service_custom_name ?? '',
      deploy_mode: si.deploy_mode,
      access_mode: si.access_mode ?? 'REMOTE',
      bundle_version: si.bundle_version ?? '',
      delivery_ip: si.delivery_ip ?? '',
      user_name: si.user_name ?? '',
      password: si.password ?? '',
      vip: si.vip ?? '',
      images: si.images.length > 0 ? si.images.map(im => ({ ...im })) : [{ image_name: '', version: '' }],
    } : emptyServiceForm());
    setDetailId(null);
    setCreateOpen(true);
  };

  /** 서비스 납품 정보만 수정 (납품 상태 무관, 기존 등록 건 보완용) */
  const openServiceEdit = (s: Shipment) => {
    const si = s.service_info;
    setServiceForm(si ? {
      enabled: true,
      service: si.service,
      service_custom_name: si.service_custom_name ?? '',
      deploy_mode: si.deploy_mode,
      access_mode: si.access_mode ?? 'REMOTE',
      bundle_version: si.bundle_version ?? '',
      delivery_ip: si.delivery_ip ?? '',
      user_name: si.user_name ?? '',
      password: si.password ?? '',
      vip: si.vip ?? '',
      images: si.images.length > 0 ? si.images.map(im => ({ ...im })) : [{ image_name: '', version: '' }],
    } : { ...emptyServiceForm(), enabled: true });
    setServiceEditId(s.shipment_id);
    setDetailId(null);
  };

  const createMut  = useMutation({ mutationFn: (dto: CreateShipmentDto) => shipmentsApi.create(dto), onSuccess: () => { qc.invalidateQueries({ queryKey: ['shipments'] }); setCreateOpen(false); resetForm(); } });
  const updateMut  = useMutation({ mutationFn: ({ id, dto }: { id: string; dto: CreateShipmentDto }) => shipmentsApi.update(id, dto), onSuccess: () => { qc.invalidateQueries({ queryKey: ['shipments'] }); setCreateOpen(false); resetForm(); setEditingId(null); } });
  const invalidateSnCache = () => {
    detail?.items?.forEach(item => {
      qc.invalidateQueries({ queryKey: ['sn-by-shipment-item', item.shipment_item_id] });
    });
  };

  // 납품 완료 — 이 시점에 재고가 차감된다 (발송 단계 폐지)
  const shipMut = useMutation({
    mutationFn: ({ id }: { id: string }) => shipmentsApi.confirm(id),
    onSuccess: async (_, vars) => {
      await uploadSerialPhotos(shipPhotos, 'SHIP', vars.id);
      setShipPhotos({});
      setShipTarget(null);
      qc.invalidateQueries({ queryKey: ['shipments'] });
      qc.invalidateQueries({ queryKey: ['shipment', detailId] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      invalidateSnCache();
    },
  });
  const cancelMut  = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => shipmentsApi.cancel(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shipments'] });
      qc.invalidateQueries({ queryKey: ['shipment', detailId] });
      setCancelTarget(null);
      setCancelReason('');
    },
  });

  const retrieveMut = useMutation({
    mutationFn: ({ id, reason, storageCode, serialIds }: { id: string; reason: string; storageCode?: string; serialIds?: number[] }) =>
      shipmentsApi.retrieve(id, reason, storageCode, serialIds),
    onSuccess: async (_, vars) => {
      await uploadSerialPhotos(retrievePhotos, 'RETURN', vars.id);
      setRetrievePhotos({});
      qc.invalidateQueries({ queryKey: ['shipments'] });
      qc.invalidateQueries({ queryKey: ['shipment', detailId] });
      qc.invalidateQueries({ queryKey: ['shipment-retrieve-serials'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      invalidateSnCache();
      setRetrieveTarget(null);
      setRetrieveReason('');
      setRetrieveStorage('');
      setRetrieveSerialIds([]);
    },
  });

  const itemOptions    = items.filter(i => i.is_active !== 0).map(i => ({ value: i.item_code, label: `${i.item_name} (${i.item_code})` }));
  const storageOptions = storages.map(s => ({ value: s.storage_code, label: `${s.storage_name} (${s.storage_code})` }));

  const updateItem = (idx: number, field: keyof Omit<ItemForm, 'serial_number_ids'>, val: string) =>
    setSItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: val } : item));

  const employeeOptions = [
    { value: '', label: '미지정' },
    ...employees.map(e => ({ value: e.man_no, label: `${e.name} (${e.man_no})` })),
  ];

  const serviceInfoMut = useMutation({
    mutationFn: ({ id, info }: { id: string; info: ServiceInfo }) => shipmentsApi.updateServiceInfo(id, info),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['shipments'] });
      qc.invalidateQueries({ queryKey: ['shipment', v.id] });
      setServiceEditId(null);
    },
    onError: (err: any) => alert(err?.response?.data?.message ?? '오류가 발생했습니다.'),
  });

  const buildServiceInfo = (): ServiceInfo | undefined => {
    if (!serviceForm.enabled || !serviceForm.service) return undefined;
    return {
      service: serviceForm.service,
      service_custom_name: serviceForm.service === 'ETC' ? (serviceForm.service_custom_name || null) : null,
      deploy_mode: serviceForm.deploy_mode,
      access_mode: serviceForm.access_mode,
      bundle_version: serviceForm.deploy_mode === 'BUNDLE' ? (serviceForm.bundle_version || null) : null,
      delivery_ip: serviceForm.delivery_ip || null,
      user_name: serviceForm.user_name || null,
      password: serviceForm.password || null,
      vip: serviceForm.vip || null,
      images: serviceForm.deploy_mode === 'MANUAL'
        ? serviceForm.images.filter(im => im.image_name && im.version)
        : [],
    };
  };

  const buildDto = (): CreateShipmentDto => ({
    title, customer_name: customer, delivery_date: delivDate || undefined, note,
    assignee_man_no: assigneeManNo || undefined,
    items: sItems.filter(i => i.item_code && i.storage_code)
      .map(i => {
        const useSerial = getItem(i.item_code)?.use_serial === 1;
        return {
          item_code: i.item_code,
          storage_code: i.storage_code,
          quantity: useSerial ? i.serial_number_ids.length : Number(i.quantity),
          serial_number_ids: useSerial ? i.serial_number_ids : undefined,
        };
      }),
    service_info: buildServiceInfo(),
  });

  const handleCreate = () => {
    if (!title.trim() || !customer.trim()) return;
    if (editingId) updateMut.mutate({ id: editingId, dto: buildDto() });
    else createMut.mutate(buildDto());
  };

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'customer'>('customer');

  // 태그/S/N 검색
  const { data: tagSearchResults = [] } = useQuery({
    queryKey: ['sn-search', filterTag],
    queryFn: () => serialNumbersApi.search(filterTag),
    enabled: filterTag.trim().length >= 2,
  });
  const matchingShipmentItemIds = useMemo(
    () => new Set(tagSearchResults.map(sn => sn.shipment_item_id).filter(Boolean)),
    [tagSearchResults],
  );

  const filtered = data.filter(r => {
    if (statusFilter && r.status !== statusFilter) return false;
    if (filterAssignee && (r.assignee_man_no ?? '') !== filterAssignee) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!(r.shipment_id.toLowerCase().includes(q) || r.title.toLowerCase().includes(q) || r.customer_name.toLowerCase().includes(q)))
        return false;
    }
    if (filterTag.trim().length >= 2) {
      const hit = r.items?.some(i => matchingShipmentItemIds.has(i.shipment_item_id));
      if (!hit) return false;
    }
    if (dateFrom && new Date(r.updated_at) < new Date(dateFrom)) return false;
    if (dateTo   && new Date(r.updated_at) > new Date(dateTo + 'T23:59:59')) return false;
    return true;
  });

  // 고객사별 그룹
  const customerGroups = useMemo(() => {
    const groups: Record<string, Shipment[]> = {};
    filtered.forEach(s => {
      if (!groups[s.customer_name]) groups[s.customer_name] = [];
      groups[s.customer_name].push(s);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b, 'ko'));
  }, [filtered]);

  const hasExtraFilter = filterAssignee || filterTag || dateFrom || dateTo;

  const id = detailId ?? '';

  const columns = [
    { key: 'shipment_id',   header: '납품번호', render: (r: Shipment) => <span className="font-mono text-xs text-gray-500">{r.shipment_id}</span> },
    { key: 'title',         header: '납품명',   render: (r: Shipment) => <span className="font-medium">{r.title}</span> },
    { key: 'customer_name', header: '고객사' },
    { key: 'createdBy',     header: '생성자',   render: (r: Shipment) => r.createdBy?.name ?? r.man_no },
    { key: 'confirmedBy',   header: '납품완료자', render: (r: Shipment) => r.confirmedBy?.name ?? '-' },
    { key: 'delivery_date', header: '납품예정일', render: (r: Shipment) => r.delivery_date ?? '-' },
    { key: 'status',        header: '상태',     render: (r: Shipment) => <Badge label={STATUS_LABEL[r.status] ?? r.status} color={statusColor(r.status)} /> },
    { key: 'created_at',    header: '등록일',   render: (r: Shipment) => new Date(r.created_at).toLocaleDateString('ko-KR') },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 justify-between">
        <div className="flex gap-2 items-center flex-wrap">
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="납품번호·납품명·고객사 검색"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 w-56"
          />
          <input
            value={filterTag} onChange={e => setFilterTag(e.target.value)}
            placeholder="S/N · 태그 값 검색 (예: i7-14700K)"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 w-56"
          />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
            <option value="">전체 상태</option>
            <option value="DRAFT">납품예정</option>
            <option value="CONFIRMED">납품완료</option>
            <option value="CANCELLED">취소됨</option>
            <option value="RETRIEVED">회수됨</option>
          </select>
          <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
            <option value="">전체 담당자</option>
            {employees.map(e => <option key={e.man_no} value={e.man_no}>{e.name} ({e.man_no})</option>)}
          </select>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <span className="text-sm text-gray-500">{filtered.length}건</span>
          {hasExtraFilter && (
            <button
              onClick={() => { setFilterAssignee(''); setFilterTag(''); setDateFrom(''); setDateTo(''); }}
              className="text-xs text-indigo-500 hover:underline cursor-pointer"
            >필터 초기화</button>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {/* 뷰 토글 */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
            <button
              onClick={() => setViewMode('customer')}
              className={`px-3 py-1.5 transition-colors ${viewMode === 'customer' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >고객사별</button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 transition-colors ${viewMode === 'table' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >목록</button>
          </div>
          {hasPermission('shipment:create') && <Button onClick={() => setCreateOpen(true)}>+ 납품 일정 추가</Button>}
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-gray-400 text-sm">불러오는 중...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-gray-400 text-sm">납품 현황이 없습니다.</div>
      ) : viewMode === 'customer' ? (
        <div className="space-y-3">
          {customerGroups.map(([customer, slist]) => (
            <CustomerCard
              key={customer}
              customer={customer}
              shipments={slist}
              onSelect={setDetailId}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <Table columns={columns} data={filtered} rowKey={r => r.shipment_id} loading={isLoading} onRowClick={r => setDetailId(r.shipment_id)} />
        </div>
      )}

      {/* 등록/수정 모달 */}
      <Modal open={createOpen} onClose={() => { setCreateOpen(false); resetForm(); setEditingId(null); }} title={editingId ? '납품 수정' : '납품 일정 추가'} size="lg">
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="납품명 *" value={title} onChange={e => setTitle(e.target.value)} placeholder="납품 건명" />
            <Input label="고객사명 *" value={customer} onChange={e => setCustomer(e.target.value)} placeholder="고객사명" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="납품 예정일" type="date" value={delivDate} onChange={e => setDelivDate(e.target.value)} />
            <Select label="담당자" value={assigneeManNo} onChange={setAssigneeManNo} options={employeeOptions} placeholder="미지정" />
          </div>
          <Textarea label="메모" value={note} onChange={e => setNote(e.target.value)} />

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-700">납품 품목</p>
              <button
                onClick={() => setSItems(p => [...p, { item_code: '', storage_code: '', quantity: '', serial_number_ids: [] }])}
                className="text-xs text-indigo-600 hover:underline cursor-pointer"
              >+ 추가</button>
            </div>
            {sItems.map((item, idx) => {
              const useSerial = getItem(item.item_code)?.use_serial === 1;
              return (
                <div key={idx} className="p-3 bg-gray-50 rounded-lg mb-2 space-y-2">
                  <div className="grid grid-cols-4 gap-2 items-start">
                    <Select placeholder="품목" value={item.item_code} onChange={v => updateItem(idx, 'item_code', v)} options={itemOptions} />
                    <Select placeholder="창고" value={item.storage_code} onChange={v => updateItem(idx, 'storage_code', v)} options={storageOptions} />
                    {useSerial
                      ? <div className="text-xs text-blue-600 self-center">S/N 선택으로 결정</div>
                      : <Input type="number" placeholder="수량" value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} />
                    }
                    {sItems.length > 1 && (
                      <button onClick={() => setSItems(p => p.filter((_, i) => i !== idx))} className="text-red-400 text-lg cursor-pointer self-center">×</button>
                    )}
                  </div>
                  {useSerial && item.item_code && item.storage_code && (
                    <SerialPicker
                      item_code={item.item_code}
                      storage_code={item.storage_code}
                      selected={item.serial_number_ids}
                      onChange={ids => setSItems(p => p.map((it, i) => i === idx ? { ...it, serial_number_ids: ids } : it))}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <ServiceInfoSection form={serviceForm} setForm={setServiceForm} />

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" onClick={() => { setCreateOpen(false); resetForm(); setEditingId(null); }}>닫기</Button>
            <Button onClick={handleCreate} loading={createMut.isPending || updateMut.isPending} disabled={!title.trim() || !customer.trim()}>저장</Button>
          </div>
        </div>
      </Modal>

      {/* 취소 사유 모달 */}
      <Modal
        open={!!cancelTarget}
        onClose={() => { setCancelTarget(null); setCancelReason(''); }}
        title="납품 취소"
        size="sm"
      >
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-500">취소 후에는 재고가 복구되며 되돌릴 수 없습니다.</p>
          <Textarea
            label="취소 사유 *"
            value={cancelReason}
            onChange={e => setCancelReason(e.target.value)}
            placeholder="취소 사유를 입력하세요"
            rows={3}
          />
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => { setCancelTarget(null); setCancelReason(''); }}>닫기</Button>
            <Button
              onClick={() => cancelMut.mutate({ id: cancelTarget!, reason: cancelReason })}
              loading={cancelMut.isPending}
              disabled={!cancelReason.trim()}
            >
              취소 확정
            </Button>
          </div>
        </div>
      </Modal>

      {/* 회수 사유 모달 — S/N 선택(부분 회수) */}
      <Modal
        open={!!retrieveTarget}
        onClose={() => { setRetrieveTarget(null); setRetrieveReason(''); setRetrieveStorage(''); setRetrieveSerialIds([]); }}
        title="납품 회수"
        size="md"
      >
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-500">회수 처리 시 재고가 복구되며 S/N 상태가 원복됩니다.</p>
          <Select
            label="반납 창고 *"
            value={retrieveStorage}
            onChange={setRetrieveStorage}
            options={storageOptions}
            placeholder="창고 선택"
          />

          {/* 회수할 S/N 선택 (부분 회수) */}
          {retrieveSerials.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-600">회수할 S/N — {retrieveSerialIds.length}/{retrieveSerials.length}개</span>
                <button
                  type="button"
                  onClick={() => setRetrieveSerialIds(
                    retrieveSerialIds.length === retrieveSerials.length ? [] : retrieveSerials.map((s: SerialNumber) => s.id)
                  )}
                  className="text-xs text-indigo-600 hover:underline"
                >{retrieveSerialIds.length === retrieveSerials.length ? '전체 해제' : '전체 선택'}</button>
              </div>
              <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto divide-y divide-gray-50">
                {retrieveSerials.map((sn: SerialNumber) => {
                  const checked = retrieveSerialIds.includes(sn.id);
                  return (
                    <label key={sn.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setRetrieveSerialIds(prev => checked ? prev.filter(id => id !== sn.id) : [...prev, sn.id])}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-400"
                      />
                      <span className="font-mono text-xs text-gray-700">{sn.serial_no}</span>
                      <span className="text-xs text-gray-400 ml-auto">{(sn as any).tags?.['모델명'] ?? ''}</span>
                    </label>
                  );
                })}
              </div>
              {retrieveSerialIds.length < retrieveSerials.length && retrieveSerialIds.length > 0 && (
                <p className="text-xs text-amber-600">선택한 {retrieveSerialIds.length}개만 부분 회수됩니다. 나머지는 납품 상태로 유지됩니다.</p>
              )}
            </div>
          )}

          <Textarea
            label="회수 사유 *"
            value={retrieveReason}
            onChange={e => setRetrieveReason(e.target.value)}
            placeholder="회수 사유를 입력하세요"
            rows={3}
          />
          <SerialPhotoPicker
            targets={retrieveSerials
              .filter((sn: SerialNumber) => retrieveSerialIds.includes(sn.id))
              .map((sn: SerialNumber) => ({ key: String(sn.id), label: sn.serial_no, sub: sn.asset_no ?? undefined }))}
            value={retrievePhotos}
            onChange={setRetrievePhotos}
            label="회수 사진"
            hint="회수한 장비의 실물 상태와 보관 위치를 장비별로 남겨두면 이후 담당자가 확인할 수 있습니다."
            emptyText="회수할 S/N을 선택하면 장비별로 사진을 등록할 수 있습니다."
          />

          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => { setRetrieveTarget(null); setRetrieveReason(''); setRetrieveStorage(''); setRetrieveSerialIds([]); setRetrievePhotos({}); }}>닫기</Button>
            <Button
              onClick={() => retrieveMut.mutate({
                id: retrieveTarget!,
                reason: retrieveReason,
                storageCode: retrieveStorage || undefined,
                serialIds: retrieveSerials.length > 0 ? retrieveSerialIds : undefined,
              })}
              loading={retrieveMut.isPending}
              disabled={!retrieveReason.trim() || !retrieveStorage || (retrieveSerials.length > 0 && retrieveSerialIds.length === 0)}
            >
              회수 확정
            </Button>
          </div>
        </div>
      </Modal>

      {/* 납품 완료 모달 — 납품한 실물 사진을 남긴다 */}
      <Modal open={!!shipTarget} onClose={() => { setShipTarget(null); setShipPhotos({}); }} title="납품 완료" size="lg">
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-600">
            납품 완료 처리하면 재고가 차감됩니다. 납품한 실물 사진을 남겨두면 이후 담당자가 어떤 외관의 장비가 어디로 갔는지 확인할 수 있습니다.
          </p>
          <SerialPhotoPicker
            targets={shipSerials.map((sn: SerialNumber) => ({ key: String(sn.id), label: sn.serial_no, sub: sn.asset_no ?? undefined }))}
            value={shipPhotos}
            onChange={setShipPhotos}
            label="납품 사진"
            hint="장비마다 따로 등록합니다."
            emptyText="이 납품 건에는 S/N 관리 품목이 없어 장비별 사진을 등록할 수 없습니다."
          />
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => { setShipTarget(null); setShipPhotos({}); }}>취소</Button>
            <Button
              onClick={() => shipMut.mutate({ id: shipTarget! })}
              loading={shipMut.isPending}
            >납품 완료 확정 (재고차감)</Button>
          </div>
        </div>
      </Modal>

      {/* 상세 모달 */}
      <Modal open={!!detailId} onClose={() => setDetailId(null)} title="납품 상세" size="2xl">
        {detail && (
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">납품번호:</span> <span className="font-mono ml-1">{detail.shipment_id}</span></div>
              <div><span className="text-gray-500">상태:</span> <Badge label={STATUS_LABEL[detail.status]} color={statusColor(detail.status)} className="ml-1" /></div>
              <div><span className="text-gray-500">납품명:</span> <strong className="ml-1">{detail.title}</strong></div>
              <div><span className="text-gray-500">고객사:</span> <span className="ml-1">{detail.customer_name}</span></div>
              <div><span className="text-gray-500">생성자:</span> <span className="ml-1">{detail.createdBy?.name ?? detail.man_no}</span></div>
              <div><span className="text-gray-500">담당자:</span> <span className="ml-1">{detail.assignee?.name ?? <span className="text-gray-400">미지정</span>}</span></div>
              {detail.confirmedBy && <div><span className="text-gray-500">납품완료자:</span> <span className="ml-1">{detail.confirmedBy.name}</span></div>}
              {detail.delivery_date && <div><span className="text-gray-500">납품예정일:</span> <span className="ml-1">{detail.delivery_date}</span></div>}
              {detail.shipped_at && <div><span className="text-gray-500">발송일시:</span> <span className="ml-1">{new Date(detail.shipped_at).toLocaleString('ko-KR')}</span></div>}
              {detail.cancelled_at && <div><span className="text-gray-500">취소일시:</span> <span className="ml-1">{new Date(detail.cancelled_at).toLocaleString('ko-KR')}</span></div>}
              {detail.retrieved_at && <div><span className="text-gray-500">회수일시:</span> <span className="ml-1">{new Date(detail.retrieved_at).toLocaleString('ko-KR')}</span></div>}
              {detail.retrievedBy && <div><span className="text-gray-500">회수처리자:</span> <span className="ml-1">{detail.retrievedBy.name}</span></div>}
            </div>
            {detail.cancel_reason && (
              <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-2.5 text-sm">
                <span className="text-red-500 font-medium">취소 사유:</span>
                <span className="ml-2 text-red-700">{detail.cancel_reason}</span>
              </div>
            )}

            {/* 진행 이력 타임라인 */}
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">진행 이력</p>
              <ShipmentTimeline shipment={detail} />
            </div>

            <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
              <thead className="bg-gray-50"><tr>
                <th className="px-3 py-2 text-left text-gray-600">품목</th>
                <th className="px-3 py-2 text-left text-gray-600">창고</th>
                <th className="px-3 py-2 text-right text-gray-600">수량</th>
              </tr></thead>
              <tbody>
                {detail.items?.map(item => (
                  <Fragment key={item.shipment_item_id}>
                    <tr className="border-t border-gray-100">
                      <td className="px-3 py-2">
                        {item.item?.item_name ?? item.item_code}
                        {(item.serial_number_ids?.length ?? 0) > 0 && (
                          <span className="ml-1 text-xs text-blue-500">S/N</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-500">{item.storage?.storage_name ?? item.storage_code}</td>
                      <td className="px-3 py-2 text-right font-medium">{item.quantity.toLocaleString()}</td>
                    </tr>
                    <ShipmentItemSnList item={item} />
                  </Fragment>
                ))}
              </tbody>
            </table>

            {detail.service_info && <ServiceInfoDetail info={detail.service_info} />}

            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">장비 사진</p>
              <AssetImageGallery eventType="SHIP" eventNo={detail.shipment_id} canDelete={hasPermission('shipment:update')} />
            </div>

            <div className="flex gap-2 justify-end pt-2">
              {hasPermission('shipment:update') && (
                <Button variant="secondary" onClick={() => openServiceEdit(detail)}>
                  {detail.service_info ? '서비스 정보 수정' : '서비스 정보 추가'}
                </Button>
              )}
              {detail.status === 'DRAFT' && hasPermission('shipment:update') && (
                <Button variant="secondary" onClick={() => openEdit(detail)}>수정</Button>
              )}
              {detail.status === 'DRAFT' && hasPermission('shipment:confirm') && (
                <Button onClick={() => { setDetailId(null); setShipPhotos({}); setShipTarget(id); }}>납품 완료 (재고차감)</Button>
              )}
              {detail.status === 'DRAFT' && hasPermission('shipment:cancel') && (
                <Button variant="secondary" onClick={() => { setDetailId(null); setCancelTarget(id); }}>취소</Button>
              )}
              {detail.status === 'CONFIRMED' && hasPermission('shipment:retrieve') && (
                <Button variant="danger" onClick={() => { setDetailId(null); retrieveInitRef.current = false; setRetrieveSerialIds([]); setRetrieveTarget(id); }}>회수 처리</Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* 서비스 납품 정보 수정 모달 (상태 무관) */}
      <Modal open={!!serviceEditId} onClose={() => setServiceEditId(null)} title="서비스 납품 정보" size="lg">
        <div className="p-5 space-y-4">
          <ServiceInfoSection form={serviceForm} setForm={setServiceForm} />
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setServiceEditId(null)}>취소</Button>
            <Button
              onClick={() => {
                const info = buildServiceInfo();
                if (!info) { alert('서비스와 배포 방식을 선택해주세요.'); return; }
                serviceInfoMut.mutate({ id: serviceEditId!, info });
              }}
              loading={serviceInfoMut.isPending}
            >저장</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
