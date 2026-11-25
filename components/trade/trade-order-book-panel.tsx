'use client';

import {
  TradePanelCenteredState,
  TradePanelCenteredStateFrame,
} from '@/components/trade/trade-panel-centered-state';
import { tradeDownTextClass, tradeUpTextClass } from '@/lib/trade-shell-styles';
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
import { useEffect, useMemo, useRef, useState } from 'react';

const rowClass =
  'relative grid grid-cols-[1fr_minmax(0,1.1fr)_minmax(0,1.15fr)] gap-x-2 px-2 py-[3px] text-[11px] leading-tight font-mono tabular-nums';

/** Log scale with a short floor so the best level still shows a bar next to the spread. */
function depthPercent(value: number, min: number, max: number): number {
  if (!(value > 0) || !(max > 0)) return 0;
  if (!(min > 0) || max <= min) return 100;
  const lo = Math.log10(min);
  const hi = Math.log10(max);
  const t = (Math.log10(value) - lo) / (hi - lo);
  return 8 + 92 * Math.min(1, Math.max(0, t));
}

function DepthBar({
  pct,
  side,
}: {
  pct: number;
  side: 'ask' | 'bid';
}) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setWidth(Math.min(100, Math.max(0, pct))));
    return () => cancelAnimationFrame(frame);
  }, [pct]);

  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-y-[1px] right-0 rounded-sm transition-[width] duration-500 ease-out motion-reduce:transition-none',
        side === 'ask' ? 'bg-[#f07167]/30' : 'bg-[#9AE19D]/25'
      )}
      style={{ width: `${width}%` }}
    />
  );
}

/** One ladder row. `total` and `cumulativeSize` run outward from the spread. */
type BookRow = { price: number; size: number; total: number; cumulativeSize: number };

type ScrubSide = 'ask' | 'bid';

type ScrubState = {
  side: ScrubSide;
  index: number;
  /** Viewport position, just left of the order book column. */
  left: number;
  top: number;
  visible: boolean;
};

const SCRUB_PANEL_HEIGHT = 92;
const SCRUB_PANEL_WIDTH = 196;

function withRunningSize(rows: Omit<BookRow, 'cumulativeSize'>[]): BookRow[] {
  let size = 0;
  return rows.map((row) => {
    size += row.size;
    return { ...row, cumulativeSize: size };
  });
}

