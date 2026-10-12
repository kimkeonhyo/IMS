import client from './client';
import type { SerialNumber } from '../types';

export const serialNumbersApi = {
  /** STOCK 상태 S/N 목록 조회 (출고/이동/사용용)
   *  includeInUse=true면 사용중 등 취소 제외 전체 상태 포함 (네트워크 장비 등록용) */
  findAvailable: (item_code: string, storage_code?: string, includeInUse?: boolean): Promise<SerialNumber[]> => {
    const params: Record<string, string> = { item_code };
    if (storage_code) params.storage_code = storage_code;
    if (includeInUse) params.include_in_use = 'true';
    return client.get('/serial-numbers', { params }).then(r => r.data);
  },
  /** 품목의 전체 S/N 목록 (재고현황용) */
  findByItem: (item_code: string): Promise<SerialNumber[]> =>
    client.get(`/serial-numbers/by-item/${item_code}`).then(r => r.data),
  /** 납품 품목의 S/N 목록 */
  findByShipmentItem: (shipment_item_id: string): Promise<SerialNumber[]> =>
    client.get(`/serial-numbers/by-shipment-item/${shipment_item_id}`).then(r => r.data),
  /** 입고 품목의 S/N 목록 */
  findByStoreItem: (store_item_id: string): Promise<SerialNumber[]> =>
    client.get(`/serial-numbers/by-store-item/${store_item_id}`).then(r => r.data),
  /** 재고사용 건의 S/N 목록 */
  findByUsage: (usage_no: string): Promise<SerialNumber[]> =>
    client.get(`/serial-numbers/by-usage/${usage_no}`).then(r => r.data),
  /** S/N 정보 수정 */
  updateOne: (id: number, data: { serial_no?: string; asset_no?: string | null; tags?: Record<string, string> | null }): Promise<SerialNumber> =>
    client.patch(`/serial-numbers/${id}`, data).then(r => r.data),
  /** S/N 번호·장비번호·태그 값 검색 (납품현황 필터용) */
  search: (q: string): Promise<SerialNumber[]> =>
    client.get('/serial-numbers/search', { params: { q } }).then(r => r.data),
};
