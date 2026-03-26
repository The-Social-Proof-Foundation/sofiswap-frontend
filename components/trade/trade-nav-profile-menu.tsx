'use client';

import {
  Check,
  ChevronRight,
  Coins,
  Copy,
  LogOut,
  Settings,
  User,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ProfilePortfolioOverviewProfile } from '@/lib/graphql/profile-portfolio-overview';
import { cn } from '@/lib/utils';

const MYSOCIAL_ORIGIN = 'https://www.mysocial.network';

const profileMenuChevronClass =
  'h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity duration-150 group-data-[highlighted]:opacity-100';

const profileMenuRowLinkClass =
  'group flex w-full cursor-pointer items-center rounded-md px-2.5 py-2 text-sm outline-none transition-colors text-foreground data-[highlighted]:bg-muted/70';

export function parseReservationPercent(raw: string | null | undefined): number {
  if (raw == null || raw === '') return 0;
  const n = Number.parseFloat(String(raw));
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

function resolveProfilePhotoUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const t = url.trim();
  if (!t) return null;
  if (t.startsWith('https://') || t.startsWith('http://')) return t;
  if (t.startsWith('//')) return `https:${t}`;
  return t;
}

function formatWalletAddressForDisplay(address: string, head = 10, tail = 10): string {
  const t = address.trim();
  if (t.length <= head + tail + 3) return t;
  return `${t.slice(0, head)}…${t.slice(-tail)}`;
}

/** 0–9,999 with grouping; ≥10,000 as compact k/M with up to one decimal when needed. */
export function formatSocialCount(value: number | null | undefined): string {
  const n = Math.max(0, Math.trunc(Number(value) || 0));
  if (n <= 9_999) {
    return n.toLocaleString('en-US');
  }
  if (n < 1_000_000) {
    const k = n / 1000;
    let r = Math.round(k * 10) / 10;
    if (r >= 1000) {
      const m = n / 1_000_000;
      r = Math.round(m * 10) / 10;
      const strM = Number.isInteger(r) ? String(r) : r.toFixed(1).replace(/\.0$/, '');
      return `${strM}M`;
    }
    const str = Number.isInteger(r) ? String(r) : r.toFixed(1).replace(/\.0$/, '');
    return `${str}k`;
  }
  const m = n / 1_000_000;
  const r = Math.round(m * 10) / 10;
  const str = Number.isInteger(r) ? String(r) : r.toFixed(1).replace(/\.0$/, '');
  return `${str}M`;
}

