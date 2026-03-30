'use client';

import {
  Check,
  ChevronRight,
  Coins,
  Copy,
  Droplets,
  Globe,
  LogOut,
  Moon,
  Palette,
  Settings,
  Sun,
  User,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { useCallback, useEffect, useState, type PointerEvent } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ProfilePortfolioOverviewProfile } from '@/lib/graphql/profile-portfolio-overview';
import { buildMysocialWalletExplorerHref } from '@/lib/mysocial-wallet-explorer';
import { useNetwork } from '@/lib/network-provider';
import { NETWORK_LABELS, type NetworkType } from '@/lib/network-utils';
import { cn } from '@/lib/utils';

const MYSOCIAL_ORIGIN = 'https://www.mysocial.network';
/** Deep link for pool creation on MySocial; adjust if the product path changes. */
const MYSOCIAL_CREATE_POOL_HREF = `${MYSOCIAL_ORIGIN}/ecosystem/sofiswap/create-pool`;

const profileMenuChevronClass =
  'h-4 w-4 shrink-0 text-[var(--muted-foreground)] opacity-0 transition-opacity duration-150 group-data-[highlighted]:opacity-100';

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

export function formatWalletAddressForDisplay(address: string, head = 10, tail = 10): string {
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

export function ProfileMenuWalletCopyRow({
  address,
  addressHead = 10,
  addressTail = 10,
}: {
  address: string;
  addressHead?: number;
  addressTail?: number;
}) {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(() => {
    const t = address.trim();
    if (!t) return;
    void navigator.clipboard.writeText(t).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      toast.success('Address copied to clipboard', {
        description: formatWalletAddressForDisplay(t, addressHead, addressTail),
      });
    });
  }, [address, addressHead, addressTail]);

  const stopDropdownPointer = useCallback((e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
  }, []);

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
        onPointerDown={stopDropdownPointer}
        onClick={onCopy}
        className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-sm transition-colors',
          copied
            ? 'text-green-500'
            : 'text-[var(--muted-foreground)] hover:text-secondary-foreground group-hover/wallet:text-secondary-foreground',
          'disabled:cursor-not-allowed disabled:opacity-50'
        )}
        aria-label={copied ? 'Copied' : 'Copy wallet address'}
      >
        {copied ? (
          <Check className="h-2.5 w-2.5 shrink-0" aria-hidden />
        ) : (
          <Copy className="h-2.5 w-2.5 shrink-0" aria-hidden />
        )}
      </button>
      <button
        type="button"
        onPointerDown={stopDropdownPointer}
        onClick={onCopy}
        title="Copy wallet address"
        className={cn(
          'min-w-0 flex-1 cursor-pointer truncate rounded-sm px-0.5 py-0.5 text-left font-mono text-xs leading-none tracking-tight outline-none',
          'text-[var(--muted-foreground)] transition-colors',
          'hover:text-secondary-foreground group-hover/wallet:text-secondary-foreground',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover'
        )}
      >
        {formatWalletAddressForDisplay(address, addressHead, addressTail)}
      </button>
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
            'font-semibold text-[var(--muted-foreground)]',
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
              'font-semibold text-[var(--muted-foreground)]',
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

const PROFILE_SUBMENU_SURFACE =
  'rounded-xl border border-trade-shell bg-popover/90 shadow-lg backdrop-blur-xl supports-[backdrop-filter]:bg-popover/78';

