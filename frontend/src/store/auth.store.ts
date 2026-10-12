import { create } from 'zustand';
import type { AuthUser } from '../types';

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  setAuth: (token: string, user: AuthUser) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
  isAdmin: () => boolean;
  isMaster: () => boolean;
  hasPermission: (perm: string) => boolean;
}

const savedToken = localStorage.getItem('erp_token');
const savedUser = localStorage.getItem('erp_user');

export const useAuthStore = create<AuthState>((set, get) => ({
  token: savedToken,
  user: savedUser ? JSON.parse(savedUser) : null,

  setAuth: (token, user) => {
    localStorage.setItem('erp_token', token);
    localStorage.setItem('erp_user', JSON.stringify(user));
    set({ token, user });
  },

  logout: () => {
    localStorage.removeItem('erp_token');
    localStorage.removeItem('erp_user');
    set({ token: null, user: null });
  },

  isAuthenticated: () => !!get().token && !!get().user,

  isAdmin: () => {
    const r = get().user?.man_roll;
    return r === 'ADMIN' || r === 'MASTER';
  },

  isMaster: () => get().user?.man_roll === 'MASTER',

  hasPermission: (perm: string) => {
    const user = get().user;
    if (!user) return false;
    if (user.man_roll === 'MASTER') return true;
    return (user.permissions ?? []).includes(perm);
  },
}));
