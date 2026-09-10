'use client';

import { Check, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import Marquee from 'react-fast-marquee';
import { useMemo, useState } from 'react';

import { TradeOrderbookStatusIndicator } from '@/components/trade/trade-orderbook-status-indicator';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useOrderbookMarketTicker } from '@/hooks/useOrderbookMarketTicker';
import { useSptDiscovery } from '@/hooks/useSptDiscovery';
import { useNetwork } from '@/lib/network-provider';
import {
  formatTickerPrice,
  marketDisplayPrice,
  type OrderbookMarketSummary,
} from '@/lib/orderbook-indexer/ticker';
import { trendingSptTickerItems, type SptTickerItem } from '@/lib/spt/ticker';
import { TRADE_POOL_QUERY_KEY } from '@/lib/trade-route-path';
import { cn } from '@/lib/utils';

export type TickerListMode = 'gainers' | 'losers' | '24h-change' | 'vol-pct' | 'new';

const TICKER_MODE_LABEL: Record<TickerListMode, string> = {
  gainers: 'Gainers',
  losers: 'Losers',
  '24h-change': 'Largest move',
  'vol-pct': 'Volume',
  new: 'Markets',
};

/** Reference-style palette (dark terminal ticker); deltas use theme primary / destructive for brand parity */
const bar = {
  bg: 'bg-[#0d0d0d]',
  border: 'border-trade-shell',
  triggerBg: 'bg-[#1a1a1a]',
  triggerHover: 'hover:bg-[#252525]',
  muted: 'text-[#a0a0a0]',
  mutedHover: 'hover:text-[#c8c8c8]',
  body: 'text-[#e0e0e0]',
  up: 'text-primary',
  down: 'text-destructive',
  menuBg: 'bg-[#1a1a1a]',
  menuBorder: 'border-trade-shell',
} as const;

type TickerRow = {
  id: string;
  href: string;
  symbol: string;
  avatarSrc: string | null;
  avatarShape: 'circle' | 'square';
  price: number | null;
  changePercent: number;
  quoteVolume: number;
  nativeRank: number;
};

function preferredMarketScore(pair: string): number {
  if (pair === 'MYSO_MYUSD') return 0;
  if (pair === 'BTC_MYUSD') return 1;
  if (pair === 'ETH_MYUSD') return 2;
  if (pair.startsWith('MYSO_')) return 10;
  if (pair.startsWith('BTC_')) return 11;
  if (pair.startsWith('ETH_')) return 12;
  return 50;
}

function nativeTickerRow(market: OrderbookMarketSummary): TickerRow {
  const symbol = tickerSymbolAbbr(market);
  return {
    id: `native:${market.trading_pairs}`,
    href: `/trade?${TRADE_POOL_QUERY_KEY}=${encodeURIComponent(market.trading_pairs)}`,
    symbol,
    avatarSrc: tickerAvatarSrc(symbol),
    avatarShape: 'circle',
    price: marketDisplayPrice(market),
    changePercent: market.price_change_percent_24h ?? 0,
    quoteVolume: market.quote_volume ?? 0,
    nativeRank: preferredMarketScore(market.trading_pairs),
  };
}

function sptTickerRow(item: SptTickerItem): TickerRow {
  return {
    ...item,
    nativeRank: 200,
  };
}

function sortTickerRows(rows: TickerRow[], mode: TickerListMode): TickerRow[] {
  const copy = [...rows];
  switch (mode) {
    case 'gainers':
      return copy.sort((a, b) => b.changePercent - a.changePercent);
    case 'losers':
      return copy.sort((a, b) => a.changePercent - b.changePercent);
    case '24h-change':
      return copy.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
    case 'vol-pct':
      return copy.sort((a, b) => b.quoteVolume - a.quoteVolume);
    case 'new':
    default:
      return copy.sort((a, b) => {
        const d = a.nativeRank - b.nativeRank;
        if (d !== 0) return d;
        return a.symbol.localeCompare(b.symbol);
      });
  }
}

function tickerSymbolAbbr(market: OrderbookMarketSummary): string {
  const raw = (market.base_currency || market.trading_pairs.split('_')[0] || market.trading_pairs).trim();
  return raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 5) || raw.slice(0, 4).toUpperCase();
}

