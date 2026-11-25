'use client';

import { useEffect } from 'react';

import { TradePanelCenteredState } from '@/components/trade/trade-panel-centered-state';

/**
 * Scoped to the trade segment so a failing market, chart or SPT panel degrades inside the
 * existing shell (nav + ticker stay mounted) instead of replacing the whole application.
 */
export default function TradeError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[trade error]', error);
  }, [error]);

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-10">
      <TradePanelCenteredState
        headline="This trading view could not be displayed"
        message="Your balances and any open orders are unaffected. Retrying reloads this panel."
        onRetry={reset}
        retryLabel="Reload panel"
      />
    </div>
  );
}
