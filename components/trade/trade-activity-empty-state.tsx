'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Inbox } from 'lucide-react';

export function TradeActivityEmptyState({
  className,
  showGetStarted,
  onGetStarted,
}: {
  className?: string;
  /** When true, show primary “Get Started” (e.g. sign-in / onboarding). */
  showGetStarted?: boolean;
  onGetStarted?: () => void;
}) {
  return (
    <div
      className={cn(
        'flex min-h-[12rem] flex-1 flex-col items-center justify-center gap-3 px-4 py-8',
        className
      )}
      role="status"
    >
      <Inbox className="h-10 w-10 shrink-0 text-muted-foreground" strokeWidth={1.25} aria-hidden />
      <p className="text-sm text-muted-foreground">No data</p>
      {showGetStarted && onGetStarted ? (
        <Button type="button" className="mt-1" onClick={onGetStarted}>
          Get Started
        </Button>
      ) : null}
    </div>
  );
}
