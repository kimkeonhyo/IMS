import client from './client';
import type { Employee } from '../types';

export interface CreateEmployeeDto {
  man_no?: string;
  man_id: string; password: string; name: string;
  man_roll: string; man_team: string; email?: string; phone?: string;
}

export interface ImportResult {
  created: number;
  skipped: number;
  errors: string[];
}

export interface ActiveEmployee {
  man_no: string;
  name: string;
  man_team: string;
  man_roll: string;
}

export const employeesApi = {
  findAll:       () => client.get<Employee[]>('/employees').then(r => r.data),
  findActiveList: () => client.get<ActiveEmployee[]>('/employees/active').then(r => r.data),
  findOne: (man_no: string) => client.get<Employee>(`/employees/${man_no}`).then(r => r.data),
  create:  (dto: CreateEmployeeDto) => client.post<Employee>('/employees', dto).then(r => r.data),
  update:  (man_no: string, dto: Partial<CreateEmployeeDto>) =>
    client.patch<Employee>(`/employees/${man_no}`, dto).then(r => r.data),
  toggleActive: (man_no: string) =>
    client.patch<Employee>(`/employees/${man_no}/toggle-active`).then(r => r.data),
  importFile: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return client.post<ImportResult>('/employees/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);
  },
};
