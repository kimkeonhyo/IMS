import client from './client';

export type ShipmentStatus = 'DRAFT' | 'SHIPPED' | 'CONFIRMED' | 'CANCELLED' | 'RETRIEVED';

export type ServiceKind = 'VMS' | 'NVR' | 'ETC';
export type DeployMode = 'BUNDLE' | 'MANUAL';
/** 접속 방식 — 원격(VPN) | 폐쇄망(현장 로컬) */
export type AccessMode = 'REMOTE' | 'CLOSED';

export interface ServiceImage {
  image_name: string;
  version: string;
}

export interface ServiceInfo {
  service: ServiceKind;
  service_custom_name: string | null;
  deploy_mode: DeployMode;
  /** 구버전 데이터 호환을 위해 optional — 없으면 REMOTE로 간주 */
  access_mode?: AccessMode;
  bundle_version: string | null;
  delivery_ip: string | null;
  user_name: string | null;
  password: string | null;
  vip: string | null;
  images: ServiceImage[];
}

export interface ShipmentItem {
  shipment_item_id: string;
  item_code: string;
  storage_code: string;
  quantity: number;
  serial_number_ids?: number[] | null;
  item?: { item_name: string; unit: string; use_serial?: number; specs?: string[] | null };
  storage?: { storage_name: string };
}

export interface Shipment {
  shipment_id: string;
  title: string;
  customer_name: string;
  status: ShipmentStatus;
  delivery_date?: string;
  note?: string;
  man_no: string;
  shipped_at?: string;
  confirmed_at?: string;
  cancelled_at?: string;
  cancel_reason?: string | null;
  updated_at: string;
  created_at: string;
  assignee_man_no?: string | null;
  retrieved_at?: string | null;
  retrieve_reason?: string | null;
  retrieved_man_no?: string | null;
  items?: ShipmentItem[];
  service_info?: ServiceInfo | null;
  createdBy?: { name: string; man_team: string };
  confirmedBy?: { name: string };
  assignee?: { name: string; man_team: string } | null;
  retrievedBy?: { name: string } | null;
}

export interface CreateShipmentDto {
  title: string;
  customer_name: string;
  delivery_date?: string;
  note?: string;
  assignee_man_no?: string;
  items: { item_code: string; storage_code: string; quantity: number; serial_number_ids?: number[] }[];
  service_info?: ServiceInfo;
}

export const shipmentsApi = {
  findAll: () => client.get<Shipment[]>('/shipments').then(r => r.data),
  findOne: (id: string) => client.get<Shipment>(`/shipments/${id}`).then(r => r.data),
  create:  (dto: CreateShipmentDto) => client.post<Shipment>('/shipments', dto).then(r => r.data),
  confirm: (id: string) => client.patch<Shipment>(`/shipments/${id}/confirm`).then(r => r.data),
  update:  (id: string, dto: CreateShipmentDto) => client.patch<Shipment>(`/shipments/${id}`, dto).then(r => r.data),
  updateServiceInfo: (id: string, info: ServiceInfo) => client.patch<Shipment>(`/shipments/${id}/service-info`, info).then(r => r.data),
  cancel:      (id: string, reason: string) => client.patch<Shipment>(`/shipments/${id}/cancel`, { reason }).then(r => r.data),
  retrieve:    (id: string, reason: string, return_storage_code?: string, serial_number_ids?: number[]) =>
    client.patch<Shipment>(`/shipments/${id}/retrieve`, { reason, return_storage_code, serial_number_ids }).then(r => r.data),
  setAssignee: (id: string, assignee_man_no: string | null) =>
    client.patch<Shipment>(`/shipments/${id}/assignee`, { assignee_man_no }).then(r => r.data),
};
