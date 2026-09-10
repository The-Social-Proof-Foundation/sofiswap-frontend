'use client';

/**
 * Social proof token detail shell: pass token, stats, trades, reservations, and chart
 * points from your API; omitted props render empty placeholders (no fabricated market data).
 */

import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { SptReservationCard } from '@/components/trade/spt-reservation-card';
import { useMySocialAuth } from '@/hooks/useMySocialAuth';
import { useNetwork } from '@/lib/network-provider';
import { checkFollowStatus } from '@/lib/profile-utils';
import {
  signAndExecuteFollowUser,
  signAndExecuteUnfollowUser,
} from '@/lib/tx/social-follow';
import { INSUFFICIENT_MYSO_FOR_GAS_MESSAGE, MYSO_GAS_COIN_TYPE } from '@/lib/transaction-utils';
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
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import {
  baseUnitsToDisplay,
  calculateMaxSptBuyAmount,
  calculateSptBuyCost,
  calculateSptSellRefund,
  feeFromBps,
  parseDisplayAmountToBaseUnits,
} from '@/lib/spt/amounts';
import { getMySoJsonRpcClient } from '@/lib/myso-client';
import { readSptRules } from '@/lib/spt/pool-state';
import {
  executeBuySpt,
  executeEnableSpt,
  executeLaunchSpt,
  executeReserveSpt,
  executeSellSpt,
  executeWithdrawSptReservation,
  findOwnedSocialToken,
  friendlySptTransactionError,
  resolvePostTransactionContext,
  SPT_TOKEN_TYPE_POST,
  SPT_TOKEN_TYPE_PROFILE,
  type SptTokenType,
} from '@/lib/tx/social-proof-token';

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
  traderAddress?: string | null;
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
  return `${t} MySo`;
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
      <p className="text-xs text-muted-foreground">{isReservationPhase ? 'Base price per SPT · reservations open' : 'Price per SPT'}</p>
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
            <th className="px-3 py-2.5 text-right font-medium">Amount (SPT)</th>
            <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">Trader</th>
          </tr>
        </thead>
        <tbody className="tabular-nums tracking-tight text-[13px] leading-normal">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4} className="p-0" role="presentation">
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
              <td className="px-3 py-2 text-right">{r.amount}</td>
              <td className="hidden px-3 py-2 text-right sm:table-cell">{r.traderAddress ? <a href={buildMysocialWalletExplorerHref(r.traderAddress)} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{`${r.traderAddress.slice(0, 6)}…${r.traderAddress.slice(-4)}`}</a> : '—'}</td>
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


