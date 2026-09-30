'use client';

import {
  TradePanelCenteredState,
  TradePanelCenteredStateFrame,
} from '@/components/trade/trade-panel-centered-state';
import { cn } from '@/lib/utils';
import {
  createOrderPriceFormat,
  formatChangePercent,
  formatOrderBookAmount,
  formatUsdQuotePrice,
  orderBookPriceDecimals,
  orderBookSpreadFraction,
  ORDERBOOK_MIN_PRICE_DECIMALS,
} from '@/lib/trade/orderbook-format';
import {
  ORDERBOOK_DEFAULT_LEVELS_PER_SIDE,
  type OrderBookSnapshot,
} from '@/lib/trade/orderbook-types';
import { useMemo } from 'react';

const rowClass =
  'grid grid-cols-[1fr_minmax(0,1.1fr)_minmax(0,1.15fr)] gap-x-2 px-2 py-0.5 text-[11px] leading-tight font-mono tabular-nums';

/** One ladder row with its cumulative depth, measured outward from the spread. */
type BookRow = { price: number; size: number; total: number };

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
  maxLevelsPerSide = ORDERBOOK_DEFAULT_LEVELS_PER_SIDE,
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
  const { askRows, bidRows, mid, changeFraction, spreadFraction, usdMidLabel, priceDecimals } = useMemo(() => {
    if (!snapshot) {
      return {
        askRows: [] as BookRow[],
        bidRows: [] as BookRow[],
        mid: null as number | null,
        changeFraction: undefined as number | undefined,
        spreadFraction: null as number | null,
        usdMidLabel: null as string | null,
        priceDecimals: ORDERBOOK_MIN_PRICE_DECIMALS,
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
    const askTotals = cumulativeAsksTotals(asksSlice);
    const bidTotals = cumulativeBidTotals(bidsSlice);
    const toRows = (levels: OrderBookSnapshot['asks'], totals: number[]): BookRow[] =>
      levels.map((row, i) => ({ price: row.price, size: row.size, total: totals[i] ?? 0 }));
    return {
      /** Ascending, best ask first: the pane renders reversed, so the best ask sits on the mid line. */
      askRows: toRows(asksSlice, askTotals).reverse(),
      bidRows: toRows(bidsSlice, bidTotals),
      mid: derivedMid,
      changeFraction: snapshot.changeFraction,
      /** Best-ask spread as a share of the mid — the ladder's own volatility read. */
      spreadFraction: orderBookSpreadFraction(bestBid, bestAsk, derivedMid),
      /** Dollar value of the mid, for a one-sided book (e.g. bids only) where no spread exists. */
      usdMidLabel: formatUsdQuotePrice(derivedMid ?? 0, quoteSymbol),
      /** Enough precision that a fine-tick book does not round two levels into the same price. */
      priceDecimals: orderBookPriceDecimals(
        asksSlice.map((level) => level.price).concat(bidsSlice.map((level) => level.price))
      ),
    };
  }, [snapshot, maxLevelsPerSide, quoteSymbol]);

  /** Fixed precision per snapshot: one formatter for every row, and the mid matches the ladder. */
  const priceFormat = useMemo(() => createOrderPriceFormat(priceDecimals), [priceDecimals]);

  /**
   * The mid row's second value: spread when both sides are quoted, otherwise the dollar value,
   * otherwise whatever change figure the depth feed sent. Never a bare em dash while a mid exists.
   */
  const midContext = useMemo(() => {
    if (spreadFraction != null) {
      return { text: formatChangePercent(spreadFraction), title: 'Spread between best bid and ask' };
    }
    if (usdMidLabel) return { text: usdMidLabel, title: 'Reference price in USD' };
    if (changeFraction != null && Number.isFinite(changeFraction)) {
      return { text: formatChangePercent(changeFraction), title: 'Change' };
    }
    return { text: '—', title: 'No quote yet' };
  }, [spreadFraction, usdMidLabel, changeFraction]);

  const busy = Boolean(isLoading);
  /** A poll that fails reports; it only takes over the panel when there is nothing drawn yet. */
  const hasBook = askRows.length > 0 || bidRows.length > 0;

  if (error && !hasBook) {
    return (
      <div
        className={cn('flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden', className)}
        aria-busy={busy}
        aria-label="Order book"
      >
        <TradePanelCenteredStateFrame>
          <TradePanelCenteredState
            headline="Unable to load the order book"
            message={error}
            headlineClassName="text-primary"
          />
        </TradePanelCenteredStateFrame>
      </div>
    );
  }

  return (
    <div
      className={cn('flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden', className)}
      aria-busy={busy}
      aria-label="Order book"
    >
      <div className={cn(rowClass, 'shrink-0 text-[var(--muted-foreground)]')} role="row">
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
      {error ? (
        <p
          role="status"
          className="shrink-0 border-b border-destructive/30 bg-destructive/10 px-2 py-1 text-[10px] leading-snug text-destructive"
        >
          {error} Showing the last update.
        </p>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col">
        {/*
          Asks hang off the mid price: the best ask sits directly on the spread line and deeper
          levels scroll upward. `flex-col-reverse` anchors that natively, so a polling refresh
          can never yank the reader's scroll position, and the pane stays centered by layout.
        */}
        <div
          role="rowgroup"
          aria-label="Ask orders"
          className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto overflow-x-hidden overscroll-y-contain"
        >
          {askRows.map((row, i) => (
            <div key={`ask-${row.price}-${i}`} className={rowClass} role="row">
              <span className="text-left text-rose-500 dark:text-rose-400">
                {priceFormat.format(row.price)}
              </span>
              <span className="truncate text-right text-[var(--muted-foreground)]">
                {formatOrderBookAmount(row.size)}
              </span>
              <span className="truncate text-right text-[var(--muted-foreground)]">
                {formatOrderBookAmount(row.total, 2, 2)}
              </span>
            </div>
          ))}
        </div>
        <div
          className="flex shrink-0 items-baseline justify-center gap-2 border-y border-trade-shell bg-muted/30 px-2 py-1.5"
          role="status"
        >
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {mid != null && Number.isFinite(mid) ? priceFormat.format(mid) : '—'}
          </span>
          <span
            className="text-[11px] tabular-nums text-[var(--muted-foreground)]"
            title={midContext.title}
          >
            {midContext.text}
          </span>
        </div>
        <div
          role="rowgroup"
          aria-label="Bid orders"
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain"
        >
          {bidRows.map((row, i) => (
            <div key={`bid-${row.price}-${i}`} className={rowClass} role="row">
              <span className="text-left text-emerald-600 dark:text-emerald-400">
                {priceFormat.format(row.price)}
              </span>
              <span className="truncate text-right text-[var(--muted-foreground)]">
                {formatOrderBookAmount(row.size)}
              </span>
              <span className="truncate text-right text-[var(--muted-foreground)]">
                {formatOrderBookAmount(row.total, 2, 2)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
