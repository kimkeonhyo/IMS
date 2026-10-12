// ─── Auth ─────────────────────────────────────────────────────────────────
export interface AuthUser {
  man_no: string;
  man_id: string;
  name: string;
  man_roll: 'MASTER' | 'ADMIN' | 'USER';
  man_team: string;
  email?: string;
  phone?: string;
  permissions: string[];
}

// ─── Employee ─────────────────────────────────────────────────────────────
export interface Employee {
  man_no: string;
  man_id: string;
  name: string;
  man_roll: string;
  man_team: string;
  email?: string;
  phone?: string;
  is_active: number;
  permissions: string[];
  created_at: string;
}

// ─── Item ─────────────────────────────────────────────────────────────────
export type ItemCategory = 'HW' | 'SW' | 'NORMAL' | 'CON' | 'EQUIP';

export const CATEGORY_LABEL: Record<ItemCategory, string> = {
  HW:     '하드웨어',
  SW:     '소프트웨어',
  NORMAL: '일반비품',
  CON:    '소모품',
  EQUIP:  '장비',
};

export const CATEGORY_PREFIX: Record<ItemCategory, string> = {
  HW:     'HW',
  SW:     'SW',
  NORMAL: 'Normal',
  CON:    'Con',
  EQUIP:  'Equip',
};

export interface Item {
  item_code: string;
  category: ItemCategory;
  item_name: string;
  description?: string;
  unit: string;
  unit_price: number;
  is_active: number;
  use_serial: number;
  specs?: string[] | null;
  visibility: 'PUBLIC' | 'PRIVATE';
}

// ─── Serial Number ─────────────────────────────────────────────────────────
export type SerialStatus = 'STOCK' | 'SHIPPED' | 'USED' | 'CANCELLED';

export interface SerialNumber {
  id: number;
  serial_no: string;
  /** 장비번호(자산번호) */
  asset_no?: string | null;
  item_code: string;
  status: SerialStatus;
  storage_code: string | null;
  store_item_id: string;
  shipment_item_id: string | null;
  usage_no: string | null;
  tags: Record<string, string> | null;
  created_at: string;
  /** 현재 사용 중인 사람 이름 (USED/PENDING 상태인 경우) */
  currentUser?: string | null;
  /** 활성 사용 건의 상태 (PENDING=사용중 / COMPLETED=사용됨) */
  usageStatus?: string | null;
  /** 활성 사용 건의 사용기한 (YYYY-MM-DD) */
  useUntil?: string | null;
  /** 활성 사용 건이 무기한인지 */
  isIndefinite?: number | null;
  /** 활성 사용 건의 사용처 표시명 (외부는 입력값, 창고는 창고명) */
  usePlace?: string | null;
  /** 진행 중인 고장/수리 건 번호 */
  repairNo?: string | null;
  /** 고장/수리 건 상태 (REPORTED=고장신고 / REPAIRING=수리중) */
  repairStatus?: string | null;
  repairVendor?: string | null;
  /** 수리완료 예정일 (YYYY-MM-DD) */
  repairExpectedDoneAt?: string | null;
  /** 납품처 거래처명 (SHIPPED 상태인 경우) */
  shipmentDestination?: string | null;
}

// ─── Storage ──────────────────────────────────────────────────────────────
export interface Storage {
  storage_code: string;
  storage_name: string;
  location?: string;
  is_active: number;
}

// ─── Inventory ────────────────────────────────────────────────────────────
export interface InventoryRow {
  storage_code: string;
  item_code: string;
  quantity: number;
  storage?: Storage;
  item?: Item;
}

// ─── Purchase Request ─────────────────────────────────────────────────────
export type PurchaseRequestStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'ORDERED' | 'RECEIVED' | 'CANCELLED';

export interface PurchaseRequestItem {
  request_item_id: string;
  request_id: string;
  item_code: string;
  storage_code: string;
  quantity: number;
  unit_price?: number;
  spec?: string;
  supplier?: string;
  note?: string;
  item?: Item;
}

export interface PurchaseRequest {
  request_id: string;
  title: string;
  status: PurchaseRequestStatus;
  description?: string;   // 목적
  background?: string;    // 추진배경
  supplier?: string;       // 거래처
  fund_source?: string;    // 자체자금 | 정부사업 | 투자금
  fund_budget?: string;    // 소요예산 (정부사업 시)
  fund_project?: string;   // 정부사업명
  note?: string;
  flex_link?: string;
  request_man_no: string;
  approve_man_no?: string;
  approved_man_no?: string;
  created_at: string;
  requester?: Employee;
  approver?: Employee;
  items?: PurchaseRequestItem[];
}

