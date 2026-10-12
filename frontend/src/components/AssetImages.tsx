import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ASSET_IMAGE_EVENT_LABEL, deleteAssetImage, fetchAssetImageBlob,
  getAssetImagesByEvent, getAssetImagesBySerial, uploadAssetImage,
  type AssetImage, type AssetImageEvent,
} from '../api/assetImages';

/* ── 인증이 필요한 이미지 ──────────────────────────────────────────────
   버킷이 비공개라 <img src>로 직접 못 부른다. blob으로 받아 objectURL을 만든다. */
function useImageUrl(id: string | undefined, thumb: boolean) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!id) { setUrl(null); return; }
    let revoked: string | null = null;
    let alive = true;
    fetchAssetImageBlob(id, thumb).then((u) => {
      if (!alive) { URL.revokeObjectURL(u); return; }
      revoked = u;
      setUrl(u);
    }).catch(() => { if (alive) setUrl(null); });
    return () => {
      alive = false;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [id, thumb]);
  return url;
}

export function AssetImageThumb({
  image, size = 48, onClick,
}: { image: AssetImage; size?: number; onClick?: () => void }) {
  const url = useImageUrl(image.id, true);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="shrink-0 overflow-hidden rounded border border-gray-200 bg-gray-50 disabled:cursor-default"
      style={{ width: size, height: size }}
      title={`${ASSET_IMAGE_EVENT_LABEL[image.event_type] ?? image.event_type} · ${new Date(image.created_at).toLocaleDateString('ko-KR')}`}
    >
      {url
        ? <img src={url} alt="" className="h-full w-full object-cover" />
        : <span className="block h-full w-full animate-pulse bg-gray-100" />}
    </button>
  );
}

/** 확대 보기 — 원본과 촬영 맥락(이벤트/등록자/일시)을 함께 보여준다 */
export function AssetImageLightbox({ image, onClose }: { image: AssetImage; onClose: () => void }) {
  const url = useImageUrl(image.id, false);
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div className="max-h-full w-full max-w-3xl overflow-auto rounded-lg bg-white" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-4 py-2 text-sm">
          <div className="min-w-0">
            <span className="font-medium text-gray-800">
              {ASSET_IMAGE_EVENT_LABEL[image.event_type] ?? image.event_type}
            </span>
            {image.event_no && <span className="ml-2 text-gray-500">{image.event_no}</span>}
            <span className="ml-2 text-gray-400">
              {new Date(image.created_at).toLocaleString('ko-KR')}
              {image.uploaded_by_name ? ` · ${image.uploaded_by_name}` : ''}
            </span>
          </div>
          <button type="button" onClick={onClose} className="ml-3 shrink-0 text-gray-400 hover:text-gray-700">✕</button>
        </div>
        {image.note && <p className="border-b bg-gray-50 px-4 py-2 text-sm text-gray-600">{image.note}</p>}
        <div className="flex min-h-[200px] items-center justify-center bg-gray-900">
          {url ? <img src={url} alt="" className="max-h-[75vh] w-auto" /> : <span className="py-16 text-sm text-gray-400">불러오는 중…</span>}
        </div>
      </div>
    </div>
  );
}

/* ── 등록 전 사진 선택 ────────────────────────────────────────────────
   사진은 장비마다 다르므로 S/N 단위로 담는다. 폼 제출 시점에야 S/N이 확정되는
   화면(입고)이 있어, 파일은 로컬에 들고 있다가 저장 성공 후 한 번에 올린다.
   키는 확정된 S/N이면 id 문자열, 입고처럼 아직 없으면 S/N 문자열을 쓴다. */
export type SerialPhotoMap = Record<string, File[]>;

/** 사진을 붙일 대상 한 건 */
export interface SerialPhotoTarget {
  key: string;
  label: string;    // S/N
  sub?: string;     // 장비번호·품목명 등 보조 식별자
}

export function countPhotos(map: SerialPhotoMap): number {
  return Object.values(map).reduce((n, list) => n + list.length, 0);
}