function ProfileMenuWalletCopyRow({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(() => {
    const t = address.trim();
    if (!t) return;
    void navigator.clipboard.writeText(t).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  }, [address]);

  return (
    <div
      className={cn(
        'group/wallet -mx-0.5 flex w-full min-w-0 items-center gap-0 rounded-md py-0 pl-0 pr-0.5',
        'transition-colors duration-150',
        'hover:bg-muted/50 dark:hover:bg-muted/25'
      )}
    >
      <button
        type="button"
        onPointerDown={(e) => e.preventDefault()}
        onClick={onCopy}
        className={cn(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
          'text-[var(--muted-foreground)] transition-colors hover:text-[var(--primary)]',
          'group-hover/wallet:text-[var(--muted-foreground)] dark:group-hover/wallet:text-[var(--muted-foreground)]',
          'disabled:cursor-not-allowed disabled:opacity-50'
        )}
        aria-label={copied ? 'Copied' : 'Copy wallet address'}
      >
        {copied ? (
          <Check className="h-3 w-3 shrink-0 text-green-500" aria-hidden />
        ) : (
          <Copy className="h-3 w-3 shrink-0" aria-hidden />
        )}
      </button>
      <span
        className={cn(
          'min-w-0 flex-1 truncate font-mono text-[11px] leading-snug tracking-tight text-[var(--muted-foreground)]',
          'transition-colors duration-150 dark:text-[var(--muted-foreground)]',
          'group-hover/wallet:text-[var(--muted-foreground)] group-hover/wallet:dark:text-[var(--muted-foreground)]'
        )}
      >
        {formatWalletAddressForDisplay(address)}
      </span>
    </div>
  );
}

function profileInitial(profile: ProfilePortfolioOverviewProfile | null | undefined): string {
  const name = profile?.displayName?.trim() || profile?.username?.trim() || '';
  if (name.length) return name.slice(0, 1).toUpperCase();
  return '?';
}

function mysocialProfileHref(profile: ProfilePortfolioOverviewProfile | null): string {
  const u = profile?.username?.replace(/^@/, '').trim();
  if (u) return `${MYSOCIAL_ORIGIN}/@${u}`;
  return `${MYSOCIAL_ORIGIN}/ecosystem/sofiswap`;
}

function mysocialEditProfileHref(profile: ProfilePortfolioOverviewProfile | null): string {
  const u = profile?.username?.replace(/^@/, '').trim();
  if (u) return `${MYSOCIAL_ORIGIN}/@${u}/edit`;
  return `${MYSOCIAL_ORIGIN}/settings/profile`;
}

/** Matches how sofi logo is shown in {@link TradeTopNav} (`h-8 w-8`). */
export const TRADE_NAV_LOGO_PX = 32;

/**
 * Whether to draw the reservation ring and shrink the photo inside it.
 * No SPT, no reservation pools/holdings, and 0% → logo-sized avatar only (no ring).
 */
function parseReservedAmount(
  value: string | number | null | undefined
): number {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const t = String(value).trim();
  if (t === '') return 0;
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

function hasLaunchedSocialProofToken(profile: ProfilePortfolioOverviewProfile): boolean {
  if (profile.socialProofTokenAddress?.trim()) return true;
  return Boolean(profile.socialProofToken?.tokenAddress?.trim());
}

function hasReservationPoolIdentity(profile: ProfilePortfolioOverviewProfile): boolean {
  if (profile.socialProofToken?.reservationPoolId?.trim()) return true;
  return Boolean(profile.reservationPoolAddress?.trim());
}

function reservationThresholdMet(
  profile: ProfilePortfolioOverviewProfile,
  spt: NonNullable<ProfilePortfolioOverviewProfile['socialProofToken']>
): boolean {
  if (profile.reservationHoldings.some((h) => h.thresholdMet === true)) return true;
  const req = parseReservedAmount(spt.requiredThreshold);
  const total = parseReservedAmount(spt.totalReserved);
  if (req > 0) return total >= req;
  // No positive threshold configured — caller still requires 100% reservation.
  return true;
}

/**
 * Primary CTA for creators without a live token.
 * `launch` takes precedence when the pool is full and the threshold is satisfied.
 */
export function getProfileTokenMenuAction(
  profile: ProfilePortfolioOverviewProfile | null | undefined
): 'launch' | 'enable' | null {
  if (!profile) return null;
  if (hasLaunchedSocialProofToken(profile)) return null;

  const spt = profile.socialProofToken;

  if (hasReservationPoolIdentity(profile) && spt) {
    const pct = parseReservationPercent(
      spt.reservationPercentage != null ? String(spt.reservationPercentage) : null
    );
    if (pct >= 100 && reservationThresholdMet(profile, spt)) {
      return 'launch';
    }
    return null;
  }

  if (!hasReservationPoolIdentity(profile)) {
    return 'enable';
  }

  return null;
}

export function getReservationRingState(
  profile: ProfilePortfolioOverviewProfile | null | undefined
): { showRing: boolean; percent: number } {
  const spt = profile?.socialProofToken ?? null;
  const pct = parseReservationPercent(
    spt?.reservationPercentage != null ? String(spt.reservationPercentage) : null
  );

  if (!spt) {
    return { showRing: false, percent: 0 };
  }

  const reservedNum = parseReservedAmount(spt.totalReserved);
  const hasReservedAmount = reservedNum > 0;
  const hasReservationHoldings = (profile?.reservationHoldings?.length ?? 0) > 0;

  const hasReservationActivity =
    pct > 0 || hasReservedAmount || hasReservationHoldings;

  if (!hasReservationActivity) {
    return { showRing: false, percent: 0 };
  }

  return { showRing: true, percent: pct };
}

function ProfileAvatarPlain({
  photoUrl,
  label,
  sizePx,
  className,
}: {
  photoUrl: string | null;
  label: string;
  sizePx: number;
  className?: string;
}) {
  return (
    <div
      className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted', className)}
      style={{ width: sizePx, height: sizePx }}
    >
      {photoUrl ? (
        <Image
          src={photoUrl}
          alt=""
          width={sizePx}
          height={sizePx}
          className="h-full w-full object-cover"
          unoptimized
        />
      ) : (
        <span
          className={cn(
            'font-semibold text-muted-foreground',
            sizePx >= 44 ? 'text-lg' : 'text-sm'
          )}
        >
          {label}
        </span>
      )}
    </div>
  );
}

export function ProfileAvatarWithReservationRing({
  photoUrl,
  label,
  profile,
  variant,
  className,
}: {
  photoUrl: string | null;
  label: string;
  profile: ProfilePortfolioOverviewProfile | null | undefined;
  variant: 'trigger' | 'menu';
  className?: string;
}) {
  const { showRing, percent } = getReservationRingState(profile);

  const logoPx = TRADE_NAV_LOGO_PX;
  const plainMenuPx = 40;

  if (!showRing) {
    const px = variant === 'trigger' ? logoPx : plainMenuPx;
    return <ProfileAvatarPlain photoUrl={photoUrl} label={label} sizePx={px} className={className} />;
  }

  /**
   * Ring path uses `ringPad`; avatar is inset MORE (`avatarInset`) so the photo sits inside the ring’s
   * inner edge with visible gutter (same `pad` on ring + photo hid the stroke under the image).
   */
  const outer = variant === 'trigger' ? 52 : 64;
  const stroke = percent >= 100 ? 2 : 1.65;
  const ringPad = 4.5;
  /** Clear space between ring (inside edge) and profile disc */
  const ringToAvatarGap = 4;
  const avatarInset = ringPad + stroke / 2 + ringToAvatarGap;
  const vb = outer;
  const c = vb / 2;
  const r = c - ringPad;
  const cLen = 2 * Math.PI * r;
  const dash = (percent / 100) * cLen;

  return (
    <div
      className={cn(
        'relative shrink-0 rounded-full bg-muted/50 dark:bg-muted/30',
        className
      )}
      style={{ width: outer, height: outer }}
    >
      <svg
        className="absolute inset-0 rotate-90"
        width={outer}
        height={outer}
        viewBox={`0 0 ${vb} ${vb}`}
        aria-hidden
      >
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          className="stroke-muted-foreground/35"
          strokeWidth={stroke}
        />
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          className="transition-[stroke-dasharray,stroke-width] duration-300 ease-out [stroke:var(--ring)]"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${cLen}`}
        />
      </svg>
      <div
        className="absolute flex items-center justify-center overflow-hidden rounded-full bg-muted"
        style={{
          top: avatarInset,
          left: avatarInset,
          right: avatarInset,
          bottom: avatarInset,
        }}
      >
        {photoUrl ? (
          <Image
            src={photoUrl}
            alt=""
            width={48}
            height={48}
            className="h-full w-full object-cover"
            unoptimized
          />
        ) : (
          <span
            className={cn(
              'font-semibold text-muted-foreground',
              outer >= 48 ? 'text-lg' : 'text-sm'
            )}
          >
            {label}
          </span>
        )}
      </div>
    </div>
  );
}

export function TradeNavProfileMenu({
  walletAddress,
  profile,
  signOut,
}: {
  walletAddress: string;
  profile: ProfilePortfolioOverviewProfile | null | undefined;
  signOut: () => void;
}) {
  const photo = resolveProfilePhotoUrl(profile?.profilePhoto ?? null);
  const displayName = profile?.displayName?.trim() || 'MySocial profile';
  const username = profile?.username?.trim();
  const profileHref = mysocialProfileHref(profile ?? null);
  const editHref = mysocialEditProfileHref(profile ?? null);

  const ringLabel = profileInitial(profile ?? null);
  const followers = profile?.followersCount ?? 0;
  const following = profile?.followingCount ?? 0;
  const tokenMenuAction = getProfileTokenMenuAction(profile);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-auto rounded-full p-0 hover:bg-transparent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label="Open profile menu"
        >
          <ProfileAvatarWithReservationRing
            photoUrl={photo}
            label={ringLabel}
            profile={profile}
            variant="trigger"
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-[min(calc(100vw-2rem),19rem)] rounded-xl border-border/60 bg-popover p-0 shadow-lg"
      >
        <div className="space-y-0 border-b border-border/60">
          <div className="flex items-start gap-1 px-3 pb-2 pt-2">
            <Link
              href={profileHref}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'shrink-0 rounded-md outline-none ring-offset-background transition-opacity hover:opacity-90',
                'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover'
              )}
              aria-label="View profile on MySocial"
            >
              <ProfileAvatarWithReservationRing
                photoUrl={photo}
                label={ringLabel}
                profile={profile}
                variant="menu"
              />
            </Link>
            <div className="flex min-w-0 flex-1 flex-col gap-0">
              <Link
                href={profileHref}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'group/profile-head block rounded-md px-1.5 pb-1 pt-1.5 -mx-0.5 -mt-0.5 outline-none transition-colors',
                  'dark:hover:bg-accent/35 dark:hover:text-primary',
                  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-base font-semibold leading-tight text-primary">
                    {displayName}
                  </span>
                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-[var(--muted-foreground)] transition-colors group-hover/profile-head:text-[var(--primary)]"
                    aria-hidden
                  />
                </div>
                {username ? (
                  <span
                    className={cn(
                      'mt-0.5 block truncate text-sm text-muted-foreground transition-colors',
                      'group-hover/profile-head:text-[var(--muted-foreground)] dark:group-hover/profile-head:text-[var(--muted-foreground)]'
                    )}
                  >
                    @{username.replace(/^@/, '')}
                  </span>
                ) : null}
              </Link>
              <div className="-mt-px pl-0.5">
                <ProfileMenuWalletCopyRow address={walletAddress} />
              </div>
            </div>
          </div>
          <div className="w-full px-3 pb-3 text-center">
            <p className="text-sm leading-snug">
              <span className="font-bold tabular-nums">{formatSocialCount(followers)}</span>
              <span className="font-normal text-[var(--muted-foreground)]"> followers</span>
              <span className="text-[var(--muted-foreground)] px-2"> </span>
              <span className="font-bold tabular-nums">{formatSocialCount(following)}</span>
              <span className="font-normal text-[var(--muted-foreground)]"> following</span>
            </p>
          </div>
        </div>

        <div className="space-y-0.5 px-1 py-1">
          <DropdownMenuItem asChild>
            <Link
              href={profileHref}
              target="_blank"
              rel="noopener noreferrer"
              className={profileMenuRowLinkClass}
            >
              <User className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate">Open in Explorer</span>
              <ChevronRight className={profileMenuChevronClass} aria-hidden />
            </Link>
          </DropdownMenuItem>
          {tokenMenuAction ? (
            <DropdownMenuItem asChild>
              <Link
                href={editHref}
                target="_blank"
                rel="noopener noreferrer"
                className={profileMenuRowLinkClass}
              >
                <Coins className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate">
                  {tokenMenuAction === 'launch' ? 'Launch token' : 'Enable token'}
                </span>
                <ChevronRight className={profileMenuChevronClass} aria-hidden />
              </Link>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem asChild>
            <Link
              href={editHref}
              target="_blank"
              rel="noopener noreferrer"
              className={profileMenuRowLinkClass}
            >
              <Settings className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate">Settings</span>
              <ChevronRight className={profileMenuChevronClass} aria-hidden />
            </Link>
          </DropdownMenuItem>
        </div>

        <DropdownMenuSeparator className="my-0 bg-border/60" />

        <div className="px-1 pb-1 pt-0">
          <DropdownMenuItem
            className={cn(
              'group flex cursor-pointer items-center rounded-md px-2.5 py-2 text-sm outline-none transition-colors',
              'bg-[var(--profile-menu-signout-bg)] text-[var(--profile-menu-signout)]',
              'data-[highlighted]:bg-[var(--profile-menu-signout-bg-hover)] data-[highlighted]:text-[var(--profile-menu-signout)]'
            )}
            onSelect={() => signOut()}
          >
            <LogOut className="mr-2 h-4 w-4 shrink-0 text-[var(--profile-menu-signout)]" aria-hidden />
            <span className="min-w-0 flex-1 truncate font-medium">Sign out</span>
            <ChevronRight
              className={cn(profileMenuChevronClass, 'text-[var(--profile-menu-signout)]')}
              aria-hidden
            />
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
