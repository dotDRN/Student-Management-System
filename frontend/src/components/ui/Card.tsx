import React, { type HTMLAttributes } from 'react';
import { cn } from './Button';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  noPadding?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, noPadding = false, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "rounded-xl shadow-2xs border border-neutral-200/80 bg-white",
          !noPadding && "p-4 md:p-6",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
Card.displayName = 'Card';
