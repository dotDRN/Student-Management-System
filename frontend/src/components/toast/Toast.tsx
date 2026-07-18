import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Bell, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import type { Toast as ToastData, ToastType } from '../../types/toast';

interface ToastProps {
  toast: ToastData;
  onRemove: (id: string) => void;
}

const toastStyles: Record<ToastType, { icon: typeof Bell; iconClass: string; progressClass: string }> = {
  success: { icon: CheckCircle2, iconClass: 'text-success', progressClass: 'bg-success' },
  error: { icon: AlertCircle, iconClass: 'text-danger', progressClass: 'bg-danger' },
  warning: { icon: TriangleAlert, iconClass: 'text-warning', progressClass: 'bg-warning' },
  info: { icon: Info, iconClass: 'text-primary', progressClass: 'bg-primary' },
  notification: { icon: Bell, iconClass: 'text-primary', progressClass: 'bg-primary' },
};

export const Toast = ({ toast, onRemove }: ToastProps) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [progress, setProgress] = useState(100);
  const [remaining, setRemaining] = useState(toast.duration);
  const remainingRef = useRef(toast.duration);
  const startedAtRef = useRef<number | null>(null);
  const removeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { icon: Icon, iconClass, progressClass } = toastStyles[toast.type];

  useEffect(() => {
    const frame = requestAnimationFrame(() => setIsVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const requestDismiss = useCallback(() => {
    if (isExiting) return;
    setIsExiting(true);
    removeTimerRef.current = setTimeout(() => onRemove(toast.id), 200);
  }, [isExiting, onRemove, toast.id]);

  useEffect(() => {
    if (isPaused || isExiting) return;

    startedAtRef.current = Date.now();
    const frame = requestAnimationFrame(() => setProgress(0));
    const timer = setTimeout(requestDismiss, remainingRef.current);

    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);

      if (startedAtRef.current !== null) {
        const elapsed = Date.now() - startedAtRef.current;
        remainingRef.current = Math.max(0, remainingRef.current - elapsed);
        setRemaining(remainingRef.current);
        setProgress((remainingRef.current / toast.duration) * 100);
        startedAtRef.current = null;
      }
    };
  }, [isExiting, isPaused, requestDismiss, toast.duration]);

  useEffect(() => () => {
    if (removeTimerRef.current) window.clearTimeout(removeTimerRef.current);
  }, []);

  const handleAction = () => {
    toast.action?.onClick();
    requestDismiss();
  };

  return (
    <article
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className="pointer-events-auto relative overflow-hidden rounded-xl border border-neutral-200 bg-white p-4 shadow-lg transition-all duration-200 ease-out"
      style={{
        opacity: isVisible && !isExiting ? 1 : 0,
        transform: isVisible && !isExiting ? 'translateX(0)' : 'translateX(1rem)',
      }}
      role="status"
    >
      <div className="flex gap-3">
        <Icon size={20} className={`mt-0.5 shrink-0 ${iconClass}`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-neutral-900">{toast.title}</p>
          {toast.description && <p className="mt-1 text-sm text-neutral-600">{toast.description}</p>}
          {toast.action && (
            <button
              type="button"
              onClick={handleAction}
              className="mt-3 text-sm font-medium text-primary hover:text-primary/80"
            >
              {toast.action.label}
            </button>
          )}
        </div>
        {toast.dismissible && (
          <button
            type="button"
            onClick={requestDismiss}
            className="-mr-1 -mt-1 rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
            aria-label="Dismiss toast"
          >
            <X size={18} />
          </button>
        )}
      </div>
      <div className="absolute bottom-0 left-0 h-1 w-full bg-neutral-100">
        <div
          className={`h-full origin-left ${progressClass}`}
          style={{
            transform: `scaleX(${progress / 100})`,
            transition: isPaused ? 'none' : `transform ${remaining}ms linear`,
          }}
        />
      </div>
    </article>
  );
};
