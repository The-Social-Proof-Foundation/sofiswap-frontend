'use client';

import type { ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function TradePanelCenteredState({
  headline,
  message,
  className,
  headlineClassName,
  variant = 'error',
  onRetry,
  retryLabel = 'Retry',
}: {
  headline: string;
  message: string;
  className?: string;
  /** When set, overrides default headline color for this variant. */
  headlineClassName?: string;
  variant?: 'error' | 'muted';
  /**
   * When provided, renders a retry control. Panels previously dead-ended on a transient
   * failure even though every data hook already exposes a refresh function.
   */
  onRetry?: () => void;
  retryLabel?: string;
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
              : 'text-muted-foreground'
          )}
        >
          {message}
        </p>
      ) : null}
      {onRetry ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-1 h-8 gap-1.5 rounded-lg px-3 text-xs"
          onClick={onRetry}
        >
          <RefreshCw className="size-3.5" aria-hidden />
          {retryLabel}
        </Button>
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
