'use client';

import { cn } from '@/lib/utils';
import {
  formatChangePercent,
  formatCompactDecimal,
  formatOrderPrice,
} from '@/lib/trade/orderbook-format';
import type { OrderBookSnapshot } from '@/lib/trade/orderbook-types';
import { useMemo } from 'react';

const rowClass =
  'grid grid-cols-[1fr_minmax(0,1.1fr)_minmax(0,1.15fr)] gap-x-2 px-2 py-0.5 text-[11px] leading-tight font-mono tabular-nums';

function cumulativeAsksTotals(
  asksDescending: { price: number; size: number }[]
): number[] {
  const n = asksDescending.length;
  const totals = new Array<number>(n);
  let run = 0;
  for (let i = n - 1; i >= 0; i--) {
    const { price, size } = asksDescending[i];
    run += price * size;
    totals[i] = run;
  }
  return totals;
}

function cumulativeBidTotals(bidsDescending: { price: number; size: number }[]): number[] {
  let run = 0;
  return bidsDescending.map(({ price, size }) => {
    run += price * size;
    return run;
  });
}

export function TradeOrderBookPanel({
  className,
  baseSymbol,
  quoteSymbol,
  snapshot,
  maxLevelsPerSide = 14,
  isLoading,
  error,
}: {
  className?: string;
  baseSymbol: string;
  quoteSymbol: string;
  snapshot: OrderBookSnapshot | null;
  maxLevelsPerSide?: number;
  isLoading?: boolean;
  error?: string | null;
}) {
  const { asks, bids, askTotals, bidTotals, mid, changeFraction } = useMemo(() => {
    if (!snapshot) {
      return {
        asks: [] as OrderBookSnapshot['asks'],
        bids: [] as OrderBookSnapshot['bids'],
        askTotals: [] as number[],
        bidTotals: [] as number[],
        mid: null as number | null,
        changeFraction: undefined as number | undefined,
      };
    }
    const asksAll = snapshot.asks;
    const bidsAll = snapshot.bids;
    /** Asks are high → low; show the best (closest to mid) levels at the bottom of the block. */
    const asksSlice = asksAll.slice(Math.max(0, asksAll.length - maxLevelsPerSide));
    /** Bids are high → low; best bid first — keep the top of the book. */
    const bidsSlice = bidsAll.slice(0, maxLevelsPerSide);
    const bestAsk = asksSlice.length ? asksSlice[asksSlice.length - 1].price : null;
    const bestBid = bidsSlice.length ? bidsSlice[0].price : null;
    const derivedMid =
      snapshot.midPrice ??
      (bestAsk != null && bestBid != null ? (bestAsk + bestBid) / 2 : bestAsk ?? bestBid);
    return {
      asks: asksSlice,
      bids: bidsSlice,
      askTotals: cumulativeAsksTotals(asksSlice),
      bidTotals: cumulativeBidTotals(bidsSlice),
      mid: derivedMid,
      changeFraction: snapshot.changeFraction,
    };
  }, [snapshot, maxLevelsPerSide]);

  const busy = Boolean(isLoading);

  return (
    <div
      className={cn('flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden', className)}
      aria-busy={busy}
      aria-label="Order book"
    >
      <div className={cn(rowClass, 'shrink-0 text-muted-foreground')} role="row">
        <span role="columnheader" className="text-left font-sans text-[10px] font-medium">
          Price
        </span>
        <span role="columnheader" className="text-right font-sans text-[10px] font-medium">
          Size ({baseSymbol})
        </span>
        <span role="columnheader" className="text-right font-sans text-[10px] font-medium">
          Total ({quoteSymbol})
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        {error ? (
          <p className="px-2 py-3 text-center text-[11px] text-destructive" role="status">
            {error}
          </p>
        ) : (
          <>
            <div role="rowgroup" aria-label="Ask orders">
              {asks.map((row, i) => (
                <div key={`ask-${row.price}-${i}`} className={rowClass} role="row">
                  <span className="text-left text-rose-500 dark:text-rose-400">
                    {formatOrderPrice(row.price)}
                  </span>
                  <span className="text-right text-foreground/85">{formatCompactDecimal(row.size)}</span>
                  <span className="text-right text-foreground/85">
                    {formatCompactDecimal(askTotals[i] ?? 0)}
                  </span>
                </div>
              ))}
            </div>
            <div
              className="sticky top-0 z-[1] flex shrink-0 items-baseline justify-center gap-2 border-y border-trade-shell bg-background/95 px-2 py-1.5 backdrop-blur-sm"
              role="status"
            >
              <span className="text-sm font-semibold tabular-nums text-foreground">
                {mid != null && Number.isFinite(mid) ? formatOrderPrice(mid) : '—'}
              </span>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {formatChangePercent(changeFraction)}
              </span>
            </div>
            <div role="rowgroup" aria-label="Bid orders">
              {bids.map((row, i) => (
                <div key={`bid-${row.price}-${i}`} className={rowClass} role="row">
                  <span className="text-left text-emerald-600 dark:text-emerald-400">
                    {formatOrderPrice(row.price)}
                  </span>
                  <span className="text-right text-foreground/85">{formatCompactDecimal(row.size)}</span>
                  <span className="text-right text-foreground/85">
                    {formatCompactDecimal(bidTotals[i] ?? 0)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