function ScrubPanel({
  side,
  row,
  levels,
  mid,
  baseSymbol,
  quoteSymbol,
  priceFormat,
  left,
  top,
}: {
  side: ScrubSide;
  row: BookRow;
  levels: number;
  mid: number | null;
  baseSymbol: string;
  quoteSymbol: string;
  priceFormat: Intl.NumberFormat;
  left: number;
  top: number;
}) {
  const average = row.cumulativeSize > 0 ? row.total / row.cumulativeSize : null;
  const fromMid =
    mid != null && mid > 0 && Number.isFinite(row.price) ? (row.price - mid) / mid : null;
  const tone = side === 'ask' ? 'text-[#f07167]' : tradeUpTextClass;
  const rows: { label: string; value: string }[] = [
    { label: 'Avg price', value: average != null ? priceFormat.format(average) : '—' },
    { label: `Size (${baseSymbol})`, value: formatOrderBookAmount(row.cumulativeSize) },
    {
      label: `Total (${quoteSymbol})`,
      value: `${/usd/i.test(quoteSymbol) ? '$' : ''}${formatOrderBookAmount(row.total, 2, 2)}`,
    },
  ];

  return (
    <div
      role="note"
      aria-label={`${side === 'ask' ? 'Ask' : 'Bid'} depth through ${levels} ${levels === 1 ? 'level' : 'levels'}`}
      className="pointer-events-none fixed z-30 w-[12.25rem] rounded-md border border-trade-shell bg-[#1a1d1c]/95 px-2 py-1.5 shadow-lg backdrop-blur-sm"
      style={{ left, top }}
    >
      <div className="flex items-baseline justify-between gap-2 font-sans text-[10px] font-semibold">
        <span className={tone}>{side === 'ask' ? 'Asks' : 'Bids'}</span>
        <span className="font-mono font-medium tabular-nums text-muted-foreground">
          {levels} {levels === 1 ? 'level' : 'levels'}
          {fromMid != null ? ` ${formatChangePercent(fromMid)}` : ''}
        </span>
      </div>
      <p className="mt-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
        Through {priceFormat.format(row.price)}
      </p>
      <dl className="mt-1 space-y-0.5">
        {rows.map((item) => (
          <div key={item.label} className="flex items-baseline justify-between gap-2 text-[10px]">
            <dt className="font-sans text-muted-foreground">{item.label}</dt>
            <dd className="truncate font-mono tabular-nums text-[#1c2820] dark:text-[#e8ece9]">{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

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
    const toRows = (
      levels: OrderBookSnapshot['asks'],
      totals: number[]
    ): Omit<BookRow, 'cumulativeSize'>[] =>
      levels.map((row, i) => ({ price: row.price, size: row.size, total: totals[i] ?? 0 }));
    return {
      /** Best price first, so index 0 is the spread and later indexes are deeper. */
      askRows: withRunningSize(toRows(asksSlice, askTotals).reverse()),
      bidRows: withRunningSize(toRows(bidsSlice, bidTotals)),
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
  const depthScale = useMemo(() => {
    const range = (rows: BookRow[]) => {
      const sizes = rows.map((row) => row.size).filter((size) => size > 0);
      if (sizes.length === 0) return { min: 0, max: 0 };
      return { min: Math.min(...sizes), max: Math.max(...sizes) };
    };
    return { ask: range(askRows), bid: range(bidRows) };
  }, [askRows, bidRows]);

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

  const bookRef = useRef<HTMLDivElement>(null);
  const scrubRowRef = useRef<HTMLDivElement | null>(null);
  const [scrub, setScrub] = useState<ScrubState | null>(null);

  const syncScrub = (side: ScrubSide, index: number, rowEl: HTMLDivElement) => {
    const host = bookRef.current;
    if (!host) return;
    scrubRowRef.current = rowEl;
    const column = host.closest('[aria-label="Orderbook"]') ?? host;
    const columnBox = column.getBoundingClientRect();
    const rowBox = rowEl.getBoundingClientRect();
    const hostBox = host.getBoundingClientRect();
    const left = Math.max(8, columnBox.left - SCRUB_PANEL_WIDTH - 8);
    const rawTop = side === 'ask' ? rowBox.top : rowBox.bottom - SCRUB_PANEL_HEIGHT;
    const top = Math.min(Math.max(8, rawTop), window.innerHeight - SCRUB_PANEL_HEIGHT - 8);
    const visible = rowBox.bottom > hostBox.top + 4 && rowBox.top < hostBox.bottom - 4;
    setScrub({ side, index, left, top, visible });
  };

  useEffect(() => {
    const host = bookRef.current;
    if (!host || !scrub) return;
    const onScroll = () => {
      const rowEl = scrubRowRef.current;
      if (!rowEl) return;
      syncScrub(scrub.side, scrub.index, rowEl);
    };
    host.addEventListener('scroll', onScroll, true);
    return () => host.removeEventListener('scroll', onScroll, true);
  }, [scrub?.side, scrub?.index]);

  const clearScrub = () => {
    scrubRowRef.current = null;
    setScrub(null);
  };

  const scrubRow =
    scrub == null ? null : (scrub.side === 'ask' ? askRows : bidRows)[scrub.index] ?? null;

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
      {error ? (
        <p
          role="status"
          className="shrink-0 border-b border-destructive/30 bg-destructive/10 px-2 py-1 text-[10px] leading-snug text-destructive"
        >
          {error} Showing the last update.
        </p>
      ) : null}
      <div
        ref={bookRef}
        className="relative flex min-h-0 flex-1 flex-col"
        onMouseLeave={clearScrub}
      >
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
          {askRows.map((row, i) => {
            const included = scrub?.side === 'ask' && i <= scrub.index;
            const edge = scrub?.side === 'ask' && i === scrub.index;
            return (
            <div
              key={`ask-${row.price}-${i}`}
              className={cn(rowClass, included && 'bg-[#f07167]/10')}
              role="row"
              onMouseEnter={(event) => syncScrub('ask', i, event.currentTarget)}
            >
              <DepthBar side="ask" pct={depthPercent(row.size, depthScale.ask.min, depthScale.ask.max)} />
              {edge ? (
                <span className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-px bg-[#f07167] shadow-[0_0_0_1px_rgba(240,113,103,0.35)]" />
              ) : null}
              <span className="relative text-left text-[#DC2626] dark:text-[#f07167]">
                {priceFormat.format(row.price)}
              </span>
              <span className="relative truncate text-right text-[#9f2c2c] dark:text-[#f3b2ad]">
                {formatOrderBookAmount(row.size)}
              </span>
              <span className="relative truncate text-right text-muted-foreground">
                {formatOrderBookAmount(row.total, 2, 2)}
              </span>
            </div>
            );
          })}
        </div>
        <div
          className="flex shrink-0 items-baseline justify-between gap-2 border-y border-black/10 bg-black/[0.03] px-2 py-1.5 dark:border-white/5 dark:bg-black/10"
          role="status"
        >
          <span
            className={cn(
              'text-sm font-semibold tabular-nums',
              changeFraction != null && changeFraction < 0 ? tradeDownTextClass : tradeUpTextClass
            )}
          >
            {mid != null && Number.isFinite(mid) ? priceFormat.format(mid) : '—'}
          </span>
          <span
            className="text-[11px] tabular-nums text-muted-foreground"
            title={midContext.title}
          >
            {midContext.title.startsWith('Spread') ? `Spread ${midContext.text}` : midContext.text}
          </span>
        </div>
        <div
          role="rowgroup"
          aria-label="Bid orders"
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain"
        >
          {bidRows.map((row, i) => {
            const included = scrub?.side === 'bid' && i <= scrub.index;
            const edge = scrub?.side === 'bid' && i === scrub.index;
            return (
            <div
              key={`bid-${row.price}-${i}`}
              className={cn(rowClass, included && 'bg-[#9AE19D]/10')}
              role="row"
              onMouseEnter={(event) => syncScrub('bid', i, event.currentTarget)}
            >
              <DepthBar side="bid" pct={depthPercent(row.size, depthScale.bid.min, depthScale.bid.max)} />
              {edge ? (
                <span className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-px bg-[#9AE19D] shadow-[0_0_0_1px_rgba(154,225,157,0.35)]" />
              ) : null}
              <span className={cn('relative text-left', tradeUpTextClass)}>
                {priceFormat.format(row.price)}
              </span>
              <span className="relative truncate text-right text-[#2f5a3a] dark:text-[#cfe8d1]">
                {formatOrderBookAmount(row.size)}
              </span>
              <span className="relative truncate text-right text-muted-foreground">
                {formatOrderBookAmount(row.total, 2, 2)}
              </span>
            </div>
            );
          })}
        </div>
        {scrub && scrub.visible && scrubRow ? (
          <ScrubPanel
            side={scrub.side}
            row={scrubRow}
            levels={scrub.index + 1}
            mid={mid}
            baseSymbol={baseSymbol}
            quoteSymbol={quoteSymbol}
            priceFormat={priceFormat}
            left={scrub.left}
            top={scrub.top}
          />
        ) : null}
      </div>
    </div>
  );
}
