'use client';

/**
 * Social proof token detail shell: pass token, stats, trades, reservations, and chart
 * points from your API; omitted props render empty placeholders (no fabricated market data).
 */

import Image from 'next/image';
import { Button } from '@/components/ui/button';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { ProfileMenuWalletCopyRow } from '@/components/trade/trade-nav-profile-menu';
import { SlidingSegmentTabs, type SlidingSegmentItem } from '@/components/ui/sliding-segment-tabs';
import { Tabs, type UnderlineTabItem } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  ArrowDown,
  ArrowDownUp,
  ChevronDown,
  Globe,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { buildMysocialWalletExplorerHref } from '@/lib/mysocial-wallet-explorer';
import { resolveSptSidePanelMode } from '@/lib/spt-reservation-ui-policy';
import {
  tradeSptEmptyAsideClass,
  tradeSptRoundedPanelClass,
  tradeSptSwapSegmentShellClass,
  tradeSptTableWellClass,
  tradeSptTallCardReserveClass,
  tradeSptTallCardSwapClass,
} from '@/lib/trade-shell-styles';
import { formatCompactDecimal } from '@/lib/trade/orderbook-format';
import type { SocialProofHolderRow } from '@/lib/social-proof-token-map-workspace';

type Timeframe = '1H' | '1D' | '1W' | '1M' | '1Y' | 'ALL';

export type SocialProofTokenMeta = {
  name: string;
  symbol: string;
  /** Contract or asset address when applicable */
  address?: string | null;
  about?: string | null;
};

export type SocialProofStat = { label: string; value: string };

/** Header strip derived from `SocialProofTokenPage.profile` + pool owner fields. */
export type SocialProofProfileRibbon = {
  username: string | null;
  followersCount: number | null;
  followingCount: number | null;
  postCount: number | null;
  badge: { name: string; iconUrl: string | null } | null;
  reservationPoolAddress: string | null;
  poolOwnerLine: string | null;
  tokenType: string | null;
  isActive: boolean | null;
  profileAddress: string | null;
};

export type SocialProofChartPoint = {
  /** Unix ms */
  t: number;
  price: number;
  volume?: number;
};

const UTC_MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

function formatUtcTimeShortFromIso(iso: string): string {
  if (iso === 'invalid') return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const minStr = String(m).padStart(2, '0');
  return `${UTC_MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}, ${hour12}:${minStr} ${h >= 12 ? 'PM' : 'AM'}`;
}

function formatUtcMonthDayMs(ms: number): string {
  const d = new Date(ms);
  return `${UTC_MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export type TradeHistoryRow = {
  id: string;
  /** ISO 8601 from API (stable across SSR and client) */
  time: string;
  side: 'buy' | 'sell';
  price: string;
  amount: string;
  total: string;
};

export type ReservationHistoryRow = {
  id: string;
  time: string;
  holder: string;
  reservationId: string;
  allocated: string;
  received: string;
  status: 'filled' | 'partial' | 'pending';
};

const chartConfig = {
  price: {
    label: 'Price',
    color: 'var(--chart-1)',
  },
} satisfies ChartConfig;

function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 10)}...${addr.slice(-10)}`;
}

/** Pulls a signed % from strings like `24h 1.5%` for the chip; leaves the remainder for the caption. */
function parsePercentFromChangeLabel(raw: string | null | undefined): {
  percent: number | null;
  rest: string | null;
} {
  if (!raw?.trim()) return { percent: null, rest: null };
  const t = raw.trim();
  const m = t.match(/([+-]?[\d.]+)\s*%/);
  if (!m) return { percent: null, rest: t };
  const n = Number.parseFloat(m[1]);
  const percent = Number.isFinite(n) ? n : null;
  let rest: string | null = t.replace(m[0], '').replace(/\s+/g, ' ').trim();
  if (!rest) rest = null;
  return { percent, rest };
}

