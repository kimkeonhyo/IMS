import client from './client';
import type { AuthUser } from '../types';

export interface RegistrationRequest {
  id: string;
  email: string;
  azure_name: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reject_reason: string | null;
  reviewed_by: string | null;
  requested_at: string;
  reviewed_at: string;
}

export interface ApproveDto {
  man_team: string;
  man_roll: 'MASTER' | 'ADMIN' | 'USER';
}

export interface RejectDto {
  reason?: string;
}

export const authApi = {
  me: () => client.get<AuthUser>('/auth/me').then(r => r.data),
  getRegistrationRequests: () => client.get<RegistrationRequest[]>('/auth/registration-requests').then(r => r.data),
  approveRegistration: (id: string, dto: ApproveDto) => client.post(`/auth/registration-requests/${id}/approve`, dto).then(r => r.data),
  rejectRegistration: (id: string, dto: RejectDto) => client.post(`/auth/registration-requests/${id}/reject`, dto).then(r => r.data),
};
