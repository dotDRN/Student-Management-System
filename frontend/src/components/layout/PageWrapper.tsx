import React from 'react';

interface PageWrapperProps {
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}

export const PageWrapper: React.FC<PageWrapperProps> = ({ title, children, actions }) => {
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-brand-50/30">
      <div className="flex-1 overflow-y-auto">
        <main className="px-6 py-8 max-w-[1280px] mx-auto w-full">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 md:mb-8 mt-2">
            <div>
              <h1
                className="text-2xl md:text-3xl font-bold text-neutral-900 tracking-tight"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                {title}
              </h1>
            </div>
            {actions && <div className="flex items-center gap-3">{actions}</div>}
          </div>
          
          <div className="w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