// ─── Purchase Order ───────────────────────────────────────────────────────
export type PurchaseOrderStatus = 'PENDING' | 'CONFIRMED' | 'RECEIVED' | 'CANCELLED';

export interface PurchaseOrderItem {
  order_item_id: string;
  order_id: string;
  item_code: string;
  storage_code: string;
  quantity: number;
  unit_price: number;
  item?: Item;
}

export interface PurchaseOrder {
  order_id: string;
  request_id: string;
  supplier: string;
  status: PurchaseOrderStatus;
  total_amount: number;
  expected_date?: string;
  ordered_at?: string;
  note?: string;
  order_man_no: string;
  created_at: string;
  items?: PurchaseOrderItem[];
  purchaseRequest?: PurchaseRequest;
  orderedBy?: Employee;
}

// ─── Store (입고) ─────────────────────────────────────────────────────────
export interface StoreItem {
  store_item_id: string;
  store_id: string;
  item_code: string;
  storage_code: string;
  quantity: number;
  serial_no?: string;
  item?: Item;
  storage?: { storage_name: string; storage_code: string };
}

export interface Store {
  store_id: string;
  title?: string | null;
  order_id: string | null;
  request_id: string | null;
  order_man_no: string;
  requester_man_no?: string | null;
  received_at: string;
  note?: string;
  status?: string;
  receiptItems?: StoreItem[];
  purchaseOrder?: PurchaseOrder;
  purchaseRequest?: PurchaseRequest;
  receiver?: Employee;
  requester?: Employee | null;
}

// ─── Delivery (출고) ──────────────────────────────────────────────────────
export type DeliveryStatus = 'PENDING' | 'APPROVED' | 'CANCELLED';

export interface DeliveryItem {
  delivery_item_id: string;
  delivery_id: string;
  item_code: string;
  storage_code: string;
  quantity: number;
  item?: Item;
}

export interface Delivery {
  delivery_id: string;
  title: string;
  status: DeliveryStatus;
  note?: string;
  request_man_no: string;
  approve_man_no?: string;
  created_at: string;
  requester?: Employee;
  approver?: Employee;
  items?: DeliveryItem[];
}

// ─── Stock Movement ───────────────────────────────────────────────────────
export interface StockMovement {
  movement_no: string;
  from_storage_code: string;
  to_storage_code: string;
  item_code: string;
  quantity: number;
  status: string;
  note?: string;
  serial_number_ids?: number[] | null;
  move_man_no: string;
  approved_man_no?: string;
  to_man_no?: string;
  created_at: string;
  item?: Item;
  fromStorage?: Storage;
  toStorage?: Storage;
  mover?: Employee;
  approver?: Employee;
  receiver?: Employee;
  serials?: SerialNumber[];   // findOne 상세: 이동된 S/N 목록
}

// ─── Stock Usage ──────────────────────────────────────────────────────────
export interface StockUsageSerial {
  serial_no: string;
  tags: Record<string, string> | null;
}

export interface StockUsage {
  usage_no: string;
  item_code: string;
  storage_code: string;
  quantity: number;
  purpose?: string;
  /** 사용기한 (YYYY-MM-DD) — is_indefinite=1이면 null */
  use_until?: string | null;
  /** 무기한 사용 여부 */
  is_indefinite?: number;
  /** 사용처 — 창고 코드 또는 'EXTERNAL' */
  use_place_code?: string | null;
  /** 사용처가 외부일 때 직접 입력한 장소명 */
  use_place_name?: string | null;
  status: string;  // PENDING | COMPLETED | RETURNED | CANCELLED
  is_cancelled: number;
  cancelled_at?: string;
  cancel_reason?: string;
  use_man_no: string | null;
  use_name?: string | null;   // 미가입자 이름
  cancel_man_no?: string;
  created_at: string;
  item?: Item;
  storage?: Storage;
  user?: Employee;
  canceller?: Employee;
  /** S/N 관리 품목의 사용 S/N 목록 (태그 검색용) */
  serialNumbers?: StockUsageSerial[];
}

// ─── Asset Instance ───────────────────────────────────────────────────────
export type AssetStatus = 'IN_STOCK' | 'IN_USE' | 'DISPOSED';

export interface AssetInstance {
  asset_id: string;
  item_code: string;
  serial_no: string;
  storage_code: string;
  status: AssetStatus;
  acquired_at?: string | null;
  note?: string | null;
  man_no: string;
  created_at: string;
  item?: Item;
  storage?: Storage;
  registeredBy?: Employee;
}

// ─── Pagination / API ─────────────────────────────────────────────────────
export interface ApiError {
  message: string;
  statusCode?: number;
}
