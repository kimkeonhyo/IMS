import client from './client';
import type { StockUsage } from '../types';

export interface CreateUsageDto {
  item_code: string; storage_code: string; quantity: number; purpose?: string;
  use_man_no?: string;
  serial_number_ids?: number[];
  /** 사용기한 YYYY-MM-DD (무기한이면 미전송) */
  use_until?: string;
  /** 무기한 사용 (1) */
  is_indefinite?: number;
  /** 사용처 — 창고 코드 또는 'EXTERNAL' */
  use_place_code?: string;
  /** 사용처가 외부일 때 직접 입력 */
  use_place_name?: string;
}

export interface BulkUsageItem {
  item_code: string; storage_code: string; quantity: number;
  serial_number_ids?: number[];
}

export interface CreateBulkUsageDto {
  use_man_no?: string;
  use_name?: string;   // 미가입자 이름
  purpose?: string;
  use_until?: string;
  is_indefinite?: number;
  use_place_code?: string;
  use_place_name?: string;
  items: BulkUsageItem[];
}

export const stockUsagesApi = {
  findAll:    () => client.get<StockUsage[]>('/stock-usages').then(r => r.data),
  findOne:    (id: string) => client.get<StockUsage>(`/stock-usages/${id}`).then(r => r.data),
  create:     (dto: CreateUsageDto) => client.post<StockUsage>('/stock-usages', dto).then(r => r.data),
  createBulk: (dto: CreateBulkUsageDto) => client.post<StockUsage[]>('/stock-usages/bulk', dto).then(r => r.data),
  update:     (id: string, dto: { purpose?: string; quantity?: number; use_until?: string; is_indefinite?: number; use_place_code?: string; use_place_name?: string }) => client.patch<StockUsage>(`/stock-usages/${id}`, dto).then(r => r.data),
  cancel:     (id: string, cancel_reason?: string) => client.patch<StockUsage>(`/stock-usages/${id}/cancel`, { cancel_reason }).then(r => r.data),
  complete:    (id: string) => client.patch<StockUsage>(`/stock-usages/${id}/complete`).then(r => r.data),
  returnStock: (id: string, return_storage_code?: string, serial_number_ids?: number[]) =>
    client.patch<StockUsage>(`/stock-usages/${id}/return`, { return_storage_code, serial_number_ids }).then(r => r.data),
};
