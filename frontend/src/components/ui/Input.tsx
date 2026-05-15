import React, { type InputHTMLAttributes } from 'react';
import { cn } from './Button';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, helperText, id, ...props }, ref) => {
    // Generate a unique ID if none provided but label exists
    const inputId = id || (label ? `input-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined);
    
    return (
      <div className="w-full flex flex-col gap-1.5 touch-manipulation">
        {label && (
          <label htmlFor={inputId} className="text-xs uppercase tracking-wide text-neutral-600 font-medium">
            {label}
            {props.required && <span className="text-danger ml-1">*</span>}
          </label>
        )}
        <input
          id={inputId}
          ref={ref}
          className={cn(
            "flex h-12 md:h-11 w-full rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-900 transition-colors placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-500",
            error && "border-danger focus:ring-danger text-danger",
            className
          )}
          {...props}
        />
        {helperText && !error && (
          <p className="text-xs text-neutral-500 mt-0.5">{helperText}</p>
        )}
        {error && <p className="text-sm text-danger mt-1">{error}</p>}
      </div>
    );
  }
);
Input.displayName = 'Input';
