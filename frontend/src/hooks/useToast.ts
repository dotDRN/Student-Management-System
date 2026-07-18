import { useMemo } from 'react';
import { useToastStore } from '../store/useToastStore';
import type { ToastInput, ToastType } from '../types/toast';

type ToastOptions = Omit<ToastInput, 'type' | 'duration' | 'dismissible'> &
  Partial<Pick<ToastInput, 'duration' | 'dismissible'>>;

const defaultOptions: Pick<ToastInput, 'duration' | 'dismissible'> = {
  duration: 5000,
  dismissible: true,
};

export const useToast = () => {
  const showToast = useToastStore((state) => state.showToast);

  return useMemo(() => {
    const show = (type: ToastType, options: ToastOptions) => (
      showToast({ ...defaultOptions, ...options, type })
    );

    return {
      success: (options: ToastOptions) => show('success', options),
      error: (options: ToastOptions) => show('error', options),
      warning: (options: ToastOptions) => show('warning', options),
      info: (options: ToastOptions) => show('info', options),
      notification: (options: ToastOptions) => show('notification', options),
    };
  }, [showToast]);
};
