import { create } from 'zustand';
import type { Toast, ToastInput } from '../types/toast';

const MAX_VISIBLE_TOASTS = 3;

interface ToastState {
  toasts: Toast[];
  showToast: (toast: ToastInput) => string;
  removeToast: (id: string) => void;
  clear: () => void;
}

const createToastId = () => (
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
);

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  showToast: (toast) => {
    const id = createToastId();
    set((state) => ({
      // The first three entries are visible; the remainder is the FIFO queue.
      toasts: [...state.toasts, { ...toast, id, createdAt: Date.now() }],
    }));
    return id;
  },

  removeToast: (id) => set((state) => ({
    toasts: state.toasts.filter((toast) => toast.id !== id),
  })),

  clear: () => set({ toasts: [] }),
}));

export const maxVisibleToasts = MAX_VISIBLE_TOASTS;
