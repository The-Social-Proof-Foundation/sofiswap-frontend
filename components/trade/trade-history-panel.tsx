'use client';

import { cn } from '@/lib/utils';
import { formatCompactDecimal, formatOrderPrice } from '@/lib/trade/orderbook-format';
import type { TradePrint } from '@/lib/trade/orderbook-types';

const rowClass =
  'grid grid-cols-[1fr_minmax(0,1fr)] gap-x-2 px-2 py-0.5 text-[11px] leading-tight tabular-nums';

export function TradeHistoryPanel({
  className,
  trades,
  isLoading,
  error,
}: {
  className?: string;
  trades: TradePrint[];
  isLoading?: boolean;
  error?: string | null;
}) {
  const busy = Boolean(isLoading);

  return (
    <div
      className={cn('flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden', className)}
      aria-busy={busy}
      aria-label="Trade history"
    >
      <div className={cn(rowClass, 'shrink-0 font-sans text-muted-foreground')} role="row">
        <span role="columnheader" className="text-left text-[10px] font-medium">
          Price
        </span>
        <span role="columnheader" className="text-right text-[10px] font-medium">
          Size
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden" role="list">
        {error ? (
          <p className="px-2 py-3 text-center text-[11px] text-destructive" role="status">
            {error}
          </p>
        ) : trades.length === 0 && !busy ? (
          <p className="px-2 py-3 text-center text-[11px] text-muted-foreground" role="status">
            No trades
          </p>
        ) : (
          trades.map((t, i) => (
            <div
              key={`${t.price}-${t.size}-${t.side}-${i}`}
              className={cn(rowClass, 'font-mono')}
              role="listitem"
            >
              <span
                className={cn(
                  'text-left',
                  t.side === 'buy'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-500 dark:text-rose-400'
                )}
              >
                {formatOrderPrice(t.price)}
              </span>
              <span className="text-right text-foreground/85">{formatCompactDecimal(t.size)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
