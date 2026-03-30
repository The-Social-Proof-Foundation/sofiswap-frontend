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
import { useReservationPoolsMarquee } from '@/hooks/useReservationPoolsMarquee';
import { useNetwork } from '@/lib/network-provider';
import {
  isProfileReservationPool,
  reservationPoolVolumeChangePercent24h,
  reservationPoolVolumeTrend,
  type ReservationPoolRow,
} from '@/lib/social-indexer/reservation-pools';
import { cn } from '@/lib/utils';

const THUMB_BOX_PX = 30;
/** Ring radius in viewBox units (stroke centered on circle). */
const THUMB_RING_R = 12;
const THUMB_STROKE_WIDTH = 1.32;
const THUMB_C = 2 * Math.PI * THUMB_RING_R;
const THUMB_INSET = THUMB_BOX_PX / 2 - THUMB_RING_R;
const THUMB_RECT_W = THUMB_RING_R * 2;
const THUMB_POST_RX = 3.75;
/** Inner avatar (larger photo, slightly thinner ring stroke). */
const THUMB_INNER_PX = 21;

type PlaceholderTick = { pair: string; price: string; pct: number };

export type TickerListMode = 'gainers' | 'losers' | '24h-change' | 'vol-pct' | 'new';

const TICKER_MODE_LABEL: Record<TickerListMode, string> = {
  gainers: 'Most filled',
  losers: 'Least filled',
  '24h-change': 'Largest reserve',
  'vol-pct': '24h volume %',
  new: 'Newest',
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

/** Fallback when reservation-pools fetch fails or returns empty */
const TICKER_PLACEHOLDER: PlaceholderTick[] = [
  { pair: 'MYSO-MyUSD', price: '$0.842', pct: 1.24 },
  { pair: 'MYSO-BTC', price: '$0.839', pct: -0.42 },
  { pair: 'MYSO-ETH', price: '$0.124', pct: 3.18 },
  { pair: 'MYSO-SOL', price: '$2.41', pct: -1.72 },
  { pair: 'MYSO-BNB', price: '$0.842', pct: 0.91 },
];

function sortPlaceholdersForMode(ticks: PlaceholderTick[], mode: TickerListMode): PlaceholderTick[] {
  const copy = [...ticks];
  switch (mode) {
    case 'gainers':
      return copy.sort((a, b) => b.pct - a.pct);
    case 'losers':
      return copy.sort((a, b) => a.pct - b.pct);
    case '24h-change':
      return copy.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
    case 'vol-pct':
      return copy.sort((a, b) => b.pct - a.pct);
    case 'new':
    default:
      return copy;
  }
}

function reservationProgressPct(p: ReservationPoolRow): number {
  const t = p.required_threshold;
  if (t <= 0) return 0;
  return (p.total_reserved / t) * 100;
}

function sortReservationPools(rows: ReservationPoolRow[], mode: TickerListMode): ReservationPoolRow[] {
  const copy = [...rows];
  const createdMs = (p: ReservationPoolRow) => {
    const raw = p.created_at?.trim();
    if (!raw) return 0;
    const ms = Date.parse(raw);
    return Number.isFinite(ms) ? ms : 0;
  };
  switch (mode) {
    case 'gainers':
      return copy.sort((a, b) => reservationProgressPct(b) - reservationProgressPct(a));
    case 'losers':
      return copy.sort((a, b) => reservationProgressPct(a) - reservationProgressPct(b));
    case '24h-change':
      return copy.sort((a, b) => b.total_reserved - a.total_reserved);
    case 'vol-pct': {
      return copy.sort((a, b) => {
        const ap = reservationPoolVolumeChangePercent24h(a);
        const bp = reservationPoolVolumeChangePercent24h(b);
        const an = ap ?? Number.NEGATIVE_INFINITY;
        const bn = bp ?? Number.NEGATIVE_INFINITY;
        return bn - an;
      });
    }
    case 'new':
    default:
      return copy.sort((a, b) => createdMs(b) - createdMs(a));
  }
}

function shortPoolId(id: string): string {
  const t = id.trim();
  if (t.length <= 14) return t;
  return `${t.slice(0, 6)}…${t.slice(-4)}`;
}

/** Marquee label: `@handle` from API (strip duplicate `@`); pool id fallback stays unprefixed. */
function formatMarqueeHandle(secondaryLabel: string | null | undefined, poolId: string): string {
  const raw = secondaryLabel?.trim();
  if (!raw) return shortPoolId(poolId);
  const handle = raw.replace(/^@+/, '').trim();
  if (!handle) return shortPoolId(poolId);
  return `@${handle}`;
}

/** Small cap-style ▲ / ▼ (volume direction). */
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

function ReservationPoolMarqueeThumb({
  iconUrl,
  progressPct,
  profile,
}: {
  iconUrl: string | null | undefined;
  progressPct: number;
  profile: boolean;
}) {
  const ringFillPct = Math.min(Math.max(progressPct, 0), 100);
  const arcLen = (ringFillPct / 100) * THUMB_C;
  const shape = profile ? 'rounded-full' : 'rounded-[3.75px]';

  return (
    <div
      className="relative shrink-0"
      style={{ width: THUMB_BOX_PX, height: THUMB_BOX_PX }}
      aria-hidden
    >
      <svg
        className="absolute left-0 top-0 -rotate-90"
        width={THUMB_BOX_PX}
        height={THUMB_BOX_PX}
        viewBox={`0 0 ${THUMB_BOX_PX} ${THUMB_BOX_PX}`}
      >
        {profile ? (
          <>
            <circle
              cx={THUMB_BOX_PX / 2}
              cy={THUMB_BOX_PX / 2}
              r={THUMB_RING_R}
              fill="none"
              stroke="#2a2a2a"
              strokeWidth={THUMB_STROKE_WIDTH}
            />
            <circle
              cx={THUMB_BOX_PX / 2}
              cy={THUMB_BOX_PX / 2}
              r={THUMB_RING_R}
              fill="none"
              stroke="var(--primary)"
              strokeWidth={THUMB_STROKE_WIDTH}
              strokeLinecap="round"
              strokeDasharray={`${arcLen} ${THUMB_C}`}
            />
          </>
        ) : (
          <>
            <rect
              x={THUMB_INSET}
              y={THUMB_INSET}
              width={THUMB_RECT_W}
              height={THUMB_RECT_W}
              rx={THUMB_POST_RX}
              ry={THUMB_POST_RX}
              fill="none"
              stroke="#2a2a2a"
              strokeWidth={THUMB_STROKE_WIDTH}
            />
            <rect
              x={THUMB_INSET}
              y={THUMB_INSET}
              width={THUMB_RECT_W}
              height={THUMB_RECT_W}
              rx={THUMB_POST_RX}
              ry={THUMB_POST_RX}
              fill="none"
              stroke="var(--primary)"
              strokeWidth={THUMB_STROKE_WIDTH}
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray={`${ringFillPct} ${100 - ringFillPct}`}
            />
          </>
        )}
      </svg>
      <div
        className={cn(
          'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 overflow-hidden bg-[#2a2a2a]',
          shape
        )}
        style={{ width: THUMB_INNER_PX, height: THUMB_INNER_PX }}
      >
        {iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- external token icons; arbitrary origins
          <img src={iconUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : null}
      </div>
    </div>
  );
}

function PlaceholderTickItem({ pair, price, pct }: PlaceholderTick) {
  const up = pct >= 0;
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap px-5 text-[13px] leading-none tabular-nums">
      <span className="font-normal leading-none text-[var(--muted-foreground)]">{pair}</span>
      <span className="font-medium text-primary text-[14px] leading-none">{price}</span>
      <span className={cn('font-normal leading-none', up ? bar.up : bar.down)}>
        {up ? '+' : ''}
        {pct.toFixed(2)}%
      </span>
    </span>
  );
}

function PoolMarqueeItem({
  pool,
  progressPct,
}: {
  pool: ReservationPoolRow;
  progressPct: number;
}) {
  const handleLabel = formatMarqueeHandle(pool.secondary_label, pool.pool_id);
  const reservePctLabel = `${progressPct.toFixed(1)}%`;
  const iconUrl = pool.icon?.trim();
  const profile = isProfileReservationPool(pool);
  const volPct = reservationPoolVolumeChangePercent24h(pool);
  const volTrend = reservationPoolVolumeTrend(pool);
  const volColorClass = volTrend === 'up' ? bar.up : volTrend === 'down' ? bar.down : bar.muted;
  const reserveLabelClass =
    'text-[11px] font-normal leading-none tabular-nums text-primary';

  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap px-5 text-[13px] leading-none tabular-nums pt-1">
      <ReservationPoolMarqueeThumb
        iconUrl={iconUrl}
        progressPct={progressPct}
        profile={profile}
      />
      <span className="inline-flex items-center gap-2">
        <span className="font-normal leading-none text-[var(--muted-foreground)]">{handleLabel}</span>
        <span className={reserveLabelClass}>{reservePctLabel}</span>
        {volPct !== null && volTrend ? (
          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-0.5 text-[11px] font-normal leading-none tabular-nums',
              volColorClass
            )}
            title="24h volume change"
          >
            <VolumeTrendGlyph trend={volTrend} />
            {`${Math.abs(volPct).toFixed(1)}%`}
          </span>
        ) : null}
      </span>
    </span>
  );
}

