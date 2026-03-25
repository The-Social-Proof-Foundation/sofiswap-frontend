'use client';

import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { useMySocialAuth } from '@/hooks/useMySocialAuth';
import { cn } from '@/lib/utils';

function truncateAddress(addr: string, head = 6, tail = 4): string {
  if (addr.length <= head + tail + 1) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

export function TradeTopNav({ className }: { className?: string }) {
  const {
    isConfigured,
    isAuthenticated,
    displayAddress,
    isLoading,
    isSigningIn,
    signIn,
    signOut,
    rateLimited,
  } = useMySocialAuth();

  const onPrimaryClick = () => {
    if (isAuthenticated) {
      void signOut();
      return;
    }
    void signIn('none').catch((e) => {
      console.error('[TradeTopNav] signIn', e);
    });
  };

  return (
    <header
      className={cn(
        'sticky top-0 z-50 border-b border-border/60 bg-background/65 backdrop-blur-xl supports-[backdrop-filter]:bg-background/55',
        className
      )}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="font-sans text-lg font-bold tracking-tight text-foreground transition-opacity hover:opacity-90"
        >
          <span className="text-primary">Sofi</span>
          <span className="text-foreground">Swap</span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          {!isConfigured ? (
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Set env to enable login
            </span>
          ) : null}
          {isAuthenticated && displayAddress ? (
            <span className="hidden max-w-[10rem] truncate rounded-md border border-border/80 bg-muted/40 px-2 py-1 font-mono text-xs text-muted-foreground sm:inline-block">
              {truncateAddress(displayAddress)}
            </span>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant={isAuthenticated ? 'outline' : 'default'}
            className="font-medium"
            disabled={!isConfigured || isLoading || isSigningIn}
            onClick={onPrimaryClick}
          >
            {!isConfigured
              ? 'Login unavailable'
              : isLoading
                ? '…'
                : isAuthenticated
                  ? 'Sign out'
                  : rateLimited
                    ? 'Retry later'
                    : isSigningIn
                      ? 'Connecting…'
                      : 'Get started'}
          </Button>
        </div>
      </div>
    </header>
  );
}
