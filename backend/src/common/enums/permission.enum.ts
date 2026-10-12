export enum Permission {
  // 구매요청·발주관리는 폐지된 기능이라 권한에서 제외한다 (해당 API는 MASTER 전용)
  // 입고관리
  STORE_RECEIVE = 'store:receive',
  STORE_CANCEL  = 'store:cancel',

  // 납품관리
  SHIPMENT_CREATE   = 'shipment:create',
  SHIPMENT_UPDATE   = 'shipment:update',
  SHIPMENT_SHIP     = 'shipment:ship',   // 발송 단계 폐지 — 기존 저장 권한을 계속 허용하기 위해 남겨둔다
  SHIPMENT_CONFIRM  = 'shipment:confirm',
  SHIPMENT_CANCEL   = 'shipment:cancel',
  SHIPMENT_RETRIEVE = 'shipment:retrieve',

  // 재고이동
  MOVEMENT_CREATE  = 'movement:create',
  MOVEMENT_APPROVE = 'movement:approve',
  MOVEMENT_CANCEL  = 'movement:cancel',

  // 재고사용
  REPAIR_CREATE = 'repair:create',
  REPAIR_UPDATE = 'repair:update',
  REPAIR_CANCEL = 'repair:cancel',

  USAGE_CREATE = 'usage:create',
  USAGE_UPDATE = 'usage:update',
  USAGE_CANCEL = 'usage:cancel',

  // 운영관리
  ITEM_CREATE     = 'item:create',
  ITEM_UPDATE     = 'item:update',
  STORAGE_CREATE  = 'storage:create',
  STORAGE_UPDATE  = 'storage:update',
  EMPLOYEE_CREATE = 'employee:create',
  EMPLOYEE_UPDATE = 'employee:update',
  TEAM_CREATE     = 'team:create',
  TEAM_UPDATE     = 'team:update',
}

export const ALL_PERMISSIONS = Object.values(Permission);
