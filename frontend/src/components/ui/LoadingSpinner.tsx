import React from 'react';
import { cn } from './Button';

interface LoadingSpinnerProps {
  className?: string;
  label?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  className,
  label = 'Loading…',
}) => (
  <div
    className={cn('flex flex-col items-center justify-center gap-4 py-16 text-neutral-500', className)}
    role="status"
    aria-live="polite"
  >
    <svg
      className="h-10 w-10 animate-spin text-primary"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
    <span className="text-sm font-medium">{label}</span>
  </div>
);
