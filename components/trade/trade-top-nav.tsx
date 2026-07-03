'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { useEffect, useMemo, useRef, useState } from 'react';

import { TradeNavFundsBar } from '@/components/trade/trade-nav-funds-bar';
import { TradeNavProfileMenu } from '@/components/trade/trade-nav-profile-menu';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import {
  SlidingSegmentTabs,
  type SlidingSegmentItem,
} from '@/components/ui/sliding-segment-tabs';
import { useGraphqlProfileOverviewSWR } from '@/hooks/useGraphqlProfileOverviewSWR';
import { useMySocialAuth } from '@/hooks/useMySocialAuth';
import type { ProfilePortfolioOverviewProfile } from '@/lib/graphql/profile-portfolio-overview';
import { useNetwork } from '@/lib/network-provider';
import { getSofiSwapPlatformConfig } from '@/lib/platform-config';
import {
  readTradeNavSegment,
  tradeNavSegmentStorageKey,
  writeTradeNavSegment,
  type TradeNavSegment,
} from '@/lib/trade-nav-segment-storage';
import { tradeRailSegmentListClass } from '@/lib/trade-shell-styles';
import { cn } from '@/lib/utils';
import { Search } from 'lucide-react';

export type { TradeNavSegment };

/** Matches order book rail / buy–sell segment triggers; active color comes from sliding-segment-tabs. */
const tradeNavSegmentTriggerBase = 'px-2 py-0 text-[13px] leading-none';

function tradeNavSegmentItems(): SlidingSegmentItem[] {
  return [
    {
      value: 'orderbook',
      label: (
        <span className="block min-w-0 max-w-full truncate text-inherit">Exchange</span>
      ),
      triggerClassName: cn(tradeNavSegmentTriggerBase),
    },
    {
      value: 'social-proof-tokens',
      label: (
        <span className="block min-w-0 max-w-full truncate text-inherit px-0 md:px-2 2xl:px-4">
          Social Proof Tokens
        </span>
      ),
      triggerClassName: cn(tradeNavSegmentTriggerBase),
    },
  ];
}

function TradeSpotlightSearchTrigger({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-11 max-w-full items-center rounded-full border border-trade-shell bg-muted/50 text-left text-[13px] text-[var(--muted-foreground)]',
        'w-full justify-start gap-2 px-3.5',
        'sm:rounded-xl sm:w-11 sm:shrink-0 sm:justify-center sm:gap-0 sm:px-0',
        'lg:rounded-full lg:w-[min(100%,14rem)] lg:justify-start lg:gap-2 lg:px-3.5 xl:w-[min(100%,21rem)]',
        'shadow-[0_1px_0_rgba(255,255,255,0.04)] transition-colors hover:bg-muted/70 hover:text-foreground',
        'dark:bg-muted/30 dark:hover:bg-muted/45',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className
      )}
      aria-label="Open search: tokens, pools, and wallets. Press / anywhere outside a field."
    >
      <Search className="shrink-0 opacity-65" size={16} strokeWidth={1.75} aria-hidden />
      <span className="min-w-0 flex-1 truncate sm:hidden lg:block">
        Search tokens, pools, and wallets
      </span>
      <Kbd
        className="hidden h-5 min-w-[1.25rem] shrink-0 justify-center px-1 py-0 font-mono text-[9px] leading-none lg:inline-flex"
        aria-hidden
      >
        /
      </Kbd>
    </button>
  );
}

function TradeNavSegmentTabs({
  segment,
  onSegmentChange,
  className,
  listClassName,
}: {
  segment: TradeNavSegment;
  onSegmentChange: (v: string) => void;
  className?: string;
  listClassName?: string;
}) {
  const items = useMemo(() => tradeNavSegmentItems(), []);

  return (
    <SlidingSegmentTabs
      value={segment}
      onValueChange={onSegmentChange}
      className={className}
      listClassName={cn(tradeRailSegmentListClass, listClassName)}
      aria-label="Trading view"
      items={items}
    />
  );
}

