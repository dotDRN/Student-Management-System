import React, { type HTMLAttributes } from 'react';
import { cn } from './Button';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'primary' | 'success' | 'warning' | 'danger' | 'neutral';
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'primary', children, ...props }, ref) => {
    const variants = {
      primary: 'bg-brand-50 text-brand-700 border border-brand-200/60',
      success: 'bg-emerald-50 text-emerald-700 border border-emerald-200/60',
      warning: 'bg-amber-50 text-amber-700 border border-amber-200/60',
      danger: 'bg-red-50 text-red-700 border border-red-200/60',
      neutral: 'bg-neutral-100 text-neutral-700 border border-neutral-200/60',
    };

    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
          variants[variant],
          className
        )}
        {...props}
      >
        {children}
      </span>
    );
  }
);
Badge.displayName = 'Badge';
