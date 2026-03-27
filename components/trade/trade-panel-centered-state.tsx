'use client';

import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export function TradePanelCenteredState({
  headline,
  message,
  className,
  headlineClassName,
  variant = 'error',
}: {
  headline: string;
  message: string;
  className?: string;
  /** When set, overrides default headline color for this variant. */
  headlineClassName?: string;
  variant?: 'error' | 'muted';
}) {
  return (
    <div
      role="status"
      className={cn(
        'flex min-h-0 w-full max-w-md flex-col items-center justify-center gap-2 px-5 text-center',
        className
      )}
    >
      <p
        className={cn(
          'text-sm font-medium leading-snug',
          headlineClassName ??
            (variant === 'muted'
              ? 'text-muted-foreground'
              : 'text-foreground')
        )}
      >
        {headline}
      </p>
      {message.trim() ? (
        <p
          className={cn(
            'whitespace-pre-wrap break-words text-xs leading-relaxed',
            variant === 'error'
              ? 'text-destructive/90 dark:text-destructive/80'
              : 'text-[var(--muted-foreground)]'
          )}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}

/** Fills remaining panel height and centers {@link TradePanelCenteredState} on both axes. */
export function TradePanelCenteredStateFrame({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center py-6',
        className
      )}
    >
      {children}
    </div>
  );
}
