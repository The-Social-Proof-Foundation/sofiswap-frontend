'use client';

import { Check, ChevronDown, HelpCircle } from 'lucide-react';
import Link from 'next/link';
import Marquee from 'react-fast-marquee';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

type Tick = { pair: string; price: string; pct: number };

export type TickerListMode = 'gainers' | 'losers' | '24h-change' | 'new';

const TICKER_MODE_LABEL: Record<TickerListMode, string> = {
  gainers: 'Gainers',
  losers: 'Losers',
  '24h-change': '24-hour change',
  new: 'New',
};

/** Reference-style palette (dark terminal ticker) */
const bar = {
  bg: 'bg-[#0d0d0d]',
  border: 'border-trade-shell',
  triggerBg: 'bg-[#1a1a1a]',
  triggerHover: 'hover:bg-[#252525]',
  muted: 'text-[#a0a0a0]',
  mutedHover: 'hover:text-[#c8c8c8]',
  body: 'text-[#e0e0e0]',
  up: 'text-[#26a69a]',
  down: 'text-[#ef5350]',
  menuBg: 'bg-[#1a1a1a]',
  menuBorder: 'border-trade-shell',
} as const;

/** Placeholder stream until indexer / websocket wiring exists */
const TICKER_PLACEHOLDER: Tick[] = [
  { pair: 'MYSO-MyUSD', price: '$0.842', pct: 1.24 },
  { pair: 'MYSO-BTC', price: '$0.839', pct: -0.42 },
  { pair: 'MYSO-ETH', price: '$0.124', pct: 3.18 },
  { pair: 'MYSO-SOL', price: '$2.41', pct: -1.72 },
  { pair: 'MYSO-BNB', price: '$0.842', pct: 0.91 },
];

function sortTicksForMode(ticks: Tick[], mode: TickerListMode): Tick[] {
  const copy = [...ticks];
  switch (mode) {
    case 'gainers':
      return copy.sort((a, b) => b.pct - a.pct);
    case 'losers':
      return copy.sort((a, b) => a.pct - b.pct);
    case '24h-change':
      return copy.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
    case 'new':
    default:
      return copy;
  }
}

function TickItem({ pair, price, pct }: Tick) {
  const up = pct >= 0;
  return (
    <span className="inline-flex items-baseline gap-2 whitespace-nowrap px-5 text-[11px] leading-none tabular-nums">
      <span className="font-normal text-[var(--muted-foreground)]">{pair}</span>
      <span className="font-medium text-primary text-[12px]">{price}</span>
      <span className={cn('font-normal', up ? bar.up : bar.down)}>
        {up ? '+' : ''}
        {pct.toFixed(2)}%
      </span>
    </span>
  );
}

const menuItemClass = cn(
  'relative cursor-pointer py-1.5 pl-7 pr-2 text-[11px] font-normal leading-tight outline-none',
  bar.body,
  'focus:bg-[#2a2a2a] focus:text-[#e0e0e0] data-[highlighted]:bg-[#2a2a2a] data-[highlighted]:text-[#e0e0e0]'
);

const TICKER_SORT_OPTIONS: { value: TickerListMode; label: string }[] = [
  { value: 'gainers', label: 'Gainers' },
  { value: 'losers', label: 'Losers' },
  { value: '24h-change', label: '24-hour change' },
  { value: 'new', label: 'New' },
];

export function TradeMarketTicker({ className }: { className?: string }) {
  const [listMode, setListMode] = useState<TickerListMode>('new');

  const items = useMemo(() => {
    const sorted = sortTicksForMode(TICKER_PLACEHOLDER, listMode);
    return [...sorted, ...sorted];
  }, [listMode]);

  return (
    <footer
      className={cn(
        'flex h-9 shrink-0 items-stretch border-t',
        bar.border,
        bar.bg,
        className
      )}
      aria-label="Market ticker"
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
                'h-full min-h-9 gap-0.5 rounded-none px-6 text-[11px] font-normal shadow-none',
                bar.triggerBg,
                bar.muted,
                bar.triggerHover,
                bar.mutedHover,
                'border-0'
              )}
              aria-label={`Ticker list: ${TICKER_MODE_LABEL[listMode]}. Choose sort.`}
            >
              <span className="truncate">{TICKER_MODE_LABEL[listMode]}</span>
              <ChevronDown className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            sideOffset={4}
            className={cn(
              'w-44 rounded-sm border p-0.5 shadow-md',
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

      <div className="trade-marquee-edge-mask min-h-0 min-w-0 flex-1 self-center overflow-hidden">
        <Marquee speed={38} gradient={false} pauseOnHover autoFill className="flex items-center">
          {items.map((t, i) => (
            <TickItem key={`${t.pair}-${i}`} {...t} />
          ))}
        </Marquee>
      </div>

      <div
        className={cn(
          'hidden min-h-9 shrink-0 items-stretch self-stretch border-l sm:flex',
          bar.border
        )}
      >
        <Button
          variant="ghost"
          className={cn(
            'h-full min-h-9 gap-1 rounded-none border-y-0 border-l-0 border-r px-4 text-[11px] font-normal shadow-none md:px-6',
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
            className="inline-flex items-center justify-center"
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
        <Button
          variant="ghost"
          className={cn(
            'h-full min-h-9 gap-1 rounded-none px-4 text-[11px] font-normal shadow-none md:px-6',
            bar.triggerBg,
            bar.muted,
            bar.triggerHover,
            bar.mutedHover
          )}
          asChild
        >
          <Link href="/#" className="inline-flex items-center justify-center">
            <HelpCircle className="h-3 w-3 shrink-0" aria-hidden />
            Help
          </Link>
        </Button>
      </div>
    </footer>
  );
}
