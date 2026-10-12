import client from './client';
import type { Delivery } from '../types';

export interface CreateDeliveryDto {
  title: string; note?: string;
  items: { item_code: string; storage_code: string; quantity: number }[];
}

export const deliveriesApi = {
  findAll: () => client.get<Delivery[]>('/deliveries').then(r => r.data),
  findOne: (id: string) => client.get<Delivery>(`/deliveries/${id}`).then(r => r.data),
  create:  (dto: CreateDeliveryDto) => client.post<Delivery>('/deliveries', dto).then(r => r.data),
  approve: (id: string) => client.patch<Delivery>(`/deliveries/${id}/approve`).then(r => r.data),
  cancel:  (id: string) => client.patch<Delivery>(`/deliveries/${id}/cancel`).then(r => r.data),
};
