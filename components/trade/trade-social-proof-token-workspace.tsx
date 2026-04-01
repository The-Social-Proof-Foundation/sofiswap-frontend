'use client';

/**
 * Social proof token detail shell: pass token, stats, trades, reservations, and chart
 * points from your API; omitted props render empty placeholders (no fabricated market data).
 */

import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { useMySocialAuth } from '@/hooks/useMySocialAuth';
import { useNetwork } from '@/lib/network-provider';
import { checkFollowStatus } from '@/lib/profile-utils';
import {
  signAndExecuteFollowUser,
  signAndExecuteUnfollowUser,
} from '@/lib/tx/social-follow';
import { INSUFFICIENT_MYSO_FOR_GAS_MESSAGE } from '@/lib/transaction-utils';
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
  Layers,
  Loader2,
  Lock,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { buildMysocialWalletExplorerHref } from '@/lib/mysocial-wallet-explorer';
import { resolveSptSidePanelMode } from '@/lib/spt-reservation-ui-policy';
import {
  tradeSptEmptyAsideClass,
  tradeSptRoundedPanelClass,
  tradeSptRoundedPanelShellClass,
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
function mysoAddressesEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = a?.trim().toLowerCase() ?? '';
  const y = b?.trim().toLowerCase() ?? '';
  if (!x || !y) return false;
  return x === y;
}

function SptCreatorFollowButton({ targetAddress }: { targetAddress: string | null }) {
  const { displayAddress, keypair, isAuthenticated } = useMySocialAuth();
  const { currentNetwork } = useNetwork();
  const [isFollowing, setIsFollowing] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const target = targetAddress?.trim() ?? null;
  const viewer = displayAddress?.trim() ?? null;

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!viewer || !target || mysoAddressesEqual(viewer, target)) {
        if (!cancelled) setIsFollowing(false);
        return;
      }
      setStatusLoading(true);
      try {
        const v = await checkFollowStatus(viewer, target);
        if (!cancelled) setIsFollowing(v);
      } finally {
        if (!cancelled) setStatusLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [viewer, target]);

  if (!target || !viewer || mysoAddressesEqual(viewer, target)) {
    return null;
  }
  if (!isAuthenticated) {
    return null;
  }

  const busy = statusLoading || actionLoading;

  const onPress = async () => {
    if (!keypair || !viewer) {
      toast.error('Wallet signing is not ready. Try signing in again.');
      return;
    }
    setActionLoading(true);
    try {
      if (isFollowing) {
        await signAndExecuteUnfollowUser({
          network: currentNetwork,
          signer: keypair,
          followerAddress: viewer,
          followingAddress: target,
        });
        setIsFollowing(false);
        toast.success('Unfollowed');
      } else {
        await signAndExecuteFollowUser({
          network: currentNetwork,
          signer: keypair,
          followerAddress: viewer,
          followingAddress: target,
        });
        setIsFollowing(true);
        toast.success('Following');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === INSUFFICIENT_MYSO_FOR_GAS_MESSAGE || msg.includes('Insufficient MySo')) {
        toast.error(INSUFFICIENT_MYSO_FOR_GAS_MESSAGE);
      } else {
        toast.error(msg || 'Could not update follow status');
      }
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant={isFollowing ? 'secondary' : 'default'}
      size="sm"
      className="h-8 shrink-0 gap-1.5 px-3 text-xs font-medium"
      disabled={busy || !keypair}
      onClick={() => void onPress()}
      aria-busy={busy}
    >
      {busy ? (
        <>
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          <span className="sr-only">Loading</span>
        </>
      ) : isFollowing ? (
        'Following'
      ) : (
        'Follow'
      )}
    </Button>
  );
}

