import { create } from 'zustand';

interface Toast {
  id: number;
  message: string;
  type: 'error' | 'success';
}

interface ToastStore {
  toasts: Toast[];
  addToast: (message: string, type?: 'error' | 'success') => void;
  removeToast: (id: number) => void;
}

let seq = 0;

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (message, type = 'error') => {
    const id = ++seq;
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4000);
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