/** 썸네일 + 추가 버튼 한 줄 */
function PhotoStrip({ files, onChange, max }: { files: File[]; onChange: (f: File[]) => void; max: number }) {
  const previews = useMemo(() => files.map((f) => ({ f, url: URL.createObjectURL(f) })), [files]);
  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p.url)), [previews]);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {previews.map((p, i) => (
        <div key={i} className="relative">
          <img src={p.url} alt="" className="h-14 w-14 rounded border border-gray-200 object-cover" />
          <button
            type="button"
            onClick={() => onChange(files.filter((_, idx) => idx !== i))}
            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gray-700 text-xs text-white hover:bg-red-600"
            aria-label="사진 삭제"
          >✕</button>
        </div>
      ))}
      {files.length < max && (
        <label className="flex h-14 w-14 cursor-pointer flex-col items-center justify-center rounded border border-dashed border-gray-300 text-gray-400 hover:border-indigo-400 hover:text-indigo-500">
          <span className="text-lg leading-none">＋</span>
          <span className="mt-0.5 text-[10px]">사진</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) onChange([...files, ...Array.from(e.target.files)].slice(0, max));
              e.target.value = '';
            }}
          />
        </label>
      )}
    </div>
  );
}

export function SerialPhotoPicker({
  targets, value, onChange, label = '장비 사진', hint, max = 10,   // 서버의 S/N당 상한(MAX_PER_EVENT)과 맞춘다
  emptyText = 'S/N 관리 품목을 선택하면 장비별로 사진을 등록할 수 있습니다.',
}: {
  targets: SerialPhotoTarget[];
  value: SerialPhotoMap;
  onChange: (next: SerialPhotoMap) => void;
  label?: string;
  hint?: string;
  max?: number;
  emptyText?: string;
}) {
  const total = countPhotos(value);
  const setFor = (key: string, files: File[]) => {
    const next = { ...value };
    if (files.length) next[key] = files; else delete next[key];
    onChange(next);
  };

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        {label}
        <span className="ml-1 text-xs font-normal text-gray-400">
          장비당 최대 {max}장{total > 0 ? ` · 총 ${total}장` : ''}
        </span>
      </label>
      {hint && <p className="mb-1.5 text-xs text-gray-500">{hint}</p>}
      {targets.length === 0 ? (
        <p className="text-xs text-gray-400">{emptyText}</p>
      ) : (
        <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
          {targets.map((t) => (
            <div key={t.key} className="flex items-start gap-3 px-3 py-2">
              <div className="w-40 shrink-0 pt-1">
                <p className="truncate font-mono text-xs text-gray-700" title={t.label}>{t.label}</p>
                {t.sub && <p className="truncate text-[11px] text-gray-400" title={t.sub}>{t.sub}</p>}
              </div>
              <div className="min-w-0 flex-1">
                <PhotoStrip files={value[t.key] ?? []} onChange={(f) => setFor(t.key, f)} max={max} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** 저장 성공 후 호출 — 사진 실패가 업무 처리 자체를 되돌리지는 않으므로 예외는 삼키고 실패 수만 돌려준다.
 *  resolveId는 picker의 키를 실제 serial_numbers.id로 바꾼다 (입고처럼 저장 후에야 id가 정해지는 경우). */
export async function uploadSerialPhotos(
  map: SerialPhotoMap,
  eventType: AssetImageEvent,
  eventNo?: string,
  resolveId: (key: string) => number | undefined = (k) => Number(k) || undefined,
): Promise<{ uploaded: number; failed: number }> {
  let uploaded = 0;
  let failed = 0;
  for (const [key, files] of Object.entries(map)) {
    const serial_number_id = resolveId(key);
    if (!serial_number_id) { failed += files.length; continue; }
    for (const file of files) {
      try {
        await uploadAssetImage({ file, serial_number_id, event_type: eventType, event_no: eventNo });
        uploaded += 1;
      } catch {
        failed += 1;
      }
    }
  }
  return { uploaded, failed };
}

/* ── 조회 ─────────────────────────────────────────────────────────── */

export function AssetImageGallery({
  serialNumberId, eventType, eventNo, emptyText = '등록된 사진이 없습니다.', canDelete = false,
}: {
  serialNumberId?: number;
  eventType?: AssetImageEvent;
  eventNo?: string;
  emptyText?: string;
  canDelete?: boolean;
}) {
  const [viewing, setViewing] = useState<AssetImage | null>(null);
  const byEvent = Boolean(eventType && eventNo);
  const { data = [], refetch } = useQuery({
    queryKey: byEvent ? ['asset-images', 'event', eventType, eventNo] : ['asset-images', 'serial', serialNumberId],
    queryFn: () => (byEvent
      ? getAssetImagesByEvent(eventType!, eventNo!)
      : getAssetImagesBySerial(serialNumberId!)),
    enabled: byEvent || Boolean(serialNumberId),
  });

  if (!data.length) return <p className="text-sm text-gray-400">{emptyText}</p>;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {data.map((img) => (
          <div key={img.id} className="relative">
            <AssetImageThumb image={img} size={72} onClick={() => setViewing(img)} />
            {canDelete && (
              <button
                type="button"
                onClick={async () => {
                  if (!confirm('이 사진을 삭제할까요?')) return;
                  await deleteAssetImage(img.id);
                  refetch();
                }}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gray-700 text-xs text-white hover:bg-red-600"
                aria-label="사진 삭제"
              >✕</button>
            )}
          </div>
        ))}
      </div>
      {viewing && <AssetImageLightbox image={viewing} onClose={() => setViewing(null)} />}
    </>
  );
}

/** 이미 등록된 S/N의 사진을 그 자리에서 추가·삭제한다.
 *  등록 시점을 놓쳤거나 나중에 실물이 바뀐 경우를 위해 사진 이력 전체를 보여준다. */
export function AssetImageManager({
  serialNumberId, eventType = 'MANUAL', eventNo, canEdit = true, max = 10, compact = false,
}: {
  serialNumberId: number;
  eventType?: AssetImageEvent;
  eventNo?: string;
  canEdit?: boolean;
  max?: number;
  compact?: boolean;
}) {
  const qc = useQueryClient();
  const [viewing, setViewing] = useState<AssetImage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryKey = ['asset-images', 'serial', serialNumberId];

  const { data = [] } = useQuery({
    queryKey,
    queryFn: () => getAssetImagesBySerial(serialNumberId),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey });
    qc.invalidateQueries({ queryKey: ['asset-images', 'latest'] });
  };

  const add = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(list).slice(0, max)) {
        await uploadAssetImage({ file, serial_number_id: serialNumberId, event_type: eventType, event_no: eventNo });
      }
      refresh();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? '사진 등록에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const size = compact ? 48 : 72;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {data.map((img) => (
          <div key={img.id} className="relative">
            <AssetImageThumb image={img} size={size} onClick={() => setViewing(img)} />
            {canEdit && (
              <button
                type="button"
                onClick={async () => {
                  if (!confirm('이 사진을 삭제할까요?')) return;
                  await deleteAssetImage(img.id);
                  refresh();
                }}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gray-700 text-xs text-white hover:bg-red-600"
                aria-label="사진 삭제"
              >✕</button>
            )}
          </div>
        ))}
        {canEdit && (
          <label
            className="flex cursor-pointer flex-col items-center justify-center rounded border border-dashed border-gray-300 text-gray-400 hover:border-indigo-400 hover:text-indigo-500"
            style={{ width: size, height: size }}
          >
            <span className="text-lg leading-none">{busy ? '…' : '＋'}</span>
            {!compact && <span className="mt-0.5 text-[10px]">사진</span>}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              disabled={busy}
              className="hidden"
              onChange={(e) => { void add(e.target.files); e.target.value = ''; }}
            />
          </label>
        )}
        {!canEdit && !data.length && <span className="text-sm text-gray-400">등록된 사진이 없습니다.</span>}
      </div>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      {viewing && <AssetImageLightbox image={viewing} onClose={() => setViewing(null)} />}
    </>
  );
}
