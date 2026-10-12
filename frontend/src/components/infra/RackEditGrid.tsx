import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  netboxProxyApi,
  type NetboxRack,
  type NetboxRackDevice,
  type RackFace,
} from '../../api/netboxProxy';
import { useToastStore } from '../../store/toast.store';

const ROW_H = 22; // px per U

/** 역할 색 위에 올릴 텍스트 색 (밝은 배경이면 어두운 글자) */
function textOn(hex: string | undefined): string {
  if (!hex) return '#fff';
  const n = parseInt(hex, 16);
  if (Number.isNaN(n)) return '#fff';
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#1f2937' : '#fff';
}

// dragover 이벤트에서는 dataTransfer 데이터를 읽을 수 없으므로(브라우저 보안 제약)
// 드롭 미리보기용 페이로드를 모듈 스코프에 공유한다 (같은 페이지의 랙 카드 간 이동 포함)
let dragPayload: { deviceId: number; du: number; fromRackId: number } | null = null;

interface Props {
  rack: NetboxRack;
  face: RackFace;
}

export function RackEditGrid({ rack, face }: Props) {
  const queryClient = useQueryClient();
  const { addToast } = useToastStore();
  const [hoverU, setHoverU] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['netbox-rack-devices', rack.id],
    queryFn: () => netboxProxyApi.getRackDevices(rack.id),
    staleTime: 30_000,
  });

  // 배치도(SVG)와 동일한 역할 색을 편집 그리드에도 적용 (페이지 쿼리와 캐시 공유)
  const { data: rolesData } = useQuery({
    queryKey: ['netbox-device-roles'],
    queryFn: netboxProxyApi.getDeviceRoles,
    staleTime: 10 * 60_000,
  });
  const roleColors = new Map((rolesData?.roles ?? []).map((r) => [r.name, r.color]));

  const moveMut = useMutation({
    mutationFn: ({ deviceId, position }: { deviceId: number; position: number }) =>
      netboxProxyApi.moveDevice(deviceId, { rack: rack.id, position, face }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['netbox-rack-devices'] });
      void queryClient.invalidateQueries({ queryKey: ['netbox-elevation'] });
      void queryClient.invalidateQueries({ queryKey: ['netbox-racks'] });
    },
    onError: (err: any) => {
      addToast(err?.response?.data?.error?.message ?? err?.response?.data?.message ?? '장비 이동에 실패했습니다.');
      void queryClient.invalidateQueries({ queryKey: ['netbox-rack-devices'] });
    },
  });

  const devices = data?.devices ?? [];
  const mounted = devices.filter(
    (d) => d.position !== null && (d.face === face || d.face === null),
  );
  const unmounted = devices.filter((d) => d.position === null);

  // 드롭 후보 범위(hoverU 기준 위로 du칸)가 랙 범위를 벗어나는지
  const previewValid =
    hoverU !== null && dragPayload !== null && hoverU + dragPayload.du - 1 <= rack.u_height;

  const handleDrop = (u: number) => {
    if (!dragPayload) return;
    if (u + dragPayload.du - 1 > rack.u_height) return;
    moveMut.mutate({ deviceId: dragPayload.deviceId, position: u });
    dragPayload = null;
    setHoverU(null);
  };

  if (isLoading) {
    return <div className="py-12 text-center text-xs text-gray-400">장비 정보를 불러오는 중...</div>;
  }

  return (
    <div className="space-y-2">
      <div className="flex select-none">
        {/* U 라벨 */}
        <div className="shrink-0 w-7 text-right pr-1">
          {Array.from({ length: rack.u_height }, (_, i) => rack.u_height - i).map((u) => (
            <div
              key={u}
              style={{ height: ROW_H }}
              className={`text-[9px] leading-[22px] font-mono ${u % 5 === 0 ? 'text-gray-500 font-medium' : 'text-gray-300'}`}
            >
              {u}
            </div>
          ))}
        </div>

        {/* 랙 그리드 */}
        <div
          className="relative flex-1 border border-gray-300 rounded bg-gray-50"
          style={{ height: rack.u_height * ROW_H }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setHoverU(null);
          }}
        >
          {/* U 슬롯 (드롭 타겟) */}
          {Array.from({ length: rack.u_height }, (_, i) => rack.u_height - i).map((u) => (
            <div
              key={u}
              style={{ height: ROW_H }}
              className={`border-b border-gray-100 last:border-b-0 ${u % 2 === 0 ? 'bg-gray-100/50' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setHoverU(u);
              }}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(u);
              }}
            />
          ))}

          {/* 드롭 미리보기 */}
          {hoverU !== null && dragPayload !== null && (
            <div
              className={`absolute left-0 right-0 rounded pointer-events-none border-2 ${
                previewValid ? 'border-indigo-400 bg-indigo-100/60' : 'border-red-400 bg-red-100/60'
              }`}
              style={{
                top: (rack.u_height - (hoverU + dragPayload.du - 1)) * ROW_H,
                height: dragPayload.du * ROW_H,
              }}
            />
          )}

          {/* 장비 블록 */}
          {mounted.map((d) => (
            <DeviceBlock key={d.id} device={d} rack={rack} moving={moveMut.isPending} color={roleColors.get(d.role)} />
          ))}
        </div>
      </div>

      {/* 미배치 장비 트레이 */}
      {unmounted.length > 0 && (
        <div className="border border-dashed border-gray-300 rounded p-2">
          <p className="text-[10px] text-gray-400 mb-1">미배치 장비 — 랙으로 드래그하세요</p>
          <div className="flex flex-wrap gap-1">
            {unmounted.map((d) => (
              <div
                key={d.id}
                draggable
                onDragStart={() => {
                  dragPayload = { deviceId: d.id, du: d.u_height, fromRackId: rack.id };
                }}
                className="px-2 py-0.5 rounded bg-indigo-600 text-white text-[10px] cursor-grab active:cursor-grabbing"
              >
                {d.name} ({d.u_height}U)
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DeviceBlock({
  device,
  rack,
  moving,
  color,
}: {
  device: NetboxRackDevice;
  rack: NetboxRack;
  moving: boolean;
  color?: string;
}) {
  const position = device.position as number; // mounted 필터 통과 → non-null
  const top = (rack.u_height - (position + device.u_height - 1)) * ROW_H;
  const bg = color ? `#${color}` : '#4f46e5'; // 역할 색 없으면 indigo-600
  const fg = color ? textOn(color) : '#fff';

  return (
    <div
      draggable={!moving}
      onDragStart={() => {
        dragPayload = { deviceId: device.id, du: device.u_height, fromRackId: rack.id };
      }}
      onDragEnd={() => {
        dragPayload = null;
      }}
      className={`absolute left-0.5 right-0.5 rounded px-1.5 flex items-center justify-between gap-1 cursor-grab active:cursor-grabbing ring-1 ring-inset ring-black/10 hover:[filter:brightness(1.08)] shadow-sm ${
        moving ? 'opacity-50' : ''
      }`}
      style={{ top: top + 1, height: device.u_height * ROW_H - 2, backgroundColor: bg, color: fg }}
      title={`${device.name} · ${device.role} · U${position}${device.u_height > 1 ? `-U${position + device.u_height - 1}` : ''}`}
    >
      <span className="text-[10px] font-medium truncate">{device.name}</span>
      <span className="text-[9px] opacity-75 shrink-0 font-mono">U{position}</span>
    </div>
  );
}