function tickerAvatarSrc(symbol: string): string | null {
  return symbol === 'MYSO' ? '/MySo-icon-green.png' : null;
}

function tickerAvatarTone(symbol: string): string {
  if (symbol === 'BTC') return 'bg-[#F7931A] text-white';
  if (symbol === 'ETH') return 'bg-[#627EEA] text-white';
  if (symbol === 'MYSO') return 'bg-primary/20 text-primary';
  return 'bg-[#2a2a2a] text-[#e0e0e0]';
}

function VolumeTrendGlyph({ trend }: { trend: 'up' | 'down' }) {
  if (trend === 'up') {
    return (
      <span className="inline-block text-[0.65em] leading-none text-inherit" aria-hidden>
        ▲
      </span>
    );
  }
  return (
    <span className="inline-block text-[0.65em] leading-none text-inherit" aria-hidden>
      ▼
    </span>
  );
}

function TickerThumb({
  src,
  symbol,
  shape,
}: {
  src: string | null;
  symbol: string;
  shape: 'circle' | 'square';
}) {
  const containLogo = src === '/MySo-icon-green.png';
  return (
    <span
      className={cn(
        'trade-ticker-thumb',
        shape === 'circle' ? 'rounded-full' : 'rounded-[2px]',
        src ? 'bg-[#1a1a1a]' : cn('inline-flex items-center justify-center', tickerAvatarTone(symbol))
      )}
      data-fit={containLogo ? 'contain' : 'cover'}
      aria-hidden
    >
      {src ? (
        // Decorative marquee thumb; next/image is a poor fit for auto-filled copies.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" width={20} height={20} />
      ) : (
        <span className="text-[8px] font-semibold leading-none">{symbol.slice(0, 1)}</span>
      )}
    </span>
  );
}

function MarketMarqueeItem({ row }: { row: TickerRow }) {
  const change = row.changePercent;
  const trend = change > 0 ? 'up' : change < 0 ? 'down' : null;
  const volColorClass = trend === 'up' ? bar.up : trend === 'down' ? bar.down : bar.muted;
  const priceLabel = row.price == null ? '—' : `$${formatTickerPrice(row.price)}`;
  const changeLabel = `${change > 0 ? '+' : change < 0 ? '-' : ''}${Math.abs(change).toFixed(2)}%`;

  return (
    <Link
      href={row.href}
      className="inline-flex h-10 items-center gap-2 whitespace-nowrap px-5 text-[13px] leading-none tabular-nums hover:opacity-80 focus-visible:outline focus-visible:outline-primary"
    >
      <TickerThumb src={row.avatarSrc} symbol={row.symbol} shape={row.avatarShape} />
      <span className="font-semibold leading-none tracking-wide text-[#e0e0e0]">{row.symbol}</span>
      <span className="font-medium leading-none text-[#e0e0e0]">{priceLabel}</span>
      <span
        className={cn(
          'inline-flex shrink-0 items-center gap-0.5 text-[11px] font-normal leading-none tabular-nums',
          volColorClass
        )}
        title="24h price change"
      >
        {trend ? <VolumeTrendGlyph trend={trend} /> : null}
        {changeLabel}
      </span>
    </Link>
  );
}

const menuItemClass = cn(
  'relative cursor-pointer py-1.5 pl-7 pr-2 text-[13px] font-normal leading-tight outline-none',
  bar.body,
  'focus:bg-[#2a2a2a] focus:text-[#e0e0e0] data-[highlighted]:bg-[#2a2a2a] data-[highlighted]:text-[#e0e0e0]'
);

const TICKER_SORT_OPTIONS: { value: TickerListMode; label: string }[] = [
  { value: 'new', label: 'Markets' },
  { value: 'gainers', label: 'Gainers' },
  { value: 'losers', label: 'Losers' },
  { value: '24h-change', label: 'Largest move' },
  { value: 'vol-pct', label: 'Volume' },
];