function SptQuoteChangePctChip({ value }: { value: number }) {
  const label = `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
  const up = value > 0;
  const down = value < 0;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-1.5 py-0.5 font-semibold tabular-nums tracking-tight',
        'text-[10px] leading-none sm:text-[11px]',
        up && 'bg-emerald-500/14 text-emerald-600 dark:bg-emerald-400/12 dark:text-emerald-400',
        down && 'bg-red-500/14 text-red-600 dark:bg-red-400/12 dark:text-red-400',
        !up &&
          !down &&
          'bg-muted/70 text-muted-foreground dark:bg-muted/50'
      )}
    >
      {label}
    </span>
  );
}

type ChartRow = SocialProofChartPoint & { label: string };

function chartRowsWithLabels(points: readonly SocialProofChartPoint[]): ChartRow[] {
  return points.map((p) => ({
    ...p,
    label: formatUtcTimeShortFromIso(new Date(p.t).toISOString()),
  }));
}

function TokenAvatar({
  symbol,
  className,
}: {
  symbol: string;
  className?: string;
}) {
  const initials = symbol.slice(0, 2).toUpperCase();
  return (
    <div
      className={cn(
        'flex size-11 shrink-0 items-center justify-center rounded-2xl',
        'bg-gradient-to-br from-zinc-700/90 to-zinc-900 text-sm font-semibold tracking-tight text-white',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]',
        className
      )}
      aria-hidden
    >
      {initials}
    </div>
  );
}

function SptHeaderAvatarFace({
  photoUrl,
  symbol,
}: {
  photoUrl: string | null;
  symbol: string;
}) {
  const src = photoUrl?.trim();
  if (src) {
    return (
      <Image
        src={src}
        alt=""
        width={96}
        height={96}
        className="size-full object-cover"
        unoptimized
      />
    );
  }
  return (
    <TokenAvatar
      symbol={symbol}
      className="size-full min-h-0 min-w-0 rounded-full border-0 bg-gradient-to-br from-zinc-700/90 to-zinc-900 text-base shadow-none ring-0 sm:text-lg"
    />
  );
}

function WorkspaceHeaderAvatar({
  symbol,
  photoUrl,
  className,
  reservationFillPercent,
}: {
  symbol: string;
  photoUrl?: string | null;
  className?: string;
  /** When set (0–100), draws neon reservation progress ring; omit for plain avatar. */
  reservationFillPercent?: number | null;
}) {
  const showRing = reservationFillPercent != null;
  const pct = showRing ? Math.min(100, Math.max(0, reservationFillPercent)) : 0;

  if (!showRing) {
    return (
      <div
        className={cn(
          'relative flex size-16 shrink-0 overflow-hidden rounded-full ring-1 ring-border/55 sm:size-[4.25rem]',
          'shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]',
          className
        )}
      >
        <SptHeaderAvatarFace photoUrl={photoUrl ?? null} symbol={symbol} />
      </div>
    );
  }

  const vb = 100;
  const c = 50;
  /** Radius inset from viewBox so stroke sits inside the drawable area with margin. */
  const r = 40.75;
  const cLen = 2 * Math.PI * r;
  const dash = (pct / 100) * cLen;
  /** Match `ProfileAvatarWithReservationRing`: 1.65 / 2 @ 52px viewBox — scaled to this SVG size. */
  const ringStroke = pct >= 100 ? (2 * vb) / 52 : (1.65 * vb) / 52;

  return (
    <div
      className={cn(
        'shrink-0 rounded-full p-1.5',
        'bg-muted/50 ring-1 ring-border/50 dark:bg-muted/30 dark:ring-border/40',
        className
      )}
    >
      <div className="relative h-[5.5rem] w-[5.5rem] sm:h-[5.75rem] sm:w-[5.75rem]">
        <svg
          className="absolute inset-0 h-full w-full rotate-90"
          viewBox={`0 0 ${vb} ${vb}`}
          aria-hidden
        >
          <circle
            cx={c}
            cy={c}
            r={r}
            fill="none"
            className="stroke-muted-foreground/35"
            strokeWidth={ringStroke}
          />
          <circle
            cx={c}
            cy={c}
            r={r}
            fill="none"
            className="transition-[stroke-dasharray,stroke-width] duration-300 ease-out [stroke:var(--ring)]"
            strokeWidth={ringStroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${cLen}`}
          />
        </svg>
        {/* Padding between ring and photo: clear gutter inside the progress ring */}
        <div className="absolute inset-[13px] flex overflow-hidden rounded-full bg-muted sm:inset-[14px]">
          <SptHeaderAvatarFace photoUrl={photoUrl ?? null} symbol={symbol} />
        </div>
      </div>
    </div>
  );
}

