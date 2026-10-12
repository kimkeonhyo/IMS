// 권한 카탈로그 — 백엔드 Permission enum과 1:1로 맞춘다 (운영관리 > 권한관리에서 역할별로 부여)
// 구매요청·발주관리는 폐지된 기능이라 목록에서 제외 (해당 API는 MASTER 전용)
export const PERM_GROUPS = [
  { group: '입고관리', perms: [
    { key: 'store:receive', label: '입고처리' }, { key: 'store:cancel', label: '입고취소' },
  ] },
  { group: '납품관리', perms: [
    { key: 'shipment:create', label: '등록' }, { key: 'shipment:update', label: '수정' },
    { key: 'shipment:confirm', label: '납품완료' }, { key: 'shipment:cancel', label: '취소' },
    { key: 'shipment:retrieve', label: '회수처리' },
  ] },
  { group: '재고이동', perms: [
    { key: 'movement:create', label: '등록' }, { key: 'movement:approve', label: '승인' },
    { key: 'movement:cancel', label: '취소' },
  ] },
  { group: '재고사용', perms: [
    { key: 'usage:create', label: '등록' }, { key: 'usage:update', label: '수정' },
    { key: 'usage:cancel', label: '취소' },
  ] },
  { group: '고장/수리', perms: [
    { key: 'repair:create', label: '고장신고' }, { key: 'repair:update', label: '수리등록/완료' },
    { key: 'repair:cancel', label: '신고취소' },
  ] },
  { group: '품목관리', perms: [{ key: 'item:create', label: '등록' }, { key: 'item:update', label: '수정' }] },
  { group: '창고관리', perms: [{ key: 'storage:create', label: '등록' }, { key: 'storage:update', label: '수정' }] },
  { group: '직원관리', perms: [{ key: 'employee:create', label: '등록' }, { key: 'employee:update', label: '수정' }] },
  { group: '팀관리',   perms: [{ key: 'team:create', label: '등록' }, { key: 'team:update', label: '수정' }] },
];

export const ALL_PERM_KEYS: string[] = PERM_GROUPS.flatMap(g => g.perms.map(p => p.key));

export const ROLE_LABEL: Record<string, string> = {
  MASTER: 'MASTER', ADMIN: 'ADMIN', USER: 'USER',
};
export const ROLE_DESC: Record<string, string> = {
  MASTER: '최고 관리자 — 모든 권한을 항상 보유합니다 (변경 불가)',
  ADMIN:  '관리자 — 운영 업무 전반',
  USER:   '일반 사용자 — 담당 업무 처리',
};