function formatSptUsdPriceLabel(raw: string): string {
  const t = raw.trim();
  if (!t || t === '—') return '—';
  if (t.startsWith('$')) return t;
  return `$${t}`;
}

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
          'relative flex size-16 shrink-0 rounded-full bg-background p-px shadow-sm ring-1 ring-border sm:size-[4.25rem]',
          className
        )}
      >
        <div
          className={cn(
            'relative flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-full',
            'shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] ring-1 ring-border/70'
          )}
        >
          <SptHeaderAvatarFace photoUrl={photoUrl ?? null} symbol={symbol} />
        </div>
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
        'shrink-0 rounded-full bg-background p-1 shadow-sm ring-1 ring-border',
        className
      )}
    >
      <div className="relative h-[5.5rem] w-[5.5rem] sm:h-[5.75rem] sm:w-[5.75rem]">
        <svg
          className="absolute inset-0 h-full w-full rotate-90"
          viewBox={`0 0 ${vb} ${vb}`}
          aria-hidden
        >
          {/* Wide faint track behind the inner track + progress (hex --muted-foreground: use stroke + opacity). */}
          <circle
            cx={c}
            cy={c}
            r={42.35}
            fill="none"
            className="stroke-[var(--muted-foreground)]"
            strokeWidth={ringStroke * 1.12}
            opacity={0.14}
          />
          <circle
            cx={c}
            cy={c}
            r={r}
            fill="none"
            className="stroke-[var(--muted-foreground)]"
            strokeWidth={ringStroke}
            opacity={0.28}
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
        {/* Padding between ring and photo: opaque track + photo well */}
        <div className="absolute inset-[13px] flex overflow-hidden rounded-full bg-background ring-1 ring-border sm:inset-[14px]">
          <SptHeaderAvatarFace photoUrl={photoUrl ?? null} symbol={symbol} />
        </div>
      </div>
    </div>
  );
}

function SptWorkspacePriceBand({
  formattedUsdPrice,
  isReservationPhase,
  show24hChange,
  quotePctChipValue,
  quoteSubline,
}: {
  formattedUsdPrice: string;
  isReservationPhase: boolean;
  show24hChange: boolean;
  quotePctChipValue: number | null;
  quoteSubline: string;
}) {
  return (
    <div className="flex w-full min-w-0 flex-col justify-start gap-0.5 pl-4 pt-3 text-left sm:pt-4">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <p className="font-sans text-2xl font-semibold tabular-nums tracking-[-0.02em] md:text-3xl leading-none antialiased">
          {formattedUsdPrice}
        </p>
        {isReservationPhase ? (
          <span
            className="inline-flex h-3 w-3 shrink-0 items-center justify-center text-[var(--muted-foreground)] sm:h-4 sm:w-4"
            title="Reservation phase"
          >
            <Lock aria-hidden className="block" size="100%" strokeWidth={1.35} />
            <span className="sr-only">Reservation phase; spot trading not live</span>
          </span>
        ) : show24hChange && quotePctChipValue != null ? (
          <SptQuoteChangePctChip value={quotePctChipValue} />
        ) : null}
      </div>
      <p className="text-sm tabular-nums text-foreground">
        0 <span className="text-xs text-[var(--muted-foreground)]">MySo</span>
      </p>
      {!isReservationPhase && show24hChange ? (
        <p className="text-sm text-muted-foreground">{quoteSubline}</p>
      ) : null}
    </div>
  );
}