const menuItemClass = cn(
  'relative cursor-pointer py-1.5 pl-7 pr-2 text-[13px] font-normal leading-tight outline-none',
  bar.body,
  'focus:bg-[#2a2a2a] focus:text-[#e0e0e0] data-[highlighted]:bg-[#2a2a2a] data-[highlighted]:text-[#e0e0e0]'
);

const TICKER_SORT_OPTIONS: { value: TickerListMode; label: string }[] = [
  { value: 'gainers', label: 'Most filled' },
  { value: 'losers', label: 'Least filled' },
  { value: '24h-change', label: 'Largest reserve' },
  { value: 'vol-pct', label: '24h volume %' },
  { value: 'new', label: 'Newest' },
];

export function TradeMarketTicker({ className }: { className?: string }) {
  const { currentNetwork } = useNetwork();
  const { pools, hasLiveData } = useReservationPoolsMarquee(currentNetwork);
  const [listMode, setListMode] = useState<TickerListMode>('new');

  const { poolItems, placeholderItems } = useMemo(() => {
    const sortedPools = sortReservationPools(pools, listMode);
    const poolItemsDuped = [...sortedPools, ...sortedPools];
    const placeholderSorted = sortPlaceholdersForMode(TICKER_PLACEHOLDER, listMode);
    const placeholderItems = [...placeholderSorted, ...placeholderSorted];
    return { poolItems: poolItemsDuped, placeholderItems };
  }, [pools, listMode]);

  return (
    <footer
      className={cn(
        'flex h-10 shrink-0 items-stretch border-t',
        bar.border,
        bar.bg,
        className
      )}
      aria-label="Reservation pools ticker"
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
        <Marquee
          speed={22}
          gradient={false}
          pauseOnHover
          autoFill
          className="flex min-h-0 w-full items-center"
        >
          {hasLiveData
            ? poolItems.map((p, i) => (
                <PoolMarqueeItem
                  key={`${p.pool_id}-${i}`}
                  pool={p}
                  progressPct={reservationProgressPct(p)}
                />
              ))
            : placeholderItems.map((t, i) => (
                <PlaceholderTickItem key={`${t.pair}-${i}`} {...t} />
              ))}
        </Marquee>
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
