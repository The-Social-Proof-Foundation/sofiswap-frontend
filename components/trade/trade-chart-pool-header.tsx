'use client';

import { ChevronDown } from 'lucide-react';
import Image from 'next/image';
import { useMemo, type KeyboardEvent, type ReactNode } from 'react';

import { usePoolOnchainMeta } from '@/hooks/usePoolOnchainMeta';
import { orderbookRuntimeNetwork } from '@/lib/orderbook/config';
import { formatTickerPrice } from '@/lib/orderbook-indexer/ticker';
import { useNetwork } from '@/lib/network-provider';
import {
  pairLabelForPoolKey,
  poolTickerForKey,
  spotAssetSymbolDisplay,
} from '@/lib/trade/trade-pool-catalog';
import { tradeDownTextClass, tradeUpTextClass } from '@/lib/trade-shell-styles';
import { cn } from '@/lib/utils';

function OverlappingPairArt({
  quoteSymbol,
  className,
}: {
  quoteSymbol: string;
  className?: string;
}) {
  return (
    <div className={cn('flex shrink-0 items-center -space-x-1.5', className)} aria-hidden>
      <div className="relative z-[2] h-7 w-7 overflow-hidden rounded-full ring-2 ring-background">
        <Image
          src="/MySo-icon-green.png"
          alt=""
          width={28}
          height={28}
          className="h-full w-full rounded-full object-cover"
        />
      </div>
      <div
        className="relative z-[1] flex h-7 w-7 items-center justify-center rounded-full bg-[#3d6b48] text-[9px] font-bold uppercase tracking-tight text-white ring-2 ring-background dark:bg-[#2f4a38]"
        title={quoteSymbol}
      >
        {quoteSymbol.slice(0, 1)}
      </div>
    </div>
  );
}

function poolHeaderOpenSpotlightKeyDown(
  e: KeyboardEvent<HTMLDivElement>,
  onOpen: (() => void) | undefined
) {
  if (!onOpen) return;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    onOpen();
  }
}

function formatSignedPrice(n: number): string {
  const abs = formatTickerPrice(Math.abs(n));
  if (n > 0) return `+${abs}`;
  if (n < 0) return `-${abs}`;
  return abs;
}

function formatCompactQuote(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return formatTickerPrice(n);
}

function MarketStat({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-[13px] font-medium tabular-nums leading-none text-foreground">
        {children}
      </div>
    </div>
  );
}

export function TradeChartPoolHeader({
  poolName,
  className,
  onPoolPickerOpen,
  lastPrice,
  changePercent,
  quoteVolume,
  marketPrice,
  bestBid,
  bestAsk,
}: {
  poolName: string;
  className?: string;
  onPoolPickerOpen?: () => void;
  lastPrice?: number | null;
  /** 24h change already expressed in percent points (5.37 means +5.37%). */
  changePercent?: number | null;
  quoteVolume?: number | null;
  marketPrice?: number | null;
  bestBid?: number | null;
  bestAsk?: number | null;
}) {
  const { currentNetwork } = useNetwork();
  const obNet = orderbookRuntimeNetwork(currentNetwork);
  const poolOnchainMeta = usePoolOnchainMeta({
    poolName,
    obNet,
    enabled: Boolean(poolName.trim() && obNet),
  });

  const { base, quote, pairLabel } = useMemo(() => {
    const tick = poolTickerForKey(currentNetwork, poolName);
    return {
      base: spotAssetSymbolDisplay(tick.base),
      quote: spotAssetSymbolDisplay(tick.quote),
      pairLabel: pairLabelForPoolKey(currentNetwork, poolName),
    };
  }, [currentNetwork, poolName]);

  const priceLabel = lastPrice != null && lastPrice > 0 ? formatTickerPrice(lastPrice) : '—';
  const pct = changePercent != null && Number.isFinite(changePercent) ? changePercent : null;
  const dollarChange =
    pct != null && lastPrice != null && lastPrice > 0 && pct !== -100
      ? lastPrice - lastPrice / (1 + pct / 100)
      : null;
  const changeTone = pct == null || pct === 0 ? null : pct > 0 ? 'up' : 'down';

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-black/10 px-3 py-2 dark:border-white/5',
        className
      )}
    >
      <span className="sr-only">{`${base} and ${quote} pool`}</span>

      <div
        role={onPoolPickerOpen ? 'button' : undefined}
        tabIndex={onPoolPickerOpen ? 0 : undefined}
        onClick={onPoolPickerOpen ? () => onPoolPickerOpen() : undefined}
        onKeyDown={
          onPoolPickerOpen
            ? (e) => poolHeaderOpenSpotlightKeyDown(e, onPoolPickerOpen)
            : undefined
        }
        aria-label={
          onPoolPickerOpen ? `Open market search. Current market: ${pairLabel}.` : undefined
        }
        className={cn(
          'flex min-w-0 items-center gap-2.5 rounded-md py-0.5 pr-1 text-left',
          onPoolPickerOpen && [
            'cursor-pointer',
            'hover:bg-muted/40',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          ]
        )}
      >
        <OverlappingPairArt quoteSymbol={quote} className="pointer-events-none" />
        <span className="truncate text-sm font-semibold tracking-tight text-foreground">
          {pairLabel}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} aria-hidden />
      </div>

      <MarketStat label="Price">
        <span className={cn(changeTone === 'up' && tradeUpTextClass, changeTone === 'down' && tradeDownTextClass)}>
          {priceLabel}
        </span>
      </MarketStat>

      <MarketStat label="24H Change">
        {pct == null ? (
          '—'
        ) : (
          <span className={cn(changeTone === 'up' && tradeUpTextClass, changeTone === 'down' && tradeDownTextClass)}>
            {dollarChange == null
              ? '—'
              : dollarChange === 0
                ? '0.00'
                : formatSignedPrice(dollarChange)}
            <span className="ml-1.5">{`${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`}</span>
          </span>
        )}
      </MarketStat>

      <MarketStat label="24H Volume">
        {quoteVolume != null && Number.isFinite(quoteVolume) && quoteVolume > 0
          ? formatCompactQuote(quoteVolume)
          : '—'}
      </MarketStat>

      <MarketStat label="Market Price">
        {marketPrice != null && marketPrice > 0 ? formatTickerPrice(marketPrice) : priceLabel}
      </MarketStat>

      <MarketStat label="Bid / Ask">
        <span className={tradeUpTextClass}>
          {bestBid != null && bestBid > 0 ? formatTickerPrice(bestBid) : '—'}
        </span>
        <span className="mx-1 text-muted-foreground">/</span>
        <span className={tradeDownTextClass}>
          {bestAsk != null && bestAsk > 0 ? formatTickerPrice(bestAsk) : '—'}
        </span>
      </MarketStat>

      {poolOnchainMeta.data && !poolOnchainMeta.error ? (
        <p className="ml-auto hidden truncate text-[10px] tabular-nums text-muted-foreground xl:block">
          Tick {poolOnchainMeta.data.bookParams.tickSize.toPrecision(4)} Min{' '}
          {poolOnchainMeta.data.bookParams.minSize.toPrecision(4)} Taker{' '}
          {(poolOnchainMeta.data.tradeParams.takerFee * 100).toFixed(3)}%
        </p>
      ) : null}
    </div>
  );
}