function TradeNavBrand({
  mounted,
  logoSrc,
  linkClassName,
}: {
  mounted: boolean;
  logoSrc: string;
  linkClassName?: string;
}) {
  return (
    <Link
      href="/"
      className={cn(
        'group flex shrink-0 items-center gap-2 font-satoshi text-[1.375rem] font-semibold tracking-tight transition-opacity hover:opacity-90 sm:gap-3',
        linkClassName
      )}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center">
        {mounted ? (
          <Image
            src={logoSrc}
            alt="SofiSwap Logo"
            width={36}
            height={36}
            className="h-9 w-9"
          />
        ) : (
          <div className="h-9 w-9" aria-hidden />
        )}
      </div>
      <span className="inline-flex items-baseline">
        <span className="text-primary">Sofi</span>
        <span className="text-foreground">Swap</span>
      </span>
    </Link>
  );
}

function TradeNavAuthActions({
  isConfigured,
  isAuthenticated,
  displayAddress,
  isLoading,
  isSigningIn,
  rateLimited,
  onSignIn,
  signOut,
  profile,
  poolName,
}: {
  isConfigured: boolean;
  isAuthenticated: boolean;
  displayAddress: string | null | undefined;
  isLoading: boolean;
  isSigningIn: boolean;
  rateLimited: boolean;
  onSignIn: () => void;
  signOut: () => void;
  profile: ProfilePortfolioOverviewProfile | null | undefined;
  poolName?: string;
}) {
  const wallet = displayAddress?.trim() ?? '';

  return (
    <div className="flex shrink-0 items-center gap-2 sm:gap-3">
      {!isConfigured ? (
        <span className="hidden text-xs text-[var(--muted-foreground)] sm:inline">
          Set env to enable login
        </span>
      ) : null}
      {isAuthenticated && wallet ? (
        <>
          <TradeNavFundsBar poolName={poolName} />
          <TradeNavProfileMenu walletAddress={wallet} profile={profile} signOut={signOut} />
        </>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="default"
          className="font-medium"
          disabled={!isConfigured || isLoading || isSigningIn}
          onClick={onSignIn}
        >
          {!isConfigured
            ? 'Login unavailable'
            : isLoading
              ? '…'
              : rateLimited
                ? 'Retry later'
                : isSigningIn
                  ? 'Connecting…'
                  : (
                      <>
                        <span className="sm:hidden">Log In</span>
                        <span className="hidden sm:inline">Get started</span>
                      </>
                    )}
        </Button>
      )}
    </div>
  );
}

