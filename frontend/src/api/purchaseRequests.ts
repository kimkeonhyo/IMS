import client from './client';
import type { PurchaseRequest } from '../types';

export interface CreatePRDto {
  title: string;
  note?: string;          // 목적
  background?: string;    // 추진배경
  supplier?: string;       // 거래처
  fund_source?: string;    // 자체자금 | 정부사업 | 투자금
  fund_budget?: string;    // 소요예산 (정부사업 시)
  fund_project?: string;   // 정부사업명
  flex_link?: string;
  items: {
    item_code: string; storage_code: string; quantity: number;
    unit_price?: number; spec?: string; supplier?: string; note?: string;
  }[];
}

export const purchaseRequestsApi = {
  findAll:  () => client.get<PurchaseRequest[]>('/purchase-requests').then(r => r.data),
  findOne:  (id: string) => client.get<PurchaseRequest>(`/purchase-requests/${id}`).then(r => r.data),
  create:   (dto: CreatePRDto) => client.post<PurchaseRequest>('/purchase-requests', dto).then(r => r.data),
  submit:   (id: string) => client.patch<PurchaseRequest>(`/purchase-requests/${id}/submit`).then(r => r.data),
  update:   (id: string, dto: CreatePRDto) => client.patch<PurchaseRequest>(`/purchase-requests/${id}`, dto).then(r => r.data),
  cancel:   (id: string) => client.patch<PurchaseRequest>(`/purchase-requests/${id}/cancel`).then(r => r.data),
};