function SptProfileHeaderBlock({
  displayName,
  displaySymbol,
  profilePhotoUrl,
  profileRibbon,
  reservationFillPercent,
  showTradingQuote,
  quoteDisplayPrice,
  quoteSubline,
  quotePctChipValue,
}: {
  displayName: string;
  displaySymbol: string;
  profilePhotoUrl: string | null;
  profileRibbon: SocialProofProfileRibbon | null;
  reservationFillPercent?: number | null;
  /** When false (reservation / inactive SPT), hide price, % change, and subline. */
  showTradingQuote: boolean;
  quoteDisplayPrice: string;
  quoteSubline: string;
  quotePctChipValue: number | null;
}) {
  const username = profileRibbon?.username?.trim();
  const profileAddress = profileRibbon?.profileAddress?.trim() ?? null;

  const sym = displaySymbol !== '—' ? displaySymbol : null;
  const showFollowStats =
    profileRibbon?.followersCount != null || profileRibbon?.followingCount != null;

  return (
    <header className="w-full pb-5 md:pb-6">
      <div className="flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <WorkspaceHeaderAvatar
            photoUrl={profilePhotoUrl}
            symbol={
              sym || (displayName.slice(0, 2).toUpperCase() || 'SP')
            }
            reservationFillPercent={reservationFillPercent}
            className="shrink-0"
          />
          <div className="min-w-0 flex-1 text-left">
            <div className="flex min-w-0 flex-wrap items-end gap-x-1.5 gap-y-0.5">
              <h1 className="min-w-0 text-lg font-semibold leading-tight tracking-tight text-foreground sm:text-xl">
                {displayName}
              </h1>
              {sym ? (
                <span className="shrink-0 text-sm font-medium leading-tight text-[var(--muted-foreground)]">
                  {sym}
                </span>
              ) : null}
              {username ? (
                <span className="shrink-0 text-sm leading-tight text-[var(--muted-foreground)]">
                  <span className="text-[var(--muted-foreground)]">@</span>
                  {username}
                </span>
              ) : null}
            </div>

            {profileAddress ? (
              <div className="mt-1 max-w-md min-w-0">
                <ProfileMenuWalletCopyRow address={profileAddress} addressHead={10} addressTail={10} />
              </div>
            ) : null}

            {showFollowStats && profileRibbon ? (
              <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm text-[var(--muted-foreground)]">
                {profileRibbon.followersCount != null ? (
                  <p className="inline-flex items-baseline gap-1 leading-snug">
                    <span className="font-semibold tabular-nums text-foreground">
                      {profileRibbon.followersCount.toLocaleString()}
                    </span>
                    <span className="text-[var(--muted-foreground)]">followers</span>
                  </p>
                ) : null}
                {profileRibbon.followingCount != null ? (
                  <p className="inline-flex items-baseline gap-1 leading-snug">
                    <span className="font-semibold tabular-nums text-foreground">
                      {profileRibbon.followingCount.toLocaleString()}
                    </span>
                    <span className="text-[var(--muted-foreground)]">following</span>
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {showTradingQuote ? (
          <div className="flex w-full min-w-0 flex-col gap-0.5 text-left sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-x-3">
            <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
              <p className="font-mono text-3xl font-semibold tabular-nums tracking-tight md:text-4xl">
                {quoteDisplayPrice}
              </p>
              {quotePctChipValue != null ? (
                <SptQuoteChangePctChip value={quotePctChipValue} />
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground sm:text-right">{quoteSubline}</p>
          </div>
        ) : null}
      </div>
    </header>
  );
}

function StatGrid({ stats }: { stats: readonly SocialProofStat[] }) {
  return (
    <section className="space-y-3" aria-labelledby="spt-stats-heading">
      <h2 id="spt-stats-heading" className="text-sm font-semibold text-foreground">
        Stats
      </h2>
      {stats.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">No stats yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
          {stats.map((s) => (
            <div key={s.label} className="space-y-1">
              <div className="text-[11px] font-medium text-[var(--muted-foreground)]">{s.label}</div>
              <div className="font-mono text-sm font-semibold tabular-nums text-foreground">
                {s.value}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function AboutBlock({
  token,
  websiteUrl,
  profileRibbon,
}: {
  token: SocialProofTokenMeta | undefined;
  websiteUrl?: string | null;
  profileRibbon?: SocialProofProfileRibbon | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showToggle, setShowToggle] = useState(false);
  const aboutRef = useRef<HTMLParagraphElement>(null);
  const about = token?.about?.trim();
  const site = websiteUrl?.trim();
  const profileAddress = profileRibbon?.profileAddress?.trim();
  const blockExplorerHref = profileAddress
    ? buildMysocialWalletExplorerHref(profileAddress)
    : null;

  useEffect(() => {
    setExpanded(false);
  }, [about]);

  useLayoutEffect(() => {
    const el = aboutRef.current;
    if (!el || !about) {
      setShowToggle(false);
      return;
    }
    const measure = () => {
      if (expanded) {
        setShowToggle(true);
        return;
      }
      setShowToggle(el.scrollHeight > el.clientHeight + 1);
    };
    measure();
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(measure);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [about, expanded]);

  return (
    <section className="space-y-3" aria-labelledby="spt-about-heading">
      <h2 id="spt-about-heading" className="text-sm font-semibold text-foreground">
        About
      </h2>
      {about ? (
        <div className="min-w-0 space-y-1">
          <p
            ref={aboutRef}
            className={cn(
              'text-sm leading-relaxed text-[var(--muted-foreground)]',
              !expanded && 'line-clamp-3 overflow-hidden'
            )}
          >
            {about}
          </p>
          {showToggle ? (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="inline-flex rounded-md p-0 text-[11px] font-medium text-foreground/90 underline decoration-foreground/30 underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground/55"
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-[var(--muted-foreground)]">No description.</p>
      )}
      <div className="flex flex-wrap gap-2 pt-0.5">
        {blockExplorerHref ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-9 rounded-full border-0 bg-muted/50 px-4 font-normal shadow-none hover:bg-muted/70"
            asChild
          >
            <a href={blockExplorerHref} target="_blank" rel="noopener noreferrer">
              Block explorer
            </a>
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-9 rounded-full border-0 bg-muted/50 px-4 font-normal opacity-60 shadow-none"
            disabled
          >
            Block explorer
          </Button>
        )}
        {site ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-9 gap-2 rounded-full border-0 bg-muted/50 px-4 font-normal shadow-none hover:bg-muted/70"
            asChild
          >
            <a href={site} target="_blank" rel="noopener noreferrer">
              <Globe className="size-3.5 opacity-70" strokeWidth={1.75} />
              Website
            </a>
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-9 gap-2 rounded-full border-0 bg-muted/50 px-4 font-normal opacity-60 shadow-none"
            disabled
          >
            <Globe className="size-3.5 opacity-70" strokeWidth={1.75} />
            Website
          </Button>
        )}
      </div>
    </section>
  );
}

function TradeHistoryTable({ rows }: { rows: TradeHistoryRow[] }) {
  return (
    <div className={tradeSptTableWellClass} role="region" aria-label="Token transaction history">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-border/50 text-[var(--muted-foreground)]">
            <th className="px-3 py-2.5 font-medium">Time</th>
            <th className="px-3 py-2.5 font-medium">Side</th>
            <th className="px-3 py-2.5 text-right font-medium">Price</th>
            <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">Amount</th>
            <th className="px-3 py-2.5 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody className="font-mono tabular-nums">
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={5}
                className="px-3 py-6 text-center text-sm text-[var(--muted-foreground)]"
              >
                No transactions yet.
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr
                key={r.id}
                className="border-b border-border/35 last:border-b-0 hover:bg-muted/25"
              >
                <td className="max-w-[8rem] truncate px-3 py-2 text-[var(--muted-foreground)]">
                  {formatUtcTimeShortFromIso(r.time)}
                </td>
              <td className="px-3 py-2">
                <span
                  className={cn(
                    'font-sans font-semibold uppercase',
                    r.side === 'buy'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-500 dark:text-rose-400'
                  )}
                >
                  {r.side}
                </span>
              </td>
              <td className="px-3 py-2 text-right">{r.price}</td>
              <td className="hidden px-3 py-2 text-right sm:table-cell">{r.amount}</td>
              <td className="px-3 py-2 text-right text-foreground/90">${r.total}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function HoldersTable({ rows }: { rows: readonly SocialProofHolderRow[] }) {
  return (
    <div className={tradeSptTableWellClass} role="region" aria-label="Token holders">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-border/50 text-[var(--muted-foreground)]">
            <th className="px-3 py-2.5 font-medium">Holder</th>
            <th className="px-3 py-2.5 font-medium">Address</th>
            <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">Amount</th>
          </tr>
        </thead>
        <tbody className="font-mono tabular-nums">
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={3}
                className="px-3 py-6 text-center text-sm text-[var(--muted-foreground)]"
              >
                No holders yet.
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr
                key={r.id}
                className="border-b border-border/35 last:border-b-0 hover:bg-muted/25"
              >
                <td className="max-w-[10rem] truncate px-3 py-2 text-foreground/90">{r.label}</td>
                <td
                  className="max-w-[9rem] truncate px-3 py-2 text-[var(--muted-foreground)]"
                  title={r.address}
                >
                  {truncateAddress(r.address)}
                </td>
                <td className="hidden px-3 py-2 text-right sm:table-cell">{r.amount}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function reservationStatusLabel(status: ReservationHistoryRow['status']) {
  switch (status) {
    case 'filled':
      return 'Filled';
    case 'partial':
      return 'Partial';
    case 'pending':
      return 'Pending';
    default:
      return status;
  }
}

function ReservationsHistoryTable({ rows }: { rows: ReservationHistoryRow[] }) {
  return (
    <div className={tradeSptTableWellClass} role="region" aria-label="Reservation holder history">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-border text-[var(--muted-foreground)]">
            <th className="px-3 py-2.5 font-medium">Time</th>
            <th className="px-3 py-2.5 font-medium">Holder</th>
            <th className="hidden px-3 py-2.5 font-medium md:table-cell">Reservation</th>
            <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">Allocated</th>
            <th className="px-3 py-2.5 text-right font-medium">Received</th>
            <th className="px-3 py-2.5 text-right font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="font-mono tabular-nums">
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={6}
                className="px-3 py-6 text-center text-sm text-[var(--muted-foreground)]"
              >
                No reservations yet.
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr
                key={r.id}
                className="border-b border-border last:border-b-0 hover:bg-muted/30"
              >
                <td className="max-w-[8rem] truncate px-3 py-2 text-[var(--muted-foreground)]">
                  {formatUtcTimeShortFromIso(r.time)}
                </td>
              <td className="max-w-[7rem] truncate px-3 py-2 text-foreground/90" title={r.holder}>
                {truncateAddress(r.holder)}
              </td>
              <td className="hidden px-3 py-2 md:table-cell">{r.reservationId}</td>
              <td className="hidden px-3 py-2 text-right sm:table-cell">{r.allocated}</td>
              <td className="px-3 py-2 text-right">{r.received}</td>
              <td className="px-3 py-2 text-right">
                <span
                  className={cn(
                    'font-sans text-[11px] font-medium',
                    r.status === 'filled' && 'text-emerald-600 dark:text-emerald-400',
                    r.status === 'partial' && 'text-amber-600 dark:text-amber-400',
                    r.status === 'pending' && 'text-[var(--muted-foreground)]'
                  )}
                >
                  {reservationStatusLabel(r.status)}
                </span>
              </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

const sptBuySellModeItems: SlidingSegmentItem[] = [
  { value: 'buy', label: 'Buy', triggerClassName: 'px-2 py-0 text-[12px] leading-tight' },
  { value: 'sell', label: 'Sell', triggerClassName: 'px-2 py-0 text-[12px] leading-tight' },
];

const sptSwapPctPresets = ['25%', '50%', '75%', 'Max'] as const;

const simpleReservationPctPresets = [25, 50, 75] as const;

function formatDraftNumber(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  const s = n.toFixed(8).replace(/\.?0+$/, '');
  return s === '' ? '' : s;
}

function sanitizeDecimalInput(raw: string, isUsdMode: boolean): string {
  let t = raw.replace(/[$,\s]/g, '');
  if (isUsdMode && t.startsWith('$')) t = t.slice(1);
  t = t.replace(/[^\d.]/g, '');
  const firstDot = t.indexOf('.');
  if (firstDot !== -1) {
    t =
      t.slice(0, firstDot + 1) +
      t
        .slice(firstDot + 1)
        .replace(/\./g, '');
  }
  return t;
}

function parsePositiveDecimal(s: string): number | null {
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

const sptSwapBucketClass = cn(
  'rounded-[22px] border border-border/55 p-4',
  'bg-gradient-to-br from-secondary-foreground/[0.08] via-muted/40 to-muted/22',
  'dark:border-trade-shell dark:from-secondary-foreground/[0.10] dark:via-muted/16 dark:to-muted/10'
);

const sptSwapTokenSelectClass = cn(
  'inline-flex max-w-[55%] shrink-0 items-center gap-2 rounded-full border border-border/60',
  'bg-background/70 py-1 pl-1 pr-2.5 text-sm font-semibold tracking-tight text-foreground',
  'shadow-sm transition-colors hover:bg-background/85 active:scale-[0.98]',
  'dark:border-trade-shell dark:bg-background/40 dark:hover:bg-background/55'
);

function SimpleReservationAmountCard({
  walletMysoAvailable,
  maxReservationMyso,
  usdPerMyso,
}: {
  walletMysoAvailable: number | null;
  maxReservationMyso: number | null;
  usdPerMyso: number | null;
}) {
  const [inputMode, setInputMode] = useState<'myso' | 'usd'>('myso');
  const [draft, setDraft] = useState('');

  const effectiveMax = useMemo(() => {
    const w = walletMysoAvailable != null && Number.isFinite(walletMysoAvailable) ? walletMysoAvailable : null;
    const c = maxReservationMyso != null && Number.isFinite(maxReservationMyso) ? maxReservationMyso : null;
    if (w == null && c == null) return null;
    if (w == null) return c as number;
    if (c == null) return w;
    return Math.min(w, c);
  }, [walletMysoAvailable, maxReservationMyso]);

  const primaryAmount = parsePositiveDecimal(draft) ?? 0;
  const canConvert = usdPerMyso != null && usdPerMyso > 0;

  const secondaryLine = useMemo(() => {
    if (!canConvert || primaryAmount <= 0) {
      return '—';
    }
    if (inputMode === 'myso') {
      const usd = primaryAmount * usdPerMyso!;
      const abs = Math.abs(usd);
      if (abs >= 1000) {
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          notation: 'compact',
          compactDisplay: 'short',
          maximumFractionDigits: 2,
        }).format(usd);
      }
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(usd);
    }
    const myso = primaryAmount / usdPerMyso!;
    return `${formatCompactDecimal(myso, { maxFractionDigits: 2 })} MYSO`;
  }, [canConvert, inputMode, primaryAmount, usdPerMyso]);

  const primarySuffix = inputMode === 'myso' ? 'MYSO' : 'USD';

  const applyFraction = (pct: number) => {
    if (effectiveMax == null || effectiveMax <= 0) return;
    const v = effectiveMax * pct;
    setDraft(formatDraftNumber(v));
  };

  const flipInputMode = () => {
    if (!canConvert) return;
    const n = primaryAmount;
    if (n <= 0) {
      setInputMode((m) => (m === 'myso' ? 'usd' : 'myso'));
      setDraft('');
      return;
    }
    if (inputMode === 'myso') {
      setDraft(formatDraftNumber(n * usdPerMyso!));
      setInputMode('usd');
    } else {
      setDraft(formatDraftNumber(n / usdPerMyso!));
      setInputMode('myso');
    }
  };

  const reserveDisabled = primaryAmount <= 0 || !Number.isFinite(primaryAmount);

  return (
    <div className={tradeSptTallCardReserveClass}>
      <div>
        <p className="text-md font-medium text-[var(--muted-foreground)]">Reserve</p>
      </div>

      <div className="space-y-3">
        <div className="flex min-h-[3rem] items-end gap-2">
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            aria-label={inputMode === 'myso' ? 'Amount in MYSO' : 'Amount in USD'}
            placeholder="0"
            value={draft}
            onChange={(e) => setDraft(sanitizeDecimalInput(e.target.value, inputMode === 'usd'))}
            className={cn(
              'min-w-0 flex-1 bg-transparent text-3xl font-semibold tabular-nums leading-none tracking-tight',
              'text-foreground placeholder:text-muted-foreground/35 outline-none ring-0 text-left'
            )}
          />
          <span className="shrink-0 pb-1 text-xs font-semibold tabular-nums text-[var(--muted-foreground)]">
            {primarySuffix}
          </span>
        </div>

        <div className="flex min-h-9 min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <button
            type="button"
            onClick={flipInputMode}
            disabled={!canConvert}
            className={cn(
              'flex min-w-0 max-w-[min(100%,14rem)] items-center justify-start gap-2 rounded-lg py-1 text-left',
              'transition-colors hover:opacity-90 disabled:pointer-events-none disabled:opacity-45',
              'sm:max-w-[min(100%,18rem)]'
            )}
            aria-label={
              canConvert
                ? inputMode === 'myso'
                  ? 'Switch to typing USD; shows MYSO equivalent'
                  : 'Switch to typing MYSO; shows USD equivalent'
                : 'USD conversion unavailable'
            }
          >
            <span className="min-w-0 truncate text-sm font-medium tabular-nums text-[var(--muted-foreground)]">
              {secondaryLine}
            </span>
            <ArrowDownUp
              className="size-3.5 shrink-0 text-primary opacity-90"
              strokeWidth={1.75}
              aria-hidden
            />
          </button>

          <div
            className="flex shrink-0 flex-wrap justify-end gap-1.5 sm:ml-2"
            role="group"
            aria-label="Fill amount from available MYSO"
          >
            {simpleReservationPctPresets.map((pct) => (
              <button
                key={pct}
                type="button"
                disabled={effectiveMax == null || effectiveMax <= 0}
                onClick={() => applyFraction(pct / 100)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-[11px] font-semibold tabular-nums transition-colors',
                  'disabled:pointer-events-none disabled:opacity-35',
                  'bg-background/50 text-foreground hover:bg-background/70',
                  'dark:bg-background/30 dark:hover:bg-background/45'
                )}
              >
                {pct}
              </button>
            ))}
            <button
              type="button"
              disabled={effectiveMax == null || effectiveMax <= 0}
              onClick={() => {
                if (effectiveMax == null || effectiveMax <= 0) return;
                setDraft(formatDraftNumber(effectiveMax));
              }}
              className={cn(
                'rounded-full px-3 py-1.5 text-[11px] font-semibold tabular-nums transition-colors',
                'disabled:pointer-events-none disabled:opacity-35',
                'bg-background/50 text-foreground hover:bg-background/70',
                'dark:bg-background/30 dark:hover:bg-background/45'
              )}
            >
              MAX
            </button>
          </div>
        </div>
        {!canConvert ? (
          <p className="text-[10px] leading-snug text-[var(--muted-foreground)]">
            Set <span className="font-mono">NEXT_PUBLIC_RESERVATION_USD_PER_MYSO</span> for an accurate USD
            toggle, or rely on a small spot label when shown.
          </p>
        ) : null}
      </div>

      <Button
        type="button"
        disabled={reserveDisabled}
        className="h-12 w-full rounded-2xl font-semibold opacity-80"
      >
        {reserveDisabled ? 'Enter an amount' : 'Reserve'}
      </Button>
    </div>
  );
}

function SocialProofSwapCard({
  sellSymbol,
  tradingEnabled,
}: {
  sellSymbol: string;
  tradingEnabled?: boolean | null;
}) {
  const [tradeMode, setTradeMode] = useState<'buy' | 'sell'>('buy');
  const [sellPct, setSellPct] = useState<string | null>(null);
  const swapDisabled = tradingEnabled === false;
  const sellSym =
    sellSymbol === '—' || !sellSymbol?.trim() ? 'Token' : sellSymbol.trim();

  const sellBucket = (
    <div className={sptSwapBucketClass}>
          <div className="mb-3 flex items-start justify-between gap-2">
            <span className="pt-0.5 text-[12px] font-medium text-[var(--muted-foreground)]">
              Sell
            </span>
            <div
              className="flex flex-wrap justify-end gap-1"
              role="group"
              aria-label="Sell amount presets"
            >
              {sptSwapPctPresets.map((p) => {
                const active = sellPct === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setSellPct((cur) => (cur === p ? null : p))}
                    className={cn(
                      'rounded-full px-2.5 py-1 text-[10px] font-semibold tabular-nums transition-colors',
                      active
                        ? 'bg-foreground text-background'
                        : 'bg-background/50 text-foreground hover:bg-background/70 dark:bg-background/30 dark:hover:bg-background/45'
                    )}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex min-h-[2.75rem] items-end justify-between gap-3">
            <span className="min-w-0 text-3xl font-semibold tabular-nums leading-none tracking-tight text-foreground">
              0
            </span>
            <button type="button" className={sptSwapTokenSelectClass} aria-label={`Select sell token (${sellSym})`}>
              <TokenAvatar symbol={sellSym} className="size-8 shrink-0 rounded-full text-[11px]" />
              <span className="max-w-[5rem] truncate">{sellSym}</span>
              <ChevronDown className="size-4 shrink-0 opacity-55" strokeWidth={2} />
            </button>
          </div>
          <div className="mt-3 flex items-baseline justify-between gap-2 text-[11px] text-[var(--muted-foreground)]">
            <span className="tabular-nums">$0</span>
            <span className="tabular-nums">
              0 {sellSym}
            </span>
          </div>
    </div>
  );

  const flipTokensRow = (
    <div className="relative z-[1] -my-3 flex justify-center">
      <button
        type="button"
        className={cn(
          'inline-flex size-10 items-center justify-center rounded-xl border-2 border-background',
          'bg-muted text-foreground shadow-md',
          'transition-transform active:scale-[0.96]',
          'dark:border-background'
        )}
        aria-label="Swap sell and buy tokens"
      >
        <ArrowDown className="size-4" strokeWidth={1.75} />
      </button>
    </div>
  );

  const buyBucket = (
    <div className={sptSwapBucketClass}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-[var(--muted-foreground)]">Buy</span>
      </div>
      <div className="flex min-h-[2.75rem] items-end justify-between gap-3">
        <span className="min-w-0 text-3xl font-semibold tabular-nums leading-none tracking-tight text-foreground">
          0
        </span>
        <button type="button" className={sptSwapTokenSelectClass} aria-label="Select buy token (ETH)">
          <div
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-full',
              'bg-muted/90 text-[11px] font-bold text-foreground dark:bg-muted/65'
            )}
            aria-hidden
          >
            ETH
          </div>
          <span className="max-w-[5rem] truncate">ETH</span>
          <ChevronDown className="size-4 shrink-0 opacity-55" strokeWidth={2} />
        </button>
      </div>
      <div className="mt-3 text-[11px] tabular-nums text-[var(--muted-foreground)]">$0</div>
    </div>
  );

  return (
    <div data-trade-mode={tradeMode} className={tradeSptTallCardSwapClass}>
      {swapDisabled ? (
        <p className="rounded-lg bg-muted/35 px-3 py-2.5 text-center text-xs text-[var(--muted-foreground)] dark:bg-muted/25">
          Trading isn’t enabled for this token in your network configuration.
        </p>
      ) : null}
      <SlidingSegmentTabs
        value={tradeMode}
        onValueChange={(v) => setTradeMode(v as 'buy' | 'sell')}
        className="w-full"
        listClassName={cn(tradeSptSwapSegmentShellClass, 'grid h-10 w-full grid-cols-2')}
        aria-label="Buy or sell"
        items={sptBuySellModeItems}
      />

      <div className="relative space-y-0">
        {tradeMode === 'buy' ? (
          <>
            {buyBucket}
            {flipTokensRow}
            {sellBucket}
          </>
        ) : (
          <>
            {sellBucket}
            {flipTokensRow}
            {buyBucket}
          </>
        )}
      </div>

      <Button
        type="button"
        disabled={swapDisabled}
        className="h-12 w-full rounded-2xl font-semibold opacity-80"
      >
        {swapDisabled ? 'Trading unavailable' : 'Enter an amount'}
      </Button>
    </div>
  );
}

function PriceChartBlock({
  timeframe,
  onTimeframeChange,
  chartSeries,
}: {
  timeframe: Timeframe;
  onTimeframeChange: (t: Timeframe) => void;
  chartSeries: readonly SocialProofChartPoint[];
}) {
  const data = useMemo(() => chartRowsWithLabels(chartSeries), [chartSeries]);

  const tfItems: SlidingSegmentItem[] = useMemo(
    () =>
      (['1H', '1D', '1W', '1M', '1Y', 'ALL'] as Timeframe[]).map((tf) => ({
        value: tf,
        label: tf,
        triggerClassName: 'px-1.5 py-0 text-[11px] leading-tight min-w-0',
      })),
    []
  );

  return (
    <div className="space-y-3">
      {data.length === 0 ? (
        <div
          className={cn(
            'flex h-[min(52vw,340px)] w-full max-h-[400px] min-h-[220px] items-center justify-center rounded-xl',
            'bg-muted/25 text-sm text-[var(--muted-foreground)] dark:bg-muted/20'
          )}
        >
          No price history yet.
        </div>
      ) : (
      <ChartContainer
        config={chartConfig}
        className={cn(
          'h-[min(52vw,340px)] w-full max-h-[400px] min-h-[220px] justify-start [&_.recharts-surface]:overflow-visible',
          'aspect-auto'
        )}
      >
        <AreaChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="sptFillPrimary" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-price)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--color-price)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted/40" />
          <XAxis
            dataKey="t"
            tickFormatter={(v) => formatUtcMonthDayMs(Number(v))}
            tickLine={false}
            axisLine={false}
            minTickGap={28}
            tickMargin={8}
          />
          <YAxis
            orientation="right"
            tickLine={false}
            axisLine={false}
            width={48}
            domain={['auto', 'auto']}
            tickFormatter={(v) => Number(v).toFixed(3)}
          />
          <ChartTooltip
            cursor={{ stroke: 'var(--border)', strokeWidth: 1, strokeDasharray: '4 4' }}
            content={
              <ChartTooltipContent
                labelFormatter={(_, p) => {
                  const row = p?.[0]?.payload as { label?: string } | undefined;
                  return row?.label ?? '';
                }}
              />
            }
          />
          <Area
            type="monotone"
            dataKey="price"
            stroke="var(--color-price)"
            strokeWidth={2}
            fill="url(#sptFillPrimary)"
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ChartContainer>
      )}

      <SlidingSegmentTabs
        value={timeframe}
        onValueChange={(v) => onTimeframeChange(v as Timeframe)}
        className="min-w-0 sm:max-w-[420px]"
        listClassName={cn(tradeSptSwapSegmentShellClass, 'grid h-10 w-full grid-cols-6 sm:w-auto')}
        aria-label="Chart timeframe"
        items={tfItems}
      />
    </div>
  );
}

export type TradeSocialProofTokenWorkspaceProps = {
  token?: SocialProofTokenMeta;
  profilePhotoUrl?: string | null;
  websiteUrl?: string | null;
  /** Reservation fill 0–100 for header avatar ring; null hides ring. */
  reservationFillPercent?: number | null;
  profileRibbon?: SocialProofProfileRibbon | null;
  stats?: readonly SocialProofStat[];
  trades?: readonly TradeHistoryRow[];
  reservations?: readonly ReservationHistoryRow[];
  formerReservations?: readonly ReservationHistoryRow[];
  holders?: readonly SocialProofHolderRow[];
  chartSeries?: readonly SocialProofChartPoint[];
  /** Formatted spot / last price label when you have it (e.g. from API). */
  priceLabel?: string;
  /** Optional secondary line (change / %), already formatted. */
  changeLabel?: string | null;
  tradingEnabled?: boolean | null;
  reservationStatus?: string | null;
  reservationPoolId?: string | null;
  reservationPoolAddress?: string | null;
  hasLiveTradingPool?: boolean;
  maxIndividualReservationMyso?: number | null;
  usdPerMysoReservationQuote?: number | null;
  /** Connected wallet MYSO balance when portfolio overview is loaded. */
  walletMysoAvailable?: number | null;
  /** GraphQL `socialProofToken.isActive`: `true` = trading layout, else reservation layout (when no pool). */
  sptIsActive?: boolean | null;
};

export function TradeSocialProofTokenWorkspace({
  token: tokenProp,
  profilePhotoUrl,
  websiteUrl,
  reservationFillPercent,
  profileRibbon: profileRibbonProp,
  stats: statsProp,
  trades: tradesProp,
  reservations: reservationsProp,
  formerReservations: formerReservationsProp,
  holders: holdersProp,
  chartSeries: chartSeriesProp,
  priceLabel,
  changeLabel,
  tradingEnabled,
  reservationStatus: reservationStatusProp,
  reservationPoolId: reservationPoolIdProp,
  reservationPoolAddress: reservationPoolAddressProp,
  hasLiveTradingPool: hasLiveTradingPoolProp,
  maxIndividualReservationMyso: maxIndividualReservationMysoProp,
  usdPerMysoReservationQuote: usdPerMysoReservationQuoteProp,
  walletMysoAvailable: walletMysoAvailableProp,
  sptIsActive: sptIsActiveProp,
}: TradeSocialProofTokenWorkspaceProps = {}) {
  const [timeframe, setTimeframe] = useState<Timeframe>('1D');
  const [bottomTab, setBottomTab] = useState('transactions');

  const profileRibbon = profileRibbonProp ?? null;
  const token = tokenProp;
  const stats = statsProp ?? [];
  const trades = tradesProp ?? [];
  const reservations = reservationsProp ?? [];
  const formerReservations = formerReservationsProp ?? [];
  const holders = holdersProp ?? [];
  const chartSeries = chartSeriesProp ?? [];

  const displayName = token?.name?.trim() || 'Social proof tokens';
  const displaySymbol = token?.symbol?.trim() || '—';

  const bottomTabs = useMemo((): UnderlineTabItem[] => {
    const tabs: UnderlineTabItem[] = [
      { id: 'transactions', label: 'Transactions' },
      { id: 'reservations', label: 'Reservations' },
    ];
    if (formerReservations.length > 0) {
      tabs.push({ id: 'former', label: 'Former res.' });
    }
    if (holders.length > 0) {
      tabs.push({ id: 'holders', label: 'Holders' });
    }
    return tabs;
  }, [formerReservations.length, holders.length]);

  useEffect(() => {
    if (bottomTabs.some((t) => t.id === bottomTab)) return;
    setBottomTab('transactions');
  }, [bottomTab, bottomTabs]);

  const reservationPoolId = reservationPoolIdProp?.trim() || null;
  const reservationPoolAddress =
    reservationPoolAddressProp?.trim() || profileRibbon?.reservationPoolAddress?.trim() || null;
  const reservationStatus = reservationStatusProp?.trim() || null;
  const hasLiveTradingPool = hasLiveTradingPoolProp === true;
  const maxIndividualReservationMyso = maxIndividualReservationMysoProp ?? null;
  const usdPerMysoReservationQuote = usdPerMysoReservationQuoteProp ?? null;
  const walletMysoAvailable = walletMysoAvailableProp ?? null;
  const isSptActive = sptIsActiveProp ?? profileRibbon?.isActive ?? null;

  const sidePanelMode = useMemo(
    () =>
      resolveSptSidePanelMode({
        hasSptPool: hasLiveTradingPool,
        reservationPoolId,
        reservationPoolAddress,
        reservationStatus,
      }),
    [hasLiveTradingPool, reservationPoolId, reservationPoolAddress, reservationStatus]
  );

  const hasQuotePrice = Boolean(priceLabel && priceLabel !== '—');
  /** Show header quote for live trading or enabled tokens (e.g. threshold met, still reserving). */
  const showTradingQuote =
    sidePanelMode === 'full' || (isSptActive === true && hasQuotePrice);
  const quoteDisplayPrice =
    hasQuotePrice && priceLabel ? priceLabel.trim() : '$0.00';
  const { percent: quoteParsedPct, rest: quoteChangeRest } = parsePercentFromChangeLabel(
    changeLabel ?? null
  );
  const quotePctChipValue =
    quoteParsedPct != null ? quoteParsedPct : !hasQuotePrice ? 0 : null;
  const quoteSubline =
    quoteChangeRest ??
    (changeLabel?.trim() && quoteParsedPct == null ? changeLabel.trim() : null) ??
    'Latest quote';

  return (
    <div
      className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-y-auto overscroll-y-contain bg-background font-satoshi text-foreground"
      aria-label="Social proof token workspace"
    >
      <div
        className={cn(
          'mx-auto flex w-full max-w-6xl flex-col gap-5 md:gap-6 xl:max-w-7xl',
          'px-4 py-5 sm:px-6 md:py-6'
        )}
      >
        <SptProfileHeaderBlock
          displayName={displayName}
          displaySymbol={displaySymbol}
          profilePhotoUrl={profilePhotoUrl ?? null}
          profileRibbon={profileRibbon}
          reservationFillPercent={reservationFillPercent}
          showTradingQuote={showTradingQuote}
          quoteDisplayPrice={quoteDisplayPrice}
          quoteSubline={quoteSubline}
          quotePctChipValue={quotePctChipValue}
        />

        <div
          className={cn(
            'flex w-full min-w-0 flex-col gap-6 lg:flex-row lg:items-start lg:gap-8'
          )}
        >
          <div className="min-w-0 w-full flex-1">
            {isSptActive === true ? (
              <section className={cn(tradeSptRoundedPanelClass, 'p-3 sm:p-4')}>
                <PriceChartBlock
                  timeframe={timeframe}
                  onTimeframeChange={setTimeframe}
                  chartSeries={chartSeries}
                />
              </section>
            ) : null}

            <div
              className={cn(
                'space-y-6 pb-10',
                isSptActive === true ? 'mt-8' : 'mt-0'
              )}
            >
              <section className={cn(tradeSptRoundedPanelClass, 'space-y-3')}>
                <StatGrid stats={stats} />
              </section>
              <section className={cn(tradeSptRoundedPanelClass, 'space-y-3')}>
                <AboutBlock
                  token={token}
                  websiteUrl={websiteUrl}
                  profileRibbon={profileRibbon}
                />
              </section>
              <section
                className={cn(tradeSptRoundedPanelClass, 'space-y-4')}
                aria-label="Transactions and reservations"
              >
                <Tabs
                  tabs={bottomTabs}
                  activeTab={bottomTab}
                  onTabChange={setBottomTab}
                  aria-label="Token activity"
                  listClassName="gap-4 pb-1"
                  triggerClassName="px-1 py-2 text-sm font-medium"
                />
                {bottomTab === 'transactions' ? (
                  <TradeHistoryTable rows={[...trades]} />
                ) : bottomTab === 'reservations' ? (
                  <ReservationsHistoryTable rows={[...reservations]} />
                ) : bottomTab === 'former' ? (
                  <ReservationsHistoryTable rows={[...formerReservations]} />
                ) : (
                  <HoldersTable rows={holders} />
                )}
              </section>
            </div>
          </div>

          <aside
            className={cn(
              'w-full shrink-0 self-start bg-transparent',
              'lg:w-[min(100%,380px)] xl:w-[400px]'
            )}
            aria-label={sidePanelMode === 'simple' ? 'Reservation' : 'Swap'}
          >
            {sidePanelMode === 'none' ? (
              <div className={tradeSptEmptyAsideClass}>
                <p className="text-sm font-medium text-foreground">No reservation or trading</p>
                <p className="mt-2 text-xs leading-relaxed text-[var(--muted-foreground)]">
                  This token does not have an open reservation pool or live trading pool yet, so swap
                  and reserve actions are unavailable.
                </p>
              </div>
            ) : sidePanelMode === 'simple' ? (
              <SimpleReservationAmountCard
                walletMysoAvailable={walletMysoAvailable}
                maxReservationMyso={maxIndividualReservationMyso}
                usdPerMyso={usdPerMysoReservationQuote}
              />
            ) : (
              <SocialProofSwapCard
                sellSymbol={displaySymbol === '—' ? 'Token' : displaySymbol}
                tradingEnabled={tradingEnabled}
              />
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
