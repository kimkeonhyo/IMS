import client from './client';

/** 사진을 남긴 업무 이벤트 */
export type AssetImageEvent = 'STORE' | 'SHIP' | 'USAGE' | 'RETURN' | 'MOVE' | 'MANUAL';

export const ASSET_IMAGE_EVENT_LABEL: Record<AssetImageEvent, string> = {
  STORE: '입고',
  SHIP: '납품 완료',
  USAGE: '재고사용',
  RETURN: '회수/반납',
  MOVE: '재고이동',
  MANUAL: '직접 등록',
};

export interface AssetImage {
  id: string;
  serial_number_id: number;
  event_type: AssetImageEvent;
  event_no: string | null;
  original_name: string | null;
  size: number;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  note: string | null;
  created_at: string;
}

export async function uploadAssetImage(params: {
  file: File;
  serial_number_id: number;
  event_type: AssetImageEvent;
  event_no?: string;
  note?: string;
}): Promise<AssetImage> {
  const form = new FormData();
  form.append('file', params.file);
  form.append('serial_number_id', String(params.serial_number_id));
  form.append('event_type', params.event_type);
  if (params.event_no) form.append('event_no', params.event_no);
  if (params.note) form.append('note', params.note);
  // 사진 업로드는 변환(webp)까지 서버에서 하므로 기본 15초로는 부족할 수 있다
  const { data } = await client.post<AssetImage>('/asset-images', form, { timeout: 60000 });
  return data;
}

export async function getAssetImagesBySerial(serialNumberId: number): Promise<AssetImage[]> {
  const { data } = await client.get<AssetImage[]>(`/asset-images/serial/${serialNumberId}`);
  return data;
}

export async function getAssetImagesByEvent(eventType: AssetImageEvent, eventNo: string): Promise<AssetImage[]> {
  const { data } = await client.get<AssetImage[]>(`/asset-images/event/${eventType}/${encodeURIComponent(eventNo)}`);
  return data;
}

/** 여러 S/N의 최신 사진 1장씩 — 목록에서 썸네일 표시용 */
export async function getLatestAssetImages(ids: number[]): Promise<Record<number, AssetImage>> {
  if (!ids.length) return {};
  const { data } = await client.get<Record<number, AssetImage>>('/asset-images/latest', {
    params: { ids: ids.join(',') },
  });
  return data;
}

export async function deleteAssetImage(id: string): Promise<void> {
  await client.delete(`/asset-images/${id}`);
}

/** 비공개 버킷이라 인증 헤더가 필요 — blob으로 받아 objectURL을 만든다 */
export async function fetchAssetImageBlob(id: string, thumb: boolean): Promise<string> {
  const { data } = await client.get<Blob>(`/asset-images/${id}/raw`, {
    params: thumb ? { thumb: '1' } : undefined,
    responseType: 'blob',
  });
  return URL.createObjectURL(data);
}
