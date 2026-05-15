import React from 'react';
import { cn } from './Button';

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ title, description, action, className }) => (
  <div
    className={cn(
      'flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-200 bg-neutral-50/80 py-14 px-6 text-center',
      className,
    )}
  >
    <h3 className="text-base font-semibold text-neutral-900">{title}</h3>
    {description && <p className="mt-2 max-w-md text-sm text-neutral-500">{description}</p>}
    {action && <div className="mt-6">{action}</div>}
  </div>
);