function SocialProofSwapCard({
  sellSymbol,
  tradingEnabled,
  walletMysoBaseUnits,
  ownedTokenBaseUnits,
  currentSupplyBaseUnits,
  basePriceBaseUnits,
  quadraticCoefficient,
  tradingFeeBps,
  maxHoldPercentBps,
  isAuthenticated,
  isBusy,
  creatorFeesUseVault,
  hasIndexedVaultSettlements,
  onBuy,
  onSell,
  className,
}: {
  sellSymbol: string;
  tradingEnabled?: boolean | null;
  walletMysoBaseUnits: bigint;
  ownedTokenBaseUnits: bigint;
  currentSupplyBaseUnits: bigint;
  basePriceBaseUnits: bigint;
  quadraticCoefficient: bigint;
  tradingFeeBps: bigint;
  maxHoldPercentBps: bigint;
  isAuthenticated: boolean;
  isBusy: boolean;
  creatorFeesUseVault: boolean;
  hasIndexedVaultSettlements: boolean;
  onBuy: (tokenAmount: bigint, paymentAmount: bigint) => Promise<boolean>;
  onSell: (tokenAmount: bigint) => Promise<boolean>;
  className?: string;
}) {
  const [tradeMode, setTradeMode] = useState<'buy' | 'sell'>('buy');
  const [draft, setDraft] = useState('');
  const swapDisabled = tradingEnabled !== true || isBusy;
  const sellSym =
    sellSymbol === '—' || !sellSymbol?.trim() ? 'Token' : sellSymbol.trim();
  const inputBaseUnits = parseDisplayAmountToBaseUnits(draft) ?? BigInt(0);
  const buyQuote = useMemo(() => {
    const budgetQuote = calculateMaxSptBuyAmount({
      basePrice: basePriceBaseUnits,
      quadraticCoefficient,
      currentSupply: currentSupplyBaseUnits,
      mysoBudget: tradeMode === 'buy' ? inputBaseUnits : BigInt(0),
    });
    if (maxHoldPercentBps <= BigInt(0) || maxHoldPercentBps >= BigInt(10_000)) {
      return budgetQuote;
    }
    const numerator = maxHoldPercentBps * currentSupplyBaseUnits - BigInt(10_000) * ownedTokenBaseUnits;
    const maxBuy = numerator > BigInt(0)
      ? numerator / (BigInt(10_000) - maxHoldPercentBps)
      : BigInt(0);
    const tokenAmount = budgetQuote.tokenAmount < maxBuy ? budgetQuote.tokenAmount : maxBuy;
    return {
      tokenAmount,
      cost: calculateSptBuyCost({
        basePrice: basePriceBaseUnits,
        quadraticCoefficient,
        currentSupply: currentSupplyBaseUnits,
        tokenAmount,
      }),
    };
  }, [
    basePriceBaseUnits,
    currentSupplyBaseUnits,
    inputBaseUnits,
    maxHoldPercentBps,
    ownedTokenBaseUnits,
    quadraticCoefficient,
    tradeMode,
  ]);
  const sellGross = useMemo(
    () => calculateSptSellRefund({
      basePrice: basePriceBaseUnits,
      quadraticCoefficient,
      currentSupply: currentSupplyBaseUnits,
      tokenAmount: tradeMode === 'sell' ? inputBaseUnits : BigInt(0),
    }),
    [basePriceBaseUnits, currentSupplyBaseUnits, inputBaseUnits, quadraticCoefficient, tradeMode]
  );
  const sellFee = feeFromBps(sellGross, tradingFeeBps);
  const sellNet = sellGross - sellFee;
  const estimatedTradingFee = tradeMode === 'buy'
    ? feeFromBps(buyQuote.cost, tradingFeeBps)
    : sellFee;
  const applyTradeFraction = (percent: number) => {
    const available = tradeMode === 'buy' ? walletMysoBaseUnits : ownedTokenBaseUnits;
    setDraft(baseUnitsToDisplay((available * BigInt(percent)) / BigInt(100), 9));
  };
  const tradeAmountValid = tradeMode === 'buy'
    ? inputBaseUnits > BigInt(0) && inputBaseUnits <= walletMysoBaseUnits && buyQuote.tokenAmount > BigInt(0)
    : inputBaseUnits > BigInt(0) && inputBaseUnits <= ownedTokenBaseUnits && sellNet > BigInt(0);

  const sellBucket = (
    <div className={sptSwapBucketClass}>
          <div className="mb-3 flex items-start justify-between gap-2">
            <span className="pt-0.5 text-[12px] font-medium text-[var(--muted-foreground)]">
              {tradeMode === 'sell' ? 'You sell' : 'You receive'}
            </span>
            <div
              className="flex flex-wrap justify-end gap-1"
              role="group"
              aria-label="Sell amount presets"
            >
              {sptSwapPctPresets.map((p) => {
                const percent = p === 'Max' ? 100 : Number.parseInt(p, 10);
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => applyTradeFraction(percent)}
                    className={cn(
                      'rounded-full px-2.5 py-1 text-[10px] font-semibold tabular-nums transition-colors',
                      'bg-background/50 text-foreground hover:bg-background/70 dark:bg-background/30 dark:hover:bg-background/45'
                    )}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex min-h-[2.75rem] items-end justify-between gap-3">
            {tradeMode === 'sell' ? (
              <input
                type="text"
                inputMode="decimal"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={32}
                disabled={isBusy}
                placeholder="0"
                aria-label={`Amount of ${sellSym} to sell`}
                className="min-w-0 flex-1 bg-transparent text-3xl font-semibold tabular-nums leading-none tracking-tight text-foreground outline-none placeholder:text-muted-foreground/35"
              />
            ) : (
              <span className="min-w-0 text-3xl font-semibold tabular-nums leading-none tracking-tight text-foreground">
                {baseUnitsToDisplay(buyQuote.tokenAmount, 6)}
              </span>
            )}
            <span className={sptSwapTokenSelectClass}>
              <TokenAvatar symbol={sellSym} className="size-8 shrink-0 rounded-full text-[11px]" />
              <span className="max-w-[5rem] truncate">{sellSym}</span>
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between gap-2 text-[11px] text-[var(--muted-foreground)]">
            <span className="tabular-nums">{tradeMode === 'sell' ? `${baseUnitsToDisplay(sellNet, 6)} MySo` : 'Estimated receive'}</span>
            <span className="tabular-nums">
              {baseUnitsToDisplay(ownedTokenBaseUnits, 6)} {sellSym} available
            </span>
          </div>
    </div>
  );

  const flipTokensRow = (
    <div className="relative z-[1] -my-3 flex justify-center">
      <button
        type="button"
        onClick={() => {
          setTradeMode((mode) => mode === 'buy' ? 'sell' : 'buy');
          setDraft('');
        }}
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
        <span className="text-[12px] font-medium text-[var(--muted-foreground)]">{tradeMode === 'buy' ? 'You pay' : 'You receive'}</span>
      </div>
      <div className="flex min-h-[2.75rem] items-end justify-between gap-3">
        {tradeMode === 'buy' ? (
          <input
            type="text"
            inputMode="decimal"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={32}
            disabled={isBusy}
            placeholder="0"
            aria-label="MySo amount to spend"
            className="min-w-0 flex-1 bg-transparent text-3xl font-semibold tabular-nums leading-none tracking-tight text-foreground outline-none placeholder:text-muted-foreground/35"
          />
        ) : (
          <span className="min-w-0 text-3xl font-semibold tabular-nums leading-none tracking-tight text-foreground">
            {baseUnitsToDisplay(sellNet, 6)}
          </span>
        )}
        <span className={sptSwapTokenSelectClass}>
          <div
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-full',
              'bg-muted/90 text-[11px] font-bold text-foreground dark:bg-muted/65'
            )}
            aria-hidden
          >
            MY
          </div>
          <span className="max-w-[5rem] truncate">MySo</span>
        </span>
      </div>
      <div className="mt-3 flex justify-between text-[11px] tabular-nums text-[var(--muted-foreground)]">
        <span>{tradeMode === 'buy' ? `${baseUnitsToDisplay(buyQuote.cost, 6)} MySo curve cost` : 'Estimated receive'}</span>
        <span>{baseUnitsToDisplay(walletMysoBaseUnits, 6)} MySo available</span>
      </div>
    </div>
  );

  return (
    <div data-trade-mode={tradeMode} className={cn(tradeSptTallCardSwapClass, className)}>
      {tradingEnabled !== true ? (
        <p className="rounded-lg bg-muted/35 px-3 py-2.5 text-center text-xs text-[var(--muted-foreground)] dark:bg-muted/25">
          Trading isn’t enabled for this token in your network configuration.
        </p>
      ) : null}
      <SlidingSegmentTabs
        value={tradeMode}
        onValueChange={(v) => {
          setTradeMode(v as 'buy' | 'sell');
          setDraft('');
        }}
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
        <dl className="space-y-2 rounded-xl border border-trade-shell bg-background/30 p-3 text-xs">
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Trading fee ({Number(tradingFeeBps) / 100}%)</dt><dd className="tabular-nums">{baseUnitsToDisplay(estimatedTradingFee, 9)} MySo</dd></div>
          <div className="flex justify-between gap-3 border-t border-trade-shell pt-2"><dt>{tradeMode === 'buy' ? 'Payment (fee included)' : 'Estimated net proceeds'}</dt><dd className="font-semibold tabular-nums">{baseUnitsToDisplay(tradeMode === 'buy' ? buyQuote.cost : sellNet, 9)} MySo</dd></div>
        </dl>
        <p className="text-xs leading-relaxed text-muted-foreground">Network gas is additional. Quotes follow the pool’s bonding curve. {tradeMode === 'buy' ? 'Your payment is capped at the amount shown.' : 'The final sale price can change before execution.'}</p>
        {creatorFeesUseVault ? (
          <p className="rounded-xl border border-primary/25 bg-primary/10 px-3 py-2 text-xs leading-relaxed text-foreground" role="note">
            Creator fees are routed automatically to the post’s beneficiary vaults in the same transaction.
            {hasIndexedVaultSettlements ? ' Settlement history is indexed.' : ''}
          </p>
        ) : null}
        {draft && !tradeAmountValid ? <p role="status" className="text-xs text-destructive">Enter an amount within your balance, the pool liquidity, and the token’s holding limit (up to 9 decimals).</p> : null}
        <Button
          type="button"
          disabled={swapDisabled || !tradeAmountValid || !isAuthenticated}
          onClick={() => {
            if (!isAuthenticated) {
              toast.error('Sign in to continue.');
              return;
            }
            if (!tradeAmountValid) return;
            const action = tradeMode === 'buy'
              ? onBuy(buyQuote.tokenAmount, inputBaseUnits)
              : onSell(inputBaseUnits);
            void action.then((success) => { if (success) setDraft(''); });
          }}
          className="h-12 w-full shrink-0 rounded-2xl font-semibold opacity-80"
        >
          {isBusy ? (
            <><Loader2 className="mr-2 size-4 animate-spin" />Submitting…</>
          ) : tradingEnabled === false ? (
            'Trading unavailable'
          ) : !isAuthenticated ? (
            'Sign in to continue'
          ) : tradeAmountValid ? (
            tradeMode === 'buy' ? `Buy ${sellSym}` : `Sell ${sellSym}`
          ) : (
            'Enter a valid amount'
          )}
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
  const data = useMemo(() => {
    const hours: Record<Timeframe, number> = { '1H': 1, '1D': 24, '1W': 168, '1M': 720, '1Y': 8760, ALL: Infinity };
    const cutoff = Date.now() - hours[timeframe] * 3_600_000;
    return chartRowsWithLabels(chartSeries.filter((point) => point.t >= cutoff));
  }, [chartSeries, timeframe]);

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
          No price history in this timeframe.
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
  maxIndividualReservationBaseUnits?: bigint;
  usdPerMysoReservationQuote?: number | null;
  /** Connected wallet MySo balance when portfolio overview is loaded. */
  walletMysoAvailable?: number | null;
  /** GraphQL `socialProofToken.isActive`: `true` = trading layout, else reservation layout (when no pool). */
  sptIsActive?: boolean | null;
  /** `sptConfiguration` reservation fee bps for breakdown estimates (platform + treasury shown as platform ecosystem). */
  reservationPlatformFeeBps?: number | null;
  reservationTreasuryFeeBps?: number | null;
  reservationCreatorFeeBps?: number | null;
  tokenTypeCode?: number | null;
  ownerAddress?: string | null;
  subjectObjectId?: string | null;
  livePoolId?: string | null;
  creatorFeesUseVault?: boolean;
  hasIndexedVaultSettlements?: boolean;
  totalReservedBaseUnits?: bigint;
  requiredThresholdBaseUnits?: bigint;
  currentSupplyBaseUnits?: bigint;
  basePriceBaseUnits?: bigint;
  quadraticCoefficient?: bigint;
  tradingFeeBps?: bigint;
  maxHoldPercentBps?: bigint;
  reservationBalances?: Array<{ reserver: string; amount: bigint }>;
  onDataChanged?: () => void;
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
  maxIndividualReservationBaseUnits = BigInt(0),
  usdPerMysoReservationQuote: usdPerMysoReservationQuoteProp,
  walletMysoAvailable: walletMysoAvailableProp,
  sptIsActive: sptIsActiveProp,
  reservationPlatformFeeBps: reservationPlatformFeeBpsProp,
  reservationTreasuryFeeBps: reservationTreasuryFeeBpsProp,
  reservationCreatorFeeBps: reservationCreatorFeeBpsProp,
  tokenTypeCode: tokenTypeCodeProp,
  ownerAddress: ownerAddressProp,
  subjectObjectId: subjectObjectIdProp,
  livePoolId: livePoolIdProp,
  creatorFeesUseVault = false,
  hasIndexedVaultSettlements = false,
  totalReservedBaseUnits: totalReservedBaseUnitsProp,
  requiredThresholdBaseUnits: requiredThresholdBaseUnitsProp,
  currentSupplyBaseUnits: currentSupplyBaseUnitsProp,
  basePriceBaseUnits: basePriceBaseUnitsProp,
  quadraticCoefficient: quadraticCoefficientProp,
  tradingFeeBps: tradingFeeBpsProp,
  maxHoldPercentBps: maxHoldPercentBpsProp,
  reservationBalances: reservationBalancesProp,
  onDataChanged,
}: TradeSocialProofTokenWorkspaceProps = {}) {
  const [timeframe, setTimeframe] = useState<Timeframe>('1D');
  const [bottomTab, setBottomTab] = useState('transactions');
  const [transactionBusy, setTransactionBusy] = useState(false);
  const transactionLock = useRef(false);
  const mounted = useRef(true);
  const refreshTimers = useRef<number[]>([]);
  const walletRequest = useRef(0);
  const [walletError, setWalletError] = useState<string | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; walletRequest.current += 1; refreshTimers.current.forEach(window.clearTimeout); };
  }, []);
  const [walletMysoBaseUnits, setWalletMysoBaseUnits] = useState(BigInt(0));
  const [ownedTokenBaseUnits, setOwnedTokenBaseUnits] = useState(BigInt(0));
  const { keypair, displayAddress, isAuthenticated } = useMySocialAuth();
  const { currentNetwork } = useNetwork();

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
  const tokenType: SptTokenType = tokenTypeCodeProp === SPT_TOKEN_TYPE_POST
    ? SPT_TOKEN_TYPE_POST
    : SPT_TOKEN_TYPE_PROFILE;
  const ownerAddress = ownerAddressProp?.trim() || profileRibbon?.profileAddress?.trim() || null;
  const subjectObjectId = subjectObjectIdProp?.trim() || null;
  const livePoolId = livePoolIdProp?.trim() || null;
  const totalReservedBaseUnits = totalReservedBaseUnitsProp ?? BigInt(0);
  const requiredThresholdBaseUnits = requiredThresholdBaseUnitsProp ?? BigInt(0);
  const currentSupplyBaseUnits = currentSupplyBaseUnitsProp ?? BigInt(0);
  const basePriceBaseUnits = basePriceBaseUnitsProp ?? BigInt(0);
  const quadraticCoefficient = quadraticCoefficientProp ?? BigInt(0);
  const tradingFeeBps = tradingFeeBpsProp ?? BigInt(0);
  const maxHoldPercentBps = maxHoldPercentBpsProp ?? BigInt(0);
  const viewerReservationBaseUnits = (reservationBalancesProp ?? []).find((row) =>
    mysoAddressesEqual(row.reserver, displayAddress)
  )?.amount ?? BigInt(0);
  const isOwner = mysoAddressesEqual(ownerAddress, displayAddress);
  const canLaunch =
    isOwner &&
    !livePoolId &&
    Boolean(reservationPoolId || reservationPoolAddress) &&
    requiredThresholdBaseUnits > BigInt(0) &&
    totalReservedBaseUnits >= requiredThresholdBaseUnits;

  const refreshWalletState = useCallback(async () => {
    const request = ++walletRequest.current;
    const viewer = displayAddress?.trim();
    if (!viewer) {
      setWalletMysoBaseUnits(BigInt(0));
      setOwnedTokenBaseUnits(BigInt(0));
      return;
    }
    try {
      const client = getMySoJsonRpcClient(currentNetwork);
      const [balance, owned] = await Promise.all([
        client.getBalance({ owner: viewer, coinType: MYSO_GAS_COIN_TYPE }),
        livePoolId
          ? findOwnedSocialToken({ network: currentNetwork, owner: viewer, poolId: livePoolId })
          : Promise.resolve(null),
      ]);
      if (!mounted.current || request !== walletRequest.current) return;
      setWalletError(null);
      setWalletMysoBaseUnits(BigInt(balance.totalBalance));
      setOwnedTokenBaseUnits(owned?.amount ?? BigInt(0));
    } catch {
      if (!mounted.current || request !== walletRequest.current) return;
      setWalletMysoBaseUnits(BigInt(0));
      setOwnedTokenBaseUnits(BigInt(0));
      setWalletError('Could not refresh wallet balances. Try again before trading.');
    }
  }, [currentNetwork, displayAddress, livePoolId]);

  useEffect(() => {
    void refreshWalletState();
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void refreshWalletState(); }, 20_000);
    return () => { walletRequest.current += 1; window.clearInterval(interval); };
  }, [refreshWalletState]);

  const afterTransaction = useCallback(async (message: string, description?: string) => {
    toast.success(message, { description, duration: 5_500 });
    if (!mounted.current) return;
    onDataChanged?.();
    await refreshWalletState();
    if (!mounted.current) return;
    refreshTimers.current.forEach(window.clearTimeout);
    refreshTimers.current = [2_500, 8_000].map((delay) => window.setTimeout(() => onDataChanged?.(), delay));
  }, [onDataChanged, refreshWalletState]);

  const requireSigner = () => {
    const sender = displayAddress?.trim();
    if (!sender || !keypair || !mysoAddressesEqual(sender, keypair.toMySoAddress())) {
      toast.error('Sign in with a wallet that can sign transactions.');
      return null;
    }
    return { sender, signer: keypair };
  };

  const handleReserve = async (displayAmount: string) => {
    const auth = requireSigner();
    const poolId = reservationPoolId || reservationPoolAddress;
    const principalAmount = parseDisplayAmountToBaseUnits(displayAmount);
    if (!auth || !poolId || !principalAmount || principalAmount <= BigInt(0) || transactionLock.current) return false;
    transactionLock.current = true;
    setTransactionBusy(true);
    try {
      const rules = await readSptRules(currentNetwork);
      const postContext = tokenType === SPT_TOKEN_TYPE_POST && subjectObjectId
        ? await resolvePostTransactionContext({
            network: currentNetwork,
            postId: subjectObjectId,
            reservationAmount: principalAmount,
          })
        : undefined;
      await executeReserveSpt({
        network: currentNetwork,
        ...auth,
        tokenType,
        reservationPoolId: poolId,
        principalAmount,
        feeAmount: feeFromBps(principalAmount, rules.reservationFeeBps),
        postContext,
      });
      await afterTransaction(
        `Reserved ${baseUnitsToDisplay(principalAmount, 9)} MySo`,
        'Reservation confirmed on-chain.'
      );
      return true;
    } catch (error) {
      toast.error(friendlySptTransactionError(error));
      return false;
    } finally {
      transactionLock.current = false;
      if (mounted.current) setTransactionBusy(false);
    }
  };

  const handleWithdraw = async (displayAmount: string) => {
    const auth = requireSigner();
    const poolId = reservationPoolId || reservationPoolAddress;
    const amount = parseDisplayAmountToBaseUnits(displayAmount);
    if (!auth || !poolId || !amount || amount <= BigInt(0) || transactionLock.current) return false;
    transactionLock.current = true;
    setTransactionBusy(true);
    try {
      const postContext = tokenType === SPT_TOKEN_TYPE_POST && subjectObjectId
        ? await resolvePostTransactionContext({
            network: currentNetwork,
            postId: subjectObjectId,
            reservationAmount: amount,
          })
        : undefined;
      await executeWithdrawSptReservation({
        network: currentNetwork,
        ...auth,
        tokenType,
        reservationPoolId: poolId,
        amount,
        postContext,
      });
      await afterTransaction(
        `Withdrew ${baseUnitsToDisplay(amount, 9)} MySo`,
        'Withdrawal confirmed on-chain.'
      );
      return true;
    } catch (error) {
      toast.error(friendlySptTransactionError(error));
      return false;
    } finally {
      transactionLock.current = false;
      if (mounted.current) setTransactionBusy(false);
    }
  };

  const handleBuy = async (tokenAmount: bigint, paymentAmount: bigint) => {
    const auth = requireSigner();
    if (!auth || !livePoolId || transactionLock.current) return false;
    transactionLock.current = true;
    setTransactionBusy(true);
    try {
      await executeBuySpt({
        network: currentNetwork,
        ...auth,
        poolId: livePoolId,
        tokenAmount,
        paymentAmount,
      });
      await afterTransaction(
        `Bought ${baseUnitsToDisplay(tokenAmount, 9)} SPT`,
        'Purchase confirmed on-chain.'
      );
      return true;
    } catch (error) {
      toast.error(friendlySptTransactionError(error));
      return false;
    } finally {
      transactionLock.current = false;
      if (mounted.current) setTransactionBusy(false);
    }
  };

  const handleSell = async (tokenAmount: bigint) => {
    const auth = requireSigner();
    if (!auth || !livePoolId || transactionLock.current) return false;
    transactionLock.current = true;
    setTransactionBusy(true);
    try {
      await executeSellSpt({
        network: currentNetwork,
        ...auth,
        poolId: livePoolId,
        tokenAmount,
      });
      await afterTransaction(
        `Sold ${baseUnitsToDisplay(tokenAmount, 9)} SPT`,
        'Sale confirmed on-chain.'
      );
      return true;
    } catch (error) {
      toast.error(friendlySptTransactionError(error));
      return false;
    } finally {
      transactionLock.current = false;
      if (mounted.current) setTransactionBusy(false);
    }
  };

  const handleOwnerAction = async (action: 'enable' | 'launch') => {
    const auth = requireSigner();
    if (!auth || !isOwner || transactionLock.current) return false;
    transactionLock.current = true;
    setTransactionBusy(true);
    try {
      if (action === 'enable') {
        if (!subjectObjectId) throw new Error('GraphQL did not return the subject object id.');
        await executeEnableSpt({
          network: currentNetwork,
          ...auth,
          tokenType,
          subjectObjectId,
        });
        await afterTransaction('Social Proof Token reservations enabled');
      } else {
        const poolId = reservationPoolId || reservationPoolAddress;
        if (!poolId) throw new Error('GraphQL did not return the reservation pool id.');
        await executeLaunchSpt({ network: currentNetwork, ...auth, reservationPoolId: poolId });
        await afterTransaction('Social Proof Token launched');
      }
      return true;
    } catch (error) {
      toast.error(friendlySptTransactionError(error));
      return false;
    } finally {
      transactionLock.current = false;
      if (mounted.current) setTransactionBusy(false);
    }
  };

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
    hasQuotePrice && priceLabel ? priceLabel.trim() : '—';
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
          {isOwner && !hasLiveTradingPool && ((!reservationPoolId && !reservationPoolAddress) || canLaunch) ? (
            <div className="border-x border-trade-shell bg-muted/20 px-4 py-3">
              <p className="text-xs font-medium text-foreground">
                {canLaunch ? 'Reservation threshold reached' : 'Creator controls'}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                {canLaunch
                  ? 'Launch the pool to open curve-based buying and selling.'
                  : `Enable reservations for this ${tokenType === SPT_TOKEN_TYPE_POST ? 'post' : 'profile'}.`}
              </p>
              <Button
                type="button"
                size="sm"
                className="mt-3 w-full rounded-xl"
                disabled={transactionBusy || (!canLaunch && !subjectObjectId)}
                onClick={() => void handleOwnerAction(canLaunch ? 'launch' : 'enable')}
              >
                {transactionBusy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                {canLaunch ? 'Launch token' : 'Enable token'}
              </Button>
            </div>
          ) : null}
          {walletError ? <div role="status" className="border-x border-trade-shell px-4 py-3 text-xs text-destructive">{walletError} <button type="button" className="underline" onClick={() => void refreshWalletState()}>Retry</button></div> : null}
          {sidePanelMode === 'simple' ? <p className="border-x border-trade-shell px-4 py-3 text-xs tabular-nums text-muted-foreground">{baseUnitsToDisplay(totalReservedBaseUnits, 9)} / {baseUnitsToDisplay(requiredThresholdBaseUnits, 9)} MySo reserved toward launch</p> : null}
          {sidePanelMode === 'none' ? (
            <div className={cn(tradeSptEmptyAsideClass, 'rounded-t-none border-t-0')}>
              <p className="text-sm font-medium text-foreground">No reservation or trading</p>
              <p className="mt-2 text-xs leading-relaxed text-[var(--muted-foreground)]">
                This token does not have an open reservation pool or live trading pool yet, so swap
                and reserve actions are unavailable.
              </p>
            </div>
          ) : sidePanelMode === 'simple' ? (
            <SptReservationCard
              walletAvailable={walletMysoBaseUnits > BigInt(50_000_000) ? walletMysoBaseUnits - BigInt(50_000_000) : BigInt(0)}
              reservationAvailable={viewerReservationBaseUnits}
              reservationLimit={maxIndividualReservationBaseUnits}
              feeBps={BigInt((reservationPlatformFeeBps ?? 0) + (reservationTreasuryFeeBps ?? 0) + (reservationCreatorFeeBps ?? 0))}
              isAuthenticated={isAuthenticated}
              isBusy={transactionBusy}
              onReserve={handleReserve}
              onWithdraw={handleWithdraw}
              className="rounded-t-none border-t-0"
            />
          ) : (
            <SocialProofSwapCard
              sellSymbol={displaySymbol === '—' ? 'Token' : displaySymbol}
              tradingEnabled={tradingEnabled}
              walletMysoBaseUnits={walletMysoBaseUnits > BigInt(50_000_000) ? walletMysoBaseUnits - BigInt(50_000_000) : BigInt(0)}
              ownedTokenBaseUnits={ownedTokenBaseUnits}
              currentSupplyBaseUnits={currentSupplyBaseUnits}
              basePriceBaseUnits={basePriceBaseUnits}
              quadraticCoefficient={quadraticCoefficient}
              tradingFeeBps={tradingFeeBps}
              maxHoldPercentBps={maxHoldPercentBps}
              isAuthenticated={isAuthenticated}
              isBusy={transactionBusy}
              creatorFeesUseVault={creatorFeesUseVault}
              hasIndexedVaultSettlements={hasIndexedVaultSettlements}
              onBuy={handleBuy}
              onSell={handleSell}
              className="rounded-t-none border-t-0"
            />
          )}
        </aside>
      </div>
    </div>
  );
}
