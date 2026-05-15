import React from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from './Button';

interface ErrorMessageProps {
  message: string;
  className?: string;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({ message, className }) => (
  <div
    className={cn(
      'flex items-start gap-3 rounded-xl border border-danger/20 bg-danger/10 p-4 text-danger',
      className,
    )}
    role="alert"
  >
    <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden />
    <p className="text-sm font-medium">{message}</p>
  </div>
);
