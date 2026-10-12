import client from './client';
import type { StockMovement } from '../types';

export interface CreateMovementDto {
  from_storage_code: string; to_storage_code: string;
  item_code: string; quantity: number; note?: string;
  serial_number_ids?: number[];
  to_man_no?: string;
}

export const stockMovementsApi = {
  findAll: () => client.get<StockMovement[]>('/stock-movements').then(r => r.data),
  findOne: (id: string) => client.get<StockMovement>(`/stock-movements/${id}`).then(r => r.data),
  create:  (dto: CreateMovementDto) => client.post<StockMovement>('/stock-movements', dto).then(r => r.data),
  approve: (id: string) => client.patch<StockMovement>(`/stock-movements/${id}/approve`).then(r => r.data),
  move:    (id: string) => client.patch<StockMovement>(`/stock-movements/${id}/move`).then(r => r.data),
  cancel:  (id: string) => client.patch<StockMovement>(`/stock-movements/${id}/cancel`).then(r => r.data),
};
