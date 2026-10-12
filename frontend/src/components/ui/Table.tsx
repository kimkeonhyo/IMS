import { type ReactNode } from 'react';

interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  width?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  loading?: boolean;
  emptyText?: string;
  rowKey: (row: T) => string;
}

export function Table<T>({ columns, data, onRowClick, loading, emptyText = '데이터가 없습니다.', rowKey }: TableProps<T>) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            {columns.map(col => (
              <th key={col.key} className={`px-4 py-3 font-medium text-gray-600 ${col.width ?? ''}`}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={columns.length} className="text-center py-10 text-gray-400">불러오는 중...</td></tr>
          ) : data.length === 0 ? (
            <tr><td colSpan={columns.length} className="text-center py-10 text-gray-400">{emptyText}</td></tr>
          ) : (
            data.map(row => (
              <tr
                key={rowKey(row)}
                className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map(col => (
                  <td key={col.key} className="px-4 py-3 text-gray-800">
                    {col.render ? col.render(row) : (row as Record<string, unknown>)[col.key] as ReactNode}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