function SptProfileIdentityCard({
  creatorDisplayName,
  displayName,
  displaySymbol,
  coverPhotoUrl,
  profilePhotoUrl,
  profileRibbon,
  reservationFillPercent,
  className,
}: {
  creatorDisplayName: string | null;
  displayName: string;
  displaySymbol: string;
  coverPhotoUrl: string | null;
  profilePhotoUrl: string | null;
  profileRibbon: SocialProofProfileRibbon | null;
  reservationFillPercent?: number | null;
  className?: string;
}) {
  const headline =
    creatorDisplayName?.trim() || displayName.trim() || 'Social proof tokens';
  const rawUser = profileRibbon?.username?.trim();
  const username = rawUser?.replace(/^@/, '') ?? null;
  const profileAddress = profileRibbon?.profileAddress?.trim() ?? null;
  const sym = displaySymbol !== '—' ? displaySymbol : null;
  const showFollowStats =
    profileRibbon?.followersCount != null || profileRibbon?.followingCount != null;
  const coverSrc = coverPhotoUrl?.trim();

  return (
    <div
      className={cn(
        tradeSptRoundedPanelClass,
        '!p-0 overflow-hidden',
        'flex min-h-0 min-w-0 flex-col',
        className
      )}
    >
      <div className="relative h-[3.5rem] w-full shrink-0 bg-muted/40 sm:h-[6rem]">
        {coverSrc ? (
          <Image
            src={coverSrc}
            alt=""
            fill
            className="object-cover"
            sizes="(min-width: 1280px) 400px, 100vw"
            unoptimized
          />
        ) : (
          <div
            className="absolute inset-0 bg-gradient-to-r from-primary/[0.14] via-muted/35 to-muted/20 dark:from-primary/[0.12] dark:via-muted/20 dark:to-muted/12"
            aria-hidden
          />
        )}
      </div>
      <div className="min-w-0 pb-3 pl-0 pr-1.5 pt-1 sm:pb-4 sm:pr-2 sm:pt-1.5">
        <div className="flex min-w-0 items-start justify-between gap-0.5 sm:gap-1">
          <div className="flex min-w-0 flex-1 items-start gap-0.5 sm:gap-1">
            <WorkspaceHeaderAvatar
              photoUrl={profilePhotoUrl}
              symbol={sym || (headline.slice(0, 2).toUpperCase() || 'SP')}
              reservationFillPercent={reservationFillPercent}
              className={cn(
                'shrink-0',
                reservationFillPercent != null
                  ? '-mt-[3.5rem] sm:-mt-[3.75rem]'
                  : '-mt-[2.375rem] sm:-mt-[2.625rem]'
              )}
            />
            <div className="min-w-0 flex-1 text-left">
              <div className="flex min-w-0 items-center justify-between gap-1 sm:gap-1.5">
                <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1 gap-y-0.5 sm:gap-x-1.5">
                  <h1 className="min-w-0 text-lg font-medium leading-tight tracking-tight text-foreground sm:text-xl">
                    {headline}
                  </h1>
                  {username ? (
                    <span className="shrink-0 text-sm leading-tight text-[var(--muted-foreground)]">
                      @
                      {username}
                    </span>
                  ) : null}
                  {sym ? (
                    <span className="shrink-0 rounded-md bg-muted/60 px-1.5 py-0.5 text-[11px] font-medium leading-none text-[var(--muted-foreground)]">
                      {sym}
                    </span>
                  ) : null}
                </div>
              </div>

              {profileAddress ? (
                <div className="mt-1 max-w-md min-w-0">
                  <ProfileMenuWalletCopyRow address={profileAddress} addressHead={10} addressTail={10} />
                </div>
              ) : null}

              {showFollowStats && profileRibbon ? (
                <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm">
                  {profileRibbon.followersCount != null ? (
                    <p className="inline-flex items-baseline gap-1 leading-snug">
                      <span className="font-semibold tabular-nums text-primary">
                        {profileRibbon.followersCount.toLocaleString()}
                      </span>
                      <span className="text-[var(--muted-foreground)]">followers</span>
                    </p>
                  ) : null}
                  {profileRibbon.followingCount != null ? (
                    <p className="inline-flex items-baseline gap-1 leading-snug">
                      <span className="font-semibold tabular-nums text-primary">
                        {profileRibbon.followingCount.toLocaleString()}
                      </span>
                      <span className="text-[var(--muted-foreground)]">following</span>
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
          <div className="shrink-0 self-start">
            <SptCreatorFollowButton targetAddress={profileAddress} />
          </div>
        </div>
      </div>
    </div>
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
      <table className="w-full text-left text-xs font-satoshi">
        <thead>
          <tr className="border-b border-trade-shell text-[var(--muted-foreground)]">
            <th className="px-3 py-2.5 font-medium">Time</th>
            <th className="px-3 py-2.5 font-medium">Side</th>
            <th className="px-3 py-2.5 text-right font-medium">Price</th>
            <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">Amount</th>
            <th className="px-3 py-2.5 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody className="tabular-nums tracking-tight text-[13px] leading-normal">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="p-0" role="presentation">
                <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-trade-shell bg-muted/25 text-muted-foreground dark:bg-muted/15">
                    <Layers className="size-5" strokeWidth={1.65} aria-hidden />
                  </span>
                  <p className="text-[13px] font-medium leading-snug tracking-tight text-[var(--muted-foreground)]">
                    No transactions yet.
                  </p>
                </div>
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr
                key={r.id}
                className="border-b border-trade-shell last:border-b-0 hover:bg-muted/25"
              >
                <td className="max-w-[8rem] truncate px-3 py-2 text-[var(--muted-foreground)]">
                  {formatUtcTimeShortFromIso(r.time)}
                </td>
              <td className="px-3 py-2">
                <span
                  className={cn(
                    'font-semibold uppercase tracking-wide',
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
          <tr className="border-b border-trade-shell text-[var(--muted-foreground)]">
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
      <table className="w-full text-left text-xs font-satoshi">
        <thead>
          <tr className="border-b border-trade-shell text-[var(--muted-foreground)]">
            <th className="px-3 py-2.5 font-medium">Time</th>
            <th className="px-3 py-2.5 font-medium">Holder</th>
            <th className="hidden px-3 py-2.5 font-medium md:table-cell">Reservation</th>
            <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">Allocated</th>
            <th className="px-3 py-2.5 text-right font-medium">Received</th>
            <th className="px-3 py-2.5 text-right font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="tabular-nums tracking-tight text-[13px] leading-normal">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="p-0" role="presentation">
                <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-trade-shell bg-muted/25 text-muted-foreground dark:bg-muted/15">
                    <Layers className="size-5" strokeWidth={1.65} aria-hidden />
                  </span>
                  <p className="text-[13px] font-medium leading-snug tracking-tight text-[var(--muted-foreground)]">
                    No reservations yet.
                  </p>
                </div>
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr
                key={r.id}
                className="border-b border-trade-shell last:border-b-0 hover:bg-muted/25"
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
                    'text-[11px] font-semibold tracking-tight tabular-nums',
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

function formatMysoBreakdownAmount(n: number): string {
  return formatCompactDecimal(n, { maxFractionDigits: 8 });
}

/** Fee in MySo from principal × bps / 10_000 (GraphQL reservation / trading fee fields). */
function mysoFeeFromBps(principalMyso: number, bps: number | null | undefined): number {
  if (principalMyso <= 0 || !Number.isFinite(principalMyso)) return 0;
  if (bps == null || !Number.isFinite(bps)) return 0;
  const b = Math.max(0, bps);
  return (principalMyso * b) / 10_000;
}

const sptFeeBreakdownCardClass = cn(
  'rounded-xl border border-border/50 bg-background/40 px-3 py-2.5',
  'dark:border-trade-shell dark:bg-background/22'
);

function SptTradeFeeBreakdownCard({
  subtotalMyso,
  gasFeeMyso,
  platformEcosystemFeeMyso,
  creatorFeeMyso,
  overallTotalFeeMyso,
}: {
  subtotalMyso: number;
  gasFeeMyso: number;
  platformEcosystemFeeMyso: number;
  creatorFeeMyso: number;
  overallTotalFeeMyso: number;
}) {
  const row = (label: string, amountMyso: number, variant: 'default' | 'total' = 'default') => (
    <div className="flex items-baseline justify-between gap-3 text-[11px] leading-snug">
      <span className="min-w-0 text-left text-[var(--muted-foreground)]">{label}</span>
      <span
        className="flex min-w-0 shrink-0 items-baseline justify-end gap-1"
        title={`${formatMysoBreakdownAmount(amountMyso)} MySo`}
      >
        <span
          className={cn(
            'text-right tabular-nums text-foreground',
            variant === 'total' ? 'text-sm font-semibold' : ''
          )}
        >
          {formatMysoBreakdownAmount(amountMyso)}
        </span>
        <span
          className={cn(
            'shrink-0 font-semibold tracking-tight text-[var(--muted-foreground)]',
            variant === 'total' ? 'text-xs' : 'text-[10px]'
          )}
        >
          MySo
        </span>
      </span>
    </div>
  );

  return (
    <div className={sptFeeBreakdownCardClass} role="region" aria-label="Cost breakdown in MySo">
      <div className="space-y-1.5">
        {row('Subtotal', subtotalMyso)}
        {row('Gas fee', gasFeeMyso)}
        {row('Platform ecosystem fee', platformEcosystemFeeMyso)}
        {row('Creator fee', creatorFeeMyso)}
        <div className="border-t border-border/50 pt-1.5 dark:border-trade-shell">
          {row('Total', overallTotalFeeMyso, 'total')}
        </div>
      </div>
    </div>
  );
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
  reservationPlatformFeeBps,
  reservationTreasuryFeeBps,
  reservationCreatorFeeBps,
  className,
}: {
  walletMysoAvailable: number | null;
  maxReservationMyso: number | null;
  usdPerMyso: number | null;
  reservationPlatformFeeBps?: number | null;
  reservationTreasuryFeeBps?: number | null;
  reservationCreatorFeeBps?: number | null;
  className?: string;
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
    const zeroUsdLabel = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(0);
    const zeroMysoLabel = `${formatCompactDecimal(0, { maxFractionDigits: 2 })} MySo`;

    if (primaryAmount <= 0) {
      return inputMode === 'myso' ? zeroUsdLabel : zeroMysoLabel;
    }
    if (!canConvert) {
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
    return `${formatCompactDecimal(myso, { maxFractionDigits: 2 })} MySo`;
  }, [canConvert, inputMode, primaryAmount, usdPerMyso]);

  const primarySuffix = inputMode === 'myso' ? 'MySo' : 'USD';

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

  const { reserveSubtotalMyso, reserveFeeLinesMyso } = useMemo(() => {
    const emptyFees = { gas: 0, platform: 0, creator: 0, total: 0 };
    if (primaryAmount <= 0 || !Number.isFinite(primaryAmount)) {
      return { reserveSubtotalMyso: 0, reserveFeeLinesMyso: emptyFees };
    }
    let subtotalMyso: number;
    if (inputMode === 'myso') {
      subtotalMyso = primaryAmount;
    } else if (canConvert) {
      subtotalMyso = primaryAmount / usdPerMyso!;
    } else {
      subtotalMyso = 0;
    }
    const platformBps = reservationPlatformFeeBps ?? null;
    const treasuryBps = reservationTreasuryFeeBps ?? null;
    const creatorBps = reservationCreatorFeeBps ?? null;
    const platformEcosystemBps =
      (platformBps != null && Number.isFinite(platformBps) ? Math.max(0, platformBps) : 0) +
      (treasuryBps != null && Number.isFinite(treasuryBps) ? Math.max(0, treasuryBps) : 0);
    const platformEcosystemMyso = mysoFeeFromBps(subtotalMyso, platformEcosystemBps);
    const creatorMyso = mysoFeeFromBps(subtotalMyso, creatorBps);
    const gasMyso = 0;
    const totalFeesMyso = gasMyso + platformEcosystemMyso + creatorMyso;
    return {
      reserveSubtotalMyso: subtotalMyso,
      reserveFeeLinesMyso: {
        gas: gasMyso,
        platform: platformEcosystemMyso,
        creator: creatorMyso,
        total: totalFeesMyso,
      },
    };
  }, [
    canConvert,
    inputMode,
    primaryAmount,
    reservationCreatorFeeBps,
    reservationPlatformFeeBps,
    reservationTreasuryFeeBps,
    usdPerMyso,
  ]);

  return (
    <div className={cn(tradeSptTallCardReserveClass, className)}>
      <div>
        <p className="text-md font-medium text-[var(--muted-foreground)]">Reserve</p>
      </div>

      <div className="space-y-3">
        <div className="flex min-h-[3rem] items-end gap-2 pt-2">
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            aria-label={inputMode === 'myso' ? 'Amount in MySo' : 'Amount in USD'}
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
                  ? 'Switch to typing USD; shows MySo equivalent'
                  : 'Switch to typing MySo; shows USD equivalent'
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
            aria-label="Fill amount from available MySo"
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

      <div className="mt-1 flex min-h-0 flex-col gap-4">
        <SptTradeFeeBreakdownCard
          subtotalMyso={reserveSubtotalMyso}
          gasFeeMyso={reserveFeeLinesMyso.gas}
          platformEcosystemFeeMyso={reserveFeeLinesMyso.platform}
          creatorFeeMyso={reserveFeeLinesMyso.creator}
          overallTotalFeeMyso={reserveFeeLinesMyso.total}
        />
        <Button
          type="button"
          disabled={reserveDisabled}
          className="h-12 w-full shrink-0 rounded-2xl font-semibold opacity-80"
        >
          {reserveDisabled ? 'Enter an amount' : 'Reserve'}
        </Button>
      </div>
    </div>
  );
}

function SocialProofSwapCard({
  sellSymbol,
  tradingEnabled,
  className,
}: {
  sellSymbol: string;
  tradingEnabled?: boolean | null;
  className?: string;
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
        <button type="button" className={sptSwapTokenSelectClass} aria-label="Select buy token (Eth)">
          <div
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-full',
              'bg-muted/90 text-[11px] font-bold text-foreground dark:bg-muted/65'
            )}
            aria-hidden
          >
            Eth
          </div>
          <span className="max-w-[5rem] truncate">Eth</span>
          <ChevronDown className="size-4 shrink-0 opacity-55" strokeWidth={2} />
        </button>
      </div>
      <div className="mt-3 text-[11px] tabular-nums text-[var(--muted-foreground)]">$0</div>
    </div>
  );

  return (
    <div data-trade-mode={tradeMode} className={cn(tradeSptTallCardSwapClass, className)}>
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

      <div className="mt-1 flex min-h-0 flex-col gap-4">
        <SptTradeFeeBreakdownCard
          subtotalMyso={0}
          gasFeeMyso={0}
          platformEcosystemFeeMyso={0}
          creatorFeeMyso={0}
          overallTotalFeeMyso={0}
        />
        <Button
          type="button"
          disabled={swapDisabled}
          className="h-12 w-full shrink-0 rounded-2xl font-semibold opacity-80"
        >
          {swapDisabled ? 'Trading unavailable' : 'Enter an amount'}
        </Button>
      </div>
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
  /** GraphQL profile.displayName for identity headline. */
  creatorDisplayName?: string | null;
  profilePhotoUrl?: string | null;
  coverPhotoUrl?: string | null;
  websiteUrl?: string | null;
  /** Reservation fill 0–100 for header avatar ring; null hides ring. */
  reservationFillPercent?: number | null;
  profileRibbon?: SocialProofProfileRibbon | null;
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
  /** Connected wallet MySo balance when portfolio overview is loaded. */
  walletMysoAvailable?: number | null;
  /** GraphQL `socialProofToken.isActive`: `true` = trading layout, else reservation layout (when no pool). */
  sptIsActive?: boolean | null;
  /** `sptConfiguration` reservation fee bps for breakdown estimates (platform + treasury shown as platform ecosystem). */
  reservationPlatformFeeBps?: number | null;
  reservationTreasuryFeeBps?: number | null;
  reservationCreatorFeeBps?: number | null;
};

export function TradeSocialProofTokenWorkspace({
  token: tokenProp,
  creatorDisplayName: creatorDisplayNameProp,
  profilePhotoUrl,
  coverPhotoUrl,
  websiteUrl,
  reservationFillPercent,
  profileRibbon: profileRibbonProp,
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
  reservationPlatformFeeBps: reservationPlatformFeeBpsProp,
  reservationTreasuryFeeBps: reservationTreasuryFeeBpsProp,
  reservationCreatorFeeBps: reservationCreatorFeeBpsProp,
}: TradeSocialProofTokenWorkspaceProps = {}) {
  const [timeframe, setTimeframe] = useState<Timeframe>('1D');
  const [bottomTab, setBottomTab] = useState('transactions');

  const profileRibbon = profileRibbonProp ?? null;
  const token = tokenProp;
  const trades = tradesProp ?? [];
  const reservations = reservationsProp ?? [];
  const formerReservations = formerReservationsProp ?? [];
  const holders = holdersProp ?? [];
  const chartSeries = chartSeriesProp ?? [];

  const creatorDisplayName = creatorDisplayNameProp ?? null;
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
  const reservationPlatformFeeBps = reservationPlatformFeeBpsProp ?? null;
  const reservationTreasuryFeeBps = reservationTreasuryFeeBpsProp ?? null;
  const reservationCreatorFeeBps = reservationCreatorFeeBpsProp ?? null;

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

  const formattedUsdPrice = formatSptUsdPriceLabel(quoteDisplayPrice);
  const isReservationPhase = sidePanelMode === 'simple';
  const show24hChange = sidePanelMode === 'full' && showTradingQuote;

  const asideWidthClass =
    'w-full shrink-0 lg:w-[min(100%,380px)] xl:w-[400px]';

  return (
    <div
      className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-y-auto overscroll-y-contain bg-background font-satoshi text-foreground"
      aria-label="Social proof token workspace"
    >
      <div
        className={cn(
          'mx-auto w-full max-w-6xl px-4 pb-8 pt-3 sm:px-6 sm:pt-4 md:pt-5 xl:max-w-7xl',
          'flex flex-col gap-4 md:gap-5',
          'lg:flex-row lg:items-start lg:gap-x-5 lg:gap-y-0'
        )}
      >
        <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col gap-3">
          <SptWorkspacePriceBand
            formattedUsdPrice={formattedUsdPrice}
            isReservationPhase={isReservationPhase}
            show24hChange={show24hChange}
            quotePctChipValue={quotePctChipValue}
            quoteSubline={quoteSubline}
          />

          {isSptActive === true ? (
            <section className={cn(tradeSptRoundedPanelClass, 'p-3 sm:p-4')}>
              <PriceChartBlock
                timeframe={timeframe}
                onTimeframeChange={setTimeframe}
                chartSeries={chartSeries}
              />
            </section>
          ) : null}

          <div className={cn('space-y-3', isSptActive === true ? 'mt-0 md:mt-0.5' : 'mt-0')}>
            <section className={cn(tradeSptRoundedPanelClass, 'space-y-3')}>
              <AboutBlock
                token={token}
                websiteUrl={websiteUrl}
                profileRibbon={profileRibbon}
              />
            </section>
            <section
              className={tradeSptRoundedPanelShellClass}
              aria-label="Transactions and reservations"
            >
              <div className="pt-2 sm:pt-2.5">
                <Tabs
                  tabs={bottomTabs}
                  activeTab={bottomTab}
                  onTabChange={setBottomTab}
                  aria-label="Token activity"
                  tabStripInsetClassName="px-4 sm:px-5"
                  listClassName="gap-4 pb-1.5"
                  triggerClassName="px-1 py-1 text-sm font-medium"
                />
              </div>
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
            'flex w-full flex-col gap-0 bg-transparent lg:shrink-0',
            asideWidthClass
          )}
          aria-label={sidePanelMode === 'simple' ? 'Reservation' : 'Swap'}
        >
          <SptProfileIdentityCard
            creatorDisplayName={creatorDisplayName}
            displayName={displayName}
            displaySymbol={displaySymbol}
            coverPhotoUrl={coverPhotoUrl ?? null}
            profilePhotoUrl={profilePhotoUrl ?? null}
            profileRibbon={profileRibbon}
            reservationFillPercent={reservationFillPercent}
            className="rounded-b-none"
          />
          {sidePanelMode === 'none' ? (
            <div className={cn(tradeSptEmptyAsideClass, 'rounded-t-none border-t-0')}>
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
              reservationPlatformFeeBps={reservationPlatformFeeBps}
              reservationTreasuryFeeBps={reservationTreasuryFeeBps}
              reservationCreatorFeeBps={reservationCreatorFeeBps}
              className="rounded-t-none border-t-0"
            />
          ) : (
            <SocialProofSwapCard
              sellSymbol={displaySymbol === '—' ? 'Token' : displaySymbol}
              tradingEnabled={tradingEnabled}
              className="rounded-t-none border-t-0"
            />
          )}
        </aside>
      </div>
    </div>
  );
}
