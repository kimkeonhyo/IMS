import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { getLatestAssetImages, type AssetImage } from '../api/assetImages';
import { AssetImageThumb } from './AssetImages';
import type { SerialNumber } from '../types';

/** 목록에 보이는 S/N들의 최신 사진 1장씩 — 호버 카드에서 쓴다 (메타만, 이미지는 호버 시 로드) */
export function useLatestSerialImages(ids: number[]): Record<number, AssetImage> {
  const key = ids.slice().sort((a, b) => a - b).join(',');
  const { data = {} } = useQuery({
    queryKey: ['asset-images', 'latest', key],
    queryFn: () => getLatestAssetImages(ids),
    enabled: ids.length > 0,
    staleTime: 60_000,
  });
  return data;
}

const CARD_W = 260;

/** 커서 근처에 띄우는 장비 요약 — 화면 밖으로 나가지 않게 뒤집는다 */
function HoverCard({ anchor, sn, image }: { anchor: DOMRect; sn: SerialNumber; image?: AssetImage }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: anchor.bottom + 6, left: anchor.left });

  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 200;
    const flipUp = anchor.bottom + 6 + h > window.innerHeight;
    setPos({
      top: flipUp ? Math.max(6, anchor.top - 6 - h) : anchor.bottom + 6,
      left: Math.min(Math.max(6, anchor.left), window.innerWidth - CARD_W - 6),
    });
  }, [anchor]);

  const tags = Object.entries(sn.tags ?? {}).filter(([, v]) => v != null && String(v).trim() !== '');

  return createPortal(
    <div
      ref={ref}
      style={{ top: pos.top, left: pos.left, width: CARD_W }}
      className="pointer-events-none fixed z-[120] rounded-lg border border-gray-200 bg-white p-2.5 shadow-xl"
    >
      <p className="font-mono text-xs font-semibold text-gray-800">{sn.serial_no}</p>
      {sn.asset_no && <p className="font-mono text-[11px] text-gray-400">{sn.asset_no}</p>}

      <div className="mt-2 flex gap-2">
        {image
          ? <AssetImageThumb image={image} size={72} />
          : <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded border border-dashed border-gray-200 text-[10px] text-gray-300">사진 없음</div>}
        <div className="min-w-0 flex-1">
          {tags.length === 0
            ? <p className="text-[11px] text-gray-400">등록된 사양 정보 없음</p>
            : (
              <dl className="space-y-0.5">
                {tags.map(([k, v]) => (
                  <div key={k} className="flex gap-1 text-[11px] leading-tight">
                    <dt className="w-12 shrink-0 text-gray-400">{k}</dt>
                    <dd className="min-w-0 flex-1 break-words text-gray-700">{String(v)}</dd>
                  </div>
                ))}
              </dl>
            )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** S/N 선택 칩 — 호버하면 사양 태그와 최신 사진을 보여준다 */
export function SerialChip({
  sn, label, selected, onClick, image,
}: {
  sn: SerialNumber;
  label: string;
  selected: boolean;
  onClick: () => void;
  image?: AssetImage;
}) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // 스크롤·휠로 칩이 움직이면 카드가 떠 있는 자리가 어긋나므로 닫는다
  useEffect(() => {
    if (!anchor) return;
    const close = () => setAnchor(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('wheel', close, { passive: true });
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('wheel', close);
    };
  }, [anchor]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={onClick}
        onMouseEnter={() => setAnchor(btnRef.current?.getBoundingClientRect() ?? null)}
        onMouseLeave={() => setAnchor(null)}
        className={`text-xs px-2 py-0.5 rounded border transition-colors cursor-pointer ${
          selected
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400'
        }`}
      >{label}</button>
      {anchor && <HoverCard anchor={anchor} sn={sn} image={image} />}
    </>
  );
}
