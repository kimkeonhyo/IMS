interface BadgeProps {
  label: string;
  color?: 'gray' | 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'orange';
  className?: string;
}

const colorMap: Record<string, string> = {
  gray:   'bg-gray-100 text-gray-600',
  blue:   'bg-blue-100 text-blue-700',
  green:  'bg-green-100 text-green-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  red:    'bg-red-100 text-red-700',
  purple: 'bg-purple-100 text-purple-700',
  orange: 'bg-orange-100 text-orange-700',
};

export function Badge({ label, color = 'gray', className = '' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colorMap[color]} ${className}`}>
      {label}
    </span>
  );
}

// 상태별 색상 매핑
export function statusColor(status: string): BadgeProps['color'] {
  const map: Record<string, BadgeProps['color']> = {
    DRAFT: 'gray', SUBMITTED: 'blue', APPROVED: 'green',
    REJECTED: 'red', ORDERED: 'purple', RECEIVED: 'orange',
    CANCELLED: 'gray', PENDING: 'blue', CONFIRMED: 'green',
    ACTIVE: 'green',
  };
  return map[status] ?? 'gray';
}

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    DRAFT: '임시저장', SUBMITTED: '제출됨', APPROVED: '승인됨',
    REJECTED: '반려됨', ORDERED: '발주됨', RECEIVED: '입고완료',
    CANCELLED: '취소됨', PENDING: '대기중', CONFIRMED: '확정됨',
    ACTIVE: '사용중',
  };
  return map[status] ?? status;
}
