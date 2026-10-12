import client from './client';

export interface RolePermission {
  role: string;
  permissions: string[];
  updated_by: string | null;
  updated_at: string;
}

export const rolePermissionsApi = {
  findAll: (): Promise<RolePermission[]> => client.get('/role-permissions').then(r => r.data),
  update:  (role: string, permissions: string[]) =>
    client.patch<RolePermission>(`/role-permissions/${role}`, { permissions }).then(r => r.data),
};