export function TradeTopNav({
  className,
  tradeSegment = 'orderbook',
  onTradeSegmentChange,
  onTradeNavSegmentChange,
  onOpenTradeSearch,
  poolName,
}: {
  className?: string;
  tradeSegment?: TradeNavSegment;
  onTradeSegmentChange?: (segment: TradeNavSegment) => void;
  /** Fires when the active trading view changes (including after localStorage hydrate). */
  onTradeNavSegmentChange?: (segment: TradeNavSegment) => void;
  /** Spotlight / command-palette entry (pool search); rendered as a centered pill on desktop. */
  onOpenTradeSearch?: () => void;
  /** Active pool key; forwarded to the funds bar for deposit/withdraw context. */
  poolName?: string;
}) {
  const {
    isConfigured,
    isAuthenticated,
    displayAddress,
    isLoading: authLoading,
    isSigningIn,
    signIn,
    signOut,
    rateLimited,
  } = useMySocialAuth();

  const { currentNetwork } = useNetwork();
  const platformId = useMemo(
    () => getSofiSwapPlatformConfig(currentNetwork)?.platformGraphqlId ?? null,
    [currentNetwork]
  );
  const profileQueryAddress = isAuthenticated && !authLoading ? displayAddress : null;
  const { data: profileOverview } = useGraphqlProfileOverviewSWR(
    profileQueryAddress,
    platformId,
    currentNetwork
  );

  const [mounted, setMounted] = useState(false);
  const { theme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  const logoSrc = theme !== 'dark' ? '/logo_dark.svg' : '/logo_light.svg';

  const [innerSegment, setInnerSegment] = useState<TradeNavSegment>(tradeSegment);
  const innerSegmentRef = useRef(innerSegment);
  innerSegmentRef.current = innerSegment;
  const prevStorageKeyRef = useRef<string | null>(null);

  useEffect(() => {
    setInnerSegment(tradeSegment);
  }, [tradeSegment]);

  useEffect(() => {
    if (onTradeSegmentChange || authLoading) return;
    const key = tradeNavSegmentStorageKey(displayAddress, isAuthenticated);
    const prevKey = prevStorageKeyRef.current;
    const stored = readTradeNavSegment(key);
    if (stored) {
      setInnerSegment(stored);
    } else if (prevKey !== key) {
      writeTradeNavSegment(key, innerSegmentRef.current);
    }
    prevStorageKeyRef.current = key;
  }, [onTradeSegmentChange, authLoading, isAuthenticated, displayAddress]);

  const segment = onTradeSegmentChange ? tradeSegment : innerSegment;

  useEffect(() => {
    onTradeNavSegmentChange?.(segment);
  }, [segment, onTradeNavSegmentChange]);

  const setSegment = (v: string) => {
    const next = v as TradeNavSegment;
    if (onTradeSegmentChange) {
      onTradeSegmentChange(next);
      return;
    }
    setInnerSegment(next);
    if (authLoading) return;
    const key = tradeNavSegmentStorageKey(displayAddress, isAuthenticated);
    writeTradeNavSegment(key, next);
  };

  const onSignIn = () => {
    void signIn('none').catch((e) => {
      console.error('[TradeTopNav] signIn', e);
    });
  };

  const authProps = {
    isConfigured,
    isAuthenticated,
    displayAddress,
    isLoading: authLoading,
    isSigningIn,
    rateLimited,
    onSignIn,
    signOut,
    profile: profileOverview?.profile,
    poolName,
  };

  /** Matches TradeNavAuthActions: funds + profile vs Get started. */
  const loggedIn = isAuthenticated && Boolean(displayAddress?.trim());

  return (
    <header
      className={cn(
        'sticky top-0 z-50 border-b border-trade-shell bg-background/65 backdrop-blur-xl supports-[backdrop-filter]:bg-background/55',
        className
      )}
    >
      <div className="w-full px-4 sm:px-6">
        {/* Mobile: brand + auth, search, segment bar */}
        <div className="flex flex-col sm:hidden">
          <div className="flex h-[3.75rem] items-center justify-between gap-3">
            <TradeNavBrand mounted={mounted} logoSrc={logoSrc} />
            <TradeNavAuthActions {...authProps} />
          </div>
          {onOpenTradeSearch ? (
            <div className="pb-2">
              <TradeSpotlightSearchTrigger onClick={onOpenTradeSearch} />
            </div>
          ) : null}
          <div
            className={cn(
              'border-t border-trade-shell bg-background/50 py-2 backdrop-blur-xl',
              'supports-[backdrop-filter]:bg-background/45'
            )}
          >
            <TradeNavSegmentTabs
              segment={segment}
              onSegmentChange={setSegment}
              className="w-full min-w-0"
              listClassName="h-11 w-full max-w-none"
            />
          </div>
        </div>

        {/* Desktop: logged-in → search centered; guest → search right-aligned next to Get started */}
        <div className="hidden h-[3.75rem] items-center gap-2 sm:flex sm:gap-3">
          <div className="flex min-w-0 shrink-0 items-center gap-4 sm:gap-6">
            <TradeNavBrand mounted={mounted} logoSrc={logoSrc} />
            <TradeNavSegmentTabs
              segment={segment}
              onSegmentChange={setSegment}
              className="min-w-0 flex-initial"
              listClassName="h-11 w-full max-w-[min(100%,20rem)] sm:max-w-[22rem]"
            />
          </div>
          {loggedIn ? (
            <>
              <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center px-1">
                {onOpenTradeSearch ? (
                  <TradeSpotlightSearchTrigger onClick={onOpenTradeSearch} className="max-w-none" />
                ) : null}
              </div>
              <div className="flex shrink-0 items-center justify-end">
                <TradeNavAuthActions {...authProps} />
              </div>
            </>
          ) : (
            <>
              <div className="min-h-0 min-w-0 flex-1" aria-hidden />
              <div className="flex min-w-0 shrink-0 items-center justify-end gap-2 sm:gap-3">
                {onOpenTradeSearch ? (
                  <TradeSpotlightSearchTrigger onClick={onOpenTradeSearch} className="max-w-none" />
                ) : null}
                <TradeNavAuthActions {...authProps} />
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
