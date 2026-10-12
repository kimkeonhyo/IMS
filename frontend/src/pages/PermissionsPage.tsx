import { Fragment, useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { rolePermissionsApi } from '../api/rolePermissions';
import { PERM_GROUPS, ALL_PERM_KEYS, ROLE_DESC } from '../constants/permissions';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';

const ROLES = ['MASTER', 'ADMIN', 'USER'] as const;
type RoleKey = typeof ROLES[number];

export function PermissionsPage() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({
    queryKey: ['role-permissions'],
    queryFn: rolePermissionsApi.findAll,
  });

  // 서버 값을 로컬 편집 상태로 복사 — 저장 전까지는 화면에서만 바뀐다
  const [draft, setDraft] = useState<Record<string, string[]>>({});
  useEffect(() => {
    if (!data.length) return;
    // 폐지된 기능의 권한이 남아 있어도 저장 시 되살아나지 않도록 현재 목록으로 거른다
    setDraft(Object.fromEntries(
      data.map(r => [r.role, (r.permissions ?? []).filter(p => ALL_PERM_KEYS.includes(p))]),
    ));
  }, [data]);

  const saved = useMemo(
    () => Object.fromEntries(
      data.map(r => [r.role, (r.permissions ?? []).filter(p => ALL_PERM_KEYS.includes(p)).sort()]),
    ),
    [data],
  );
  const dirtyRoles = ROLES.filter(role => {
    if (role === 'MASTER') return false;
    const a = [...(draft[role] ?? [])].sort();
    const b = saved[role] ?? [];
    return JSON.stringify(a) !== JSON.stringify(b);
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      for (const role of dirtyRoles) {
        await rolePermissionsApi.update(role, draft[role] ?? []);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['role-permissions'] }),
    onError: (err: any) => alert(err?.response?.data?.message ?? '저장 중 오류가 발생했습니다.'),
  });

  const has = (role: string, key: string) => (draft[role] ?? []).includes(key);
  const toggle = (role: RoleKey, key: string) => {
    if (role === 'MASTER') return;
    setDraft(prev => {
      const cur = prev[role] ?? [];
      return { ...prev, [role]: cur.includes(key) ? cur.filter(k => k !== key) : [...cur, key] };
    });
  };
  const toggleGroup = (role: RoleKey, keys: string[]) => {
    if (role === 'MASTER') return;
    setDraft(prev => {
      const cur = prev[role] ?? [];
      const allOn = keys.every(k => cur.includes(k));
      return { ...prev, [role]: allOn ? cur.filter(k => !keys.includes(k)) : [...new Set([...cur, ...keys])] };
    });
  };
  const setAll = (role: RoleKey, on: boolean) => {
    if (role === 'MASTER') return;
    setDraft(prev => ({ ...prev, [role]: on ? [...ALL_PERM_KEYS] : [] }));
  };

  const countOf = (role: string) => role === 'MASTER' ? ALL_PERM_KEYS.length : (draft[role] ?? []).length;

  if (isLoading) return <p className="text-sm text-gray-400">불러오는 중…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-800">권한관리</h1>
          <p className="mt-1 text-sm text-gray-500">
            권한은 사용자 개인이 아니라 <strong>역할</strong>에 부여됩니다. 직원의 역할을 바꾸면 그 역할의 권한이 그대로 적용됩니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dirtyRoles.length > 0 && (
            <span className="text-xs text-amber-600">{dirtyRoles.join(', ')} 변경됨</span>
          )}
          <Button
            onClick={() => saveMut.mutate()}
            loading={saveMut.isPending}
            disabled={dirtyRoles.length === 0}
          >저장</Button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 font-semibold text-gray-600 w-64">기능</th>
              {ROLES.map(role => (
                <th key={role} className="px-4 py-3 text-center font-semibold text-gray-600 w-40">
                  <div className="flex flex-col items-center gap-0.5">
                    <span>{role}</span>
                    <span className="text-[11px] font-normal text-gray-400">{countOf(role)}개</span>
                    {role === 'MASTER'
                      ? <Badge label="전체 고정" color="gray" />
                      : (
                        <div className="flex gap-1 text-[11px] font-normal">
                          <button type="button" onClick={() => setAll(role, true)}
                            className="text-indigo-600 hover:underline cursor-pointer">전체</button>
                          <span className="text-gray-300">|</span>
                          <button type="button" onClick={() => setAll(role, false)}
                            className="text-gray-500 hover:underline cursor-pointer">해제</button>
                        </div>
                      )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERM_GROUPS.map(g => {
              const keys = g.perms.map(p => p.key);
              return (
                <Fragment key={g.group}>
                  <tr className="bg-gray-50/60 border-t border-gray-100">
                    <td className="px-4 py-2 font-medium text-gray-700">{g.group}</td>
                    {ROLES.map(role => (
                      <td key={role} className="px-4 py-2 text-center">
                        {role === 'MASTER' ? (
                          <span className="text-xs text-gray-300">-</span>
                        ) : (
                          <button type="button" onClick={() => toggleGroup(role, keys)}
                            className="text-[11px] text-indigo-600 hover:underline cursor-pointer">
                            {keys.every(k => has(role, k)) ? '그룹 해제' : '그룹 선택'}
                          </button>
                        )}
                      </td>
                    ))}
                  </tr>
                  {g.perms.map(p => (
                    <tr key={p.key} className="border-t border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-2 pl-8 text-gray-600">
                        {p.label}
                        <span className="ml-2 font-mono text-[11px] text-gray-300">{p.key}</span>
                      </td>
                      {ROLES.map(role => (
                        <td key={role} className="px-4 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={role === 'MASTER' ? true : has(role, p.key)}
                            disabled={role === 'MASTER'}
                            onChange={() => toggle(role, p.key)}
                            className="rounded text-indigo-600 focus:ring-indigo-400 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {ROLES.map(role => (
          <div key={role} className="rounded-lg border border-gray-200 bg-white px-3 py-2">
            <p className="text-sm font-semibold text-gray-700">{role}</p>
            <p className="mt-0.5 text-xs text-gray-500">{ROLE_DESC[role]}</p>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400">
        변경한 권한은 저장 즉시 적용됩니다. 이미 로그인해 있는 사용자는 다시 로그인하거나 새로고침해야 메뉴에 반영됩니다.
      </p>
    </div>
  );
}
