import { useCallback } from 'react';
import { maxVisibleToasts, useToastStore } from '../../store/useToastStore';
import { Toast } from './Toast';

export const ToastContainer = () => {
  const toasts = useToastStore((state) => state.toasts);
  const removeToast = useToastStore((state) => state.removeToast);
  const handleRemove = useCallback((id: string) => removeToast(id), [removeToast]);

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-3 sm:right-6 sm:top-6">
      {toasts.slice(0, maxVisibleToasts).map((toast) => (
        <Toast key={toast.id} toast={toast} onRemove={handleRemove} />
      ))}
    </div>
  );
};
