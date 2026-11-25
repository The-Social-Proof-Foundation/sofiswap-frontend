'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * Route-level boundary. Without this an uncaught render error unmounted the entire tree —
 * nav, ticker, order book and swap rail together — leaving Next's generic error screen with
 * no way back except a manual reload that discarded any in-progress order.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[route error]', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-sm font-semibold text-foreground">Something went wrong</p>
      <p className="max-w-md whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground">
        This screen failed to render. Your wallet and any submitted transactions are
        unaffected — retrying reloads just this view.
      </p>
      {error.digest ? (
        <p className="font-mono text-[11px] text-muted-foreground/80">Ref: {error.digest}</p>
      ) : null}
      <div className="mt-1 flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          className="h-8 gap-1.5 rounded-lg px-3 text-xs"
          onClick={reset}
        >
          <RefreshCw className="size-3.5" aria-hidden />
          Try again
        </Button>
        <Button asChild variant="outline" size="sm" className="h-8 rounded-lg px-3 text-xs">
          <Link href="/trade">Back to exchange</Link>
        </Button>
      </div>
    </div>
  );
}