export function TradeMarketTicker({ className }: { className?: string }) {
  const { currentNetwork } = useNetwork();
  const natives = useOrderbookMarketTicker(currentNetwork);
  const spt = useSptDiscovery(currentNetwork);
  const [listMode, setListMode] = useState<TickerListMode>('new');

  const marketItems = useMemo(() => {
    const nativeRows = natives.markets.map(nativeTickerRow);
    const sptRows = trendingSptTickerItems(spt.data).map(sptTickerRow);
    return sortTickerRows([...nativeRows, ...sptRows], listMode);
  }, [natives.markets, spt.data, listMode]);
  const hasLiveData = marketItems.length > 0;
  const isLoading = !hasLiveData && (natives.isLoading || spt.isLoading);
  const error = !hasLiveData ? natives.error || spt.error : null;

  return (
    <footer
      className={cn(
        'flex h-10 shrink-0 items-stretch border-t',
        bar.border,
        bar.bg,
        className
      )}
      aria-label="Markets ticker"
    >
      <div
        className={cn(
          'flex h-full min-w-0 shrink-0 items-stretch self-stretch border-r',
          bar.border
        )}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className={cn(
                'h-full min-h-10 gap-0.5 rounded-none px-6 text-[13px] font-normal shadow-none',
                bar.triggerBg,
                bar.muted,
                bar.triggerHover,
                bar.mutedHover,
                'border-0'
              )}
              aria-label={`Ticker list: ${TICKER_MODE_LABEL[listMode]}. Choose sort.`}
            >
              <span className="truncate">{TICKER_MODE_LABEL[listMode]}</span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            sideOffset={4}
            className={cn(
              'min-w-[11rem] rounded-sm border p-0.5 shadow-md',
              bar.menuBg,
              bar.menuBorder,
              bar.body
            )}
          >
            {TICKER_SORT_OPTIONS.map(({ value, label }) => (
              <DropdownMenuItem
                key={value}
                className={menuItemClass}
                onSelect={() => setListMode(value)}
              >
                <span className="pointer-events-none absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                  {listMode === value ? (
                    <Check className="h-3 w-3" strokeWidth={2.25} aria-hidden />
                  ) : null}
                </span>
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="trade-marquee-edge-mask flex min-h-0 min-w-0 flex-1 items-center justify-start overflow-hidden self-stretch">
        {hasLiveData ? (
          <Marquee
            speed={22}
            gradient={false}
            pauseOnHover
            autoFill
            className="flex min-h-0 w-full items-center"
          >
            {marketItems.map((row, i) => (
              <MarketMarqueeItem key={`${row.id}-${i}`} row={row} />
            ))}
          </Marquee>
        ) : (
          <span className="truncate px-5 text-xs text-muted-foreground" role="status">
            {isLoading
              ? 'Loading markets…'
              : error
                ? 'Market ticker unavailable'
                : 'No markets indexed yet'}
          </span>
        )}
      </div>

      <div
        className={cn(
          'hidden min-h-10 shrink-0 items-stretch self-stretch border-l sm:flex',
          bar.border
        )}
      >
        <Button
          variant="ghost"
          className={cn(
            'h-full min-h-10 gap-1 rounded-none border-y-0 border-l-0 border-r px-4 text-[13px] font-normal shadow-none md:px-6',
            bar.triggerBg,
            bar.border,
            bar.muted,
            bar.triggerHover,
            bar.mutedHover
          )}
          asChild
        >
          <Link
            href="https://t.me/sofiswap_chat"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5"
          >
            <svg
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              className="h-3 w-3 shrink-0 fill-current"
              aria-hidden
            >
              <path d="m20.665 3.717-17.73 6.837c-1.21.486-1.203 1.161-.222 1.462l4.552 1.42 10.532-6.645c.498-.303.953-.14.579.192l-8.533 7.701h-.002l.002.001-.314 4.692c.46 0 .663-.211.921-.46l2.211-2.15 4.599 3.397c.848.467 1.457.227 1.668-.785l3.019-14.228c.309-1.239-.473-1.8-1.282-1.434z" />
            </svg>
            <span className="sr-only md:not-sr-only md:inline">Join Telegram</span>
          </Link>
        </Button>
        <TradeOrderbookStatusIndicator />
      </div>
    </footer>
  );
}
