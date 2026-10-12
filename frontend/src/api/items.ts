import client from './client';
import type { Item, Storage, InventoryRow } from '../types';

export interface CreateItemDto {
  category: string;
  item_name: string;
  description?: string;
  unit?: string;
  unit_price?: number;
  use_serial?: number;
  specs?: string[];
  visibility?: 'PUBLIC' | 'PRIVATE';
}

export interface ImportResult {
  created: number;
  skipped: number;
  errors: string[];
}

export const itemsApi = {
  findAll:      () => client.get<Item[]>('/items').then(r => r.data),
  findOne:      (code: string) => client.get<Item>(`/items/${code}`).then(r => r.data),
  create:       (dto: CreateItemDto) => client.post<Item>('/items', dto).then(r => r.data),
  update:       (code: string, dto: Partial<CreateItemDto>) => client.patch<Item>(`/items/${code}`, dto).then(r => r.data),
  toggleActive: (code: string) => client.patch<Item>(`/items/${code}/toggle-active`).then(r => r.data),
  importFile:   (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return client.post<ImportResult>('/items/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);
  },
};

export const storageApi = {
  findAll: () => client.get<Storage[]>('/storage').then(r => r.data),
  findOne: (code: string) => client.get<Storage>(`/storage/${code}`).then(r => r.data),
  create:  (dto: Partial<Storage>) => client.post<Storage>('/storage', dto).then(r => r.data),
  update:  (code: string, dto: Partial<Storage>) => client.patch<Storage>(`/storage/${code}`, dto).then(r => r.data),
};

export const inventoryApi = {
  findAll:    () => client.get<InventoryRow[]>('/inventory').then(r => r.data),
  findByItem: (item_code: string) => client.get<InventoryRow[]>(`/inventory/item/${item_code}`).then(r => r.data),
};
