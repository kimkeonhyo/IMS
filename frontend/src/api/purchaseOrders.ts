import client from './client';
import type { PurchaseOrder, Store } from '../types';

export interface CreatePODto {
  request_id: string; supplier?: string; expected_date?: string; note?: string;
  items: { item_code: string; storage_code: string; quantity: number; unit_price: number; supplier?: string }[];
}

export interface CreateStoreDto {
  title: string; request_id?: string; requester_man_no?: string; note?: string;
  items: {
    item_code: string; storage_code: string; quantity: number;
    serials?: { serial_no: string; asset_no?: string; tags?: Record<string, string> }[];
  }[];
}

export interface CreateDirectStoreDto {
  reason?: string; note?: string;
  items: {
    item_code: string; storage_code: string; quantity: number;
    serials?: { serial_no: string; asset_no?: string; tags?: Record<string, string> }[];
  }[];
}

export const purchaseOrdersApi = {
  findAll:  () => client.get<PurchaseOrder[]>('/purchase-orders').then(r => r.data),
  findOne:  (id: string) => client.get<PurchaseOrder>(`/purchase-orders/${id}`).then(r => r.data),
  create:   (dto: CreatePODto) => client.post<PurchaseOrder>('/purchase-orders', dto).then(r => r.data),
  confirm:  (id: string) => client.patch<PurchaseOrder>(`/purchase-orders/${id}/confirm`).then(r => r.data),
  cancel:   (id: string) => client.patch<PurchaseOrder>(`/purchase-orders/${id}/cancel`).then(r => r.data),
};

export const storeApi = {
  findAll:        () => client.get<Store[]>('/store').then(r => r.data),
  findOne:        (id: string) => client.get<Store>(`/store/${id}`).then(r => r.data),
  receive:        (dto: CreateStoreDto) => client.post<Store>('/store', dto).then(r => r.data),
  directRegister: (dto: CreateDirectStoreDto) => client.post<Store>('/store/direct', dto).then(r => r.data),
  cancel:         (id: string, serial_number_ids?: number[]) => client.patch<Store>(`/store/${id}/cancel`, { serial_number_ids }).then(r => r.data),
};
