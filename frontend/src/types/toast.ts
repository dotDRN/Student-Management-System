export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'notification';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration: number;
  createdAt: number;
  action?: ToastAction;
  dismissible: boolean;
}

export type ToastInput = Omit<Toast, 'id' | 'createdAt'>;
