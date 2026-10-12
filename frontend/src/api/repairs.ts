import client from './client';
import type { Item, SerialNumber, Storage, Employee } from '../types';

export type RepairStatus = 'REPORTED' | 'REPAIRING' | 'DONE' | 'CANCELLED';

export interface Repair {
  repair_no: string;
  item_code: string;
  storage_code: string;
  quantity: number;
  serial_number_ids: number[] | null;
  symptom: string;
  occurred_at: string | null;
  vendor_name: string | null;
  received_at: string | null;
  report_man_no: string | null;
  repair_vendor: string | null;
  is_paid: number;
  is_taken_out: number;
  expected_done_at: string | null;
  repair_registered_at: string | null;
  repair_content: string | null;
  return_storage_code: string | null;
  completed_at: string | null;
  complete_man_no: string | null;
  status: RepairStatus;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  item?: Item;
  storage?: Storage;
  returnStorage?: Storage;
  reporter?: Employee;
  serials?: SerialNumber[];
}

export interface CreateRepairDto {
  item_code: string;
  storage_code: string;
  serial_number_ids?: number[];
  quantity?: number;
  symptom: string;
  occurred_at?: string;
  vendor_name?: string;
  received_at?: string;
}

export interface RegisterRepairDto {
  repair_vendor: string;
  is_paid?: number;
  is_taken_out?: number;
  expected_done_at: string;
}

export interface CompleteRepairDto {
  repair_content: string;
  return_storage_code?: string;
}

export const repairsApi = {
  findAll:  (): Promise<Repair[]> => client.get('/repairs').then(r => r.data),
  findOne:  (id: string): Promise<Repair> => client.get(`/repairs/${id}`).then(r => r.data),
  create:   (dto: CreateRepairDto) => client.post<Repair>('/repairs', dto).then(r => r.data),
  register: (id: string, dto: RegisterRepairDto) =>
    client.patch<Repair>(`/repairs/${id}/register`, dto).then(r => r.data),
  complete: (id: string, dto: CompleteRepairDto) =>
    client.patch<Repair>(`/repairs/${id}/complete`, dto).then(r => r.data),
  cancel:   (id: string, reason?: string) =>
    client.patch<Repair>(`/repairs/${id}/cancel`, { reason }).then(r => r.data),
};