function ProfileMenuThemeToggle({ className }: { className?: string }) {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  if (!mounted) {
    return (
      <div
        className={cn('h-7 w-7 shrink-0 rounded-md border border-border bg-muted/40', className)}
        aria-hidden
      />
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className={cn(
        'h-7 w-7 shrink-0 border-border bg-background hover:bg-accent hover:text-accent-foreground',
        className
      )}
      onClick={(e) => {
        e.stopPropagation();
        toggleTheme();
      }}
      aria-label="Toggle color theme"
    >
      {theme === 'light' ? (
        <Moon className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <Sun className="h-3.5 w-3.5" aria-hidden />
      )}
    </Button>
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
  const { currentNetwork, changeNetwork, isChangingNetwork } = useNetwork();
  const photo = resolveProfilePhotoUrl(profile?.profilePhoto ?? null);
  const hasProfile = profile != null;
  const usernameClean = profile?.username?.replace(/^@/, '').trim() ?? '';
  const profileHeadline = !hasProfile
    ? 'anonymous'
    : usernameClean
      ? `@${usernameClean}`
      : 'MySocial profile';
  const profileHref = mysocialProfileHref(profile ?? null);
  const walletExplorerHref = buildMysocialWalletExplorerHref(walletAddress);
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
        className="w-[min(calc(100vw-2rem),19rem)] rounded-xl border border-trade-shell bg-popover/90 p-0 shadow-lg backdrop-blur-xl supports-[backdrop-filter]:bg-popover/78"
      >
        <div className="space-y-0 border-b border-trade-shell">
          <div className="flex items-start gap-1 px-3 pb-2 pt-1.5">
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
                  'group/profile-head block rounded-md px-1 py-0.5 -mx-0.5 -mt-px outline-none transition-colors',
                  'text-primary hover:text-primary dark:hover:text-primary',
                  'dark:hover:bg-accent/35',
                  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover'
                )}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <span className="min-w-0 truncate text-sm leading-tight text-primary">
                    {profileHeadline}
                  </span>
                  <ChevronRight
                    className="h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)]"
                    aria-hidden
                  />
                </div>
              </Link>
              <div className="-mt-px pl-px">
                <ProfileMenuWalletCopyRow address={walletAddress} addressHead={10} addressTail={10} />
              </div>
              {hasProfile ? (
                <p className="mt-0.5 pl-px text-sm leading-tight">
                  <span className="font-bold tabular-nums">{formatSocialCount(followers)}</span>
                  <span className="font-normal text-[var(--muted-foreground)]"> followers</span>
                  <span className="text-[var(--muted-foreground)] px-1" aria-hidden>
                    {' '}
                  </span>
                  <span className="font-bold tabular-nums">{formatSocialCount(following)}</span>
                  <span className="font-normal text-[var(--muted-foreground)]"> following</span>
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="space-y-0.5 px-1 py-1">
          <DropdownMenuItem asChild>
            <Link
              href={walletExplorerHref}
              target="_blank"
              rel="noopener noreferrer"
              className={profileMenuRowLinkClass}
            >
              <User className="mr-2 h-4 w-4 shrink-0 text-[var(--muted-foreground)]" aria-hidden />
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
                <Coins className="mr-2 h-4 w-4 shrink-0 text-[var(--muted-foreground)]" aria-hidden />
                <span className="min-w-0 flex-1 truncate">
                  {tokenMenuAction === 'launch' ? 'Launch SPT' : 'Enable Reservations'}
                </span>
                <ChevronRight className={profileMenuChevronClass} aria-hidden />
              </Link>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem asChild>
            <Link
              href={MYSOCIAL_CREATE_POOL_HREF}
              target="_blank"
              rel="noopener noreferrer"
              className={profileMenuRowLinkClass}
            >
              <Droplets className="mr-2 h-4 w-4 shrink-0 text-[var(--muted-foreground)]" aria-hidden />
              <span className="min-w-0 flex-1 truncate">Create Pool</span>
              <ChevronRight className={profileMenuChevronClass} aria-hidden />
            </Link>
          </DropdownMenuItem>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger
              disabled={isChangingNetwork}
              className={cn(
                profileMenuRowLinkClass,
                'cursor-pointer data-[state=open]:bg-muted/70',
                isChangingNetwork && 'pointer-events-none opacity-60'
              )}
            >
              <Globe className="mr-2 h-4 w-4 shrink-0 text-[var(--muted-foreground)]" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-left">Environment</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent
              sideOffset={6}
              className={cn('min-w-[10.5rem] p-1', PROFILE_SUBMENU_SURFACE)}
            >
              {(['mainnet', 'testnet', 'localnet'] as const).map((network: NetworkType) => {
                  const isMainnet = network === 'mainnet';
                  const isActive = currentNetwork === network;
                  return (
                    <DropdownMenuItem
                      key={network}
                      disabled={isMainnet || isChangingNetwork}
                      className="relative rounded-md py-2 pl-8 pr-2.5 text-sm"
                      onSelect={() => {
                        if (isMainnet) return;
                        void changeNetwork(network);
                      }}
                    >
                      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                        {isActive ? (
                          <Check className="h-3 w-3" strokeWidth={2.25} aria-hidden />
                        ) : null}
                      </span>
                      {NETWORK_LABELS[network]}
                    </DropdownMenuItem>
                  );
              })}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuItem
            className={cn(profileMenuRowLinkClass, 'cursor-default')}
            onSelect={(e) => e.preventDefault()}
          >
            <Palette className="mr-2 h-4 w-4 shrink-0 text-[var(--muted-foreground)]" aria-hidden />
            <span className="min-w-0 flex-1 truncate">Appearance</span>
            <div
              className="ml-auto shrink-0"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <ProfileMenuThemeToggle />
            </div>
          </DropdownMenuItem>
        </div>

        <DropdownMenuSeparator className="my-0 bg-trade-shell-border opacity-70" />

        <div className="space-y-0.5 px-1 pb-1 pt-0">
          <DropdownMenuItem asChild>
            <Link
              href={editHref}
              target="_blank"
              rel="noopener noreferrer"
              className={profileMenuRowLinkClass}
            >
              <Settings className="mr-2 h-4 w-4 shrink-0 text-[var(--muted-foreground)]" aria-hidden />
              <span className="min-w-0 flex-1 truncate">Settings</span>
              <ChevronRight className={profileMenuChevronClass} aria-hidden />
            </Link>
          </DropdownMenuItem>
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
