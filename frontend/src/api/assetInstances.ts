import client from './client';
import type { AssetInstance } from '../types';

export interface CreateAssetInstanceDto {
  item_code: string;
  serial_no: string;
  storage_code: string;
  acquired_at?: string;
  note?: string;
}

export interface UpdateAssetInstanceDto {
  storage_code?: string;
  status?: 'IN_STOCK' | 'IN_USE' | 'DISPOSED';
  note?: string;
}

export const assetInstancesApi = {
  findAll:   (item_code?: string) =>
    client.get<AssetInstance[]>('/asset-instances', { params: item_code ? { item_code } : undefined }).then(r => r.data),
  findOne:   (id: string) => client.get<AssetInstance>(`/asset-instances/${id}`).then(r => r.data),
  create:    (dto: CreateAssetInstanceDto) => client.post<AssetInstance>('/asset-instances', dto).then(r => r.data),
  update:    (id: string, dto: UpdateAssetInstanceDto) => client.patch<AssetInstance>(`/asset-instances/${id}`, dto).then(r => r.data),
};
