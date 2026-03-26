'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { useEffect, useMemo, useState } from 'react';

import { TradeNavFundsBar } from '@/components/trade/trade-nav-funds-bar';
import { TradeNavProfileMenu } from '@/components/trade/trade-nav-profile-menu';
import { Button } from '@/components/ui/button';
import { SlidingSegmentTabs } from '@/components/ui/sliding-segment-tabs';
import { useGraphqlProfileOverviewSWR } from '@/hooks/useGraphqlProfileOverviewSWR';
import { useMySocialAuth } from '@/hooks/useMySocialAuth';
import type { ProfilePortfolioOverviewProfile } from '@/lib/graphql/profile-portfolio-overview';
import { useNetwork } from '@/lib/network-provider';
import { getSofiSwapPlatformConfig } from '@/lib/platform-config';
import { cn } from '@/lib/utils';

export type TradeNavSegment = 'orderbook' | 'social-proof-tokens';

const tradeNavSegmentItems = [
  {
    value: 'orderbook',
    label: 'Orderbook',
    triggerClassName: 'px-2 py-0 text-[13px] leading-tight sm:px-2.5',
  },
  {
    value: 'social-proof-tokens',
    label: 'Social Proof Tokens',
    triggerClassName:
      'px-2 py-0 text-[12px] leading-snug sm:px-2.5 sm:text-[13px] sm:leading-tight',
  },
] as const;

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
  return (
    <SlidingSegmentTabs
      value={segment}
      onValueChange={onSegmentChange}
      className={className}
      listClassName={cn(
        'grid grid-cols-2 gap-0 rounded-[10px] border border-trade-shell bg-muted/70 p-[3px] shadow-inner',
        'dark:bg-muted/40 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]',
        listClassName
      )}
      aria-label="Trading view"
      items={tradeNavSegmentItems}
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
        'group flex shrink-0 items-center gap-2 font-satoshi text-xl font-semibold tracking-tight transition-opacity hover:opacity-90 sm:gap-3',
        linkClassName
      )}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center">
        {mounted ? (
          <Image
            src={logoSrc}
            alt="SofiSwap Logo"
            width={32}
            height={32}
            className="h-8 w-8"
          />
        ) : (
          <div className="h-8 w-8" aria-hidden />
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
}) {
  const wallet = displayAddress?.trim() ?? '';

  return (
    <div className="flex shrink-0 items-center gap-2 sm:gap-3">
      {!isConfigured ? (
        <span className="hidden text-xs text-muted-foreground sm:inline">
          Set env to enable login
        </span>
      ) : null}
      {isAuthenticated && wallet ? (
        <>
          <TradeNavFundsBar />
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
}: {
  className?: string;
  tradeSegment?: TradeNavSegment;
  onTradeSegmentChange?: (segment: TradeNavSegment) => void;
}) {
  const {
    isConfigured,
    isAuthenticated,
    displayAddress,
    isLoading,
    isSigningIn,
    signIn,
    signOut,
    rateLimited,
  } = useMySocialAuth();

  const { currentNetwork } = useNetwork();
  const platformId = useMemo(() => getSofiSwapPlatformConfig()?.platformGraphqlId ?? null, []);
  const profileQueryAddress = isAuthenticated && !isLoading ? displayAddress : null;
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
  useEffect(() => {
    setInnerSegment(tradeSegment);
  }, [tradeSegment]);

  const segment = onTradeSegmentChange ? tradeSegment : innerSegment;
  const setSegment = (v: string) => {
    const next = v as TradeNavSegment;
    if (onTradeSegmentChange) onTradeSegmentChange(next);
    else setInnerSegment(next);
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
    isLoading,
    isSigningIn,
    rateLimited,
    onSignIn,
    signOut,
    profile: profileOverview?.profile,
  };

  return (
    <header
      className={cn(
        'sticky top-0 z-50 border-b border-trade-shell bg-background/65 backdrop-blur-xl supports-[backdrop-filter]:bg-background/55',
        className
      )}
    >
      <div className="w-full px-4 sm:px-6">
        {/* Mobile: brand + auth, then full-width segment bar */}
        <div className="flex flex-col sm:hidden">
          <div className="flex h-14 items-center justify-between gap-3">
            <TradeNavBrand mounted={mounted} logoSrc={logoSrc} />
            <TradeNavAuthActions {...authProps} />
          </div>
          <div
            className={cn(
              'border-t border-trade-shell bg-background/50 py-2.5 backdrop-blur-xl',
              'supports-[backdrop-filter]:bg-background/45'
            )}
          >
            <TradeNavSegmentTabs
              segment={segment}
              onSegmentChange={setSegment}
              className="w-full"
              listClassName="h-10 w-full max-w-none"
            />
          </div>
        </div>

        {/* Desktop: single row */}
        <div className="hidden h-14 items-center justify-between gap-4 sm:flex">
          <div className="flex min-w-0 flex-1 items-center gap-3 md:gap-4">
            <TradeNavBrand mounted={mounted} logoSrc={logoSrc} />
            <TradeNavSegmentTabs
              segment={segment}
              onSegmentChange={setSegment}
              className="min-w-0 flex-initial md:px-2 lg:px-4 xl:px-6 2xl:px-8"
              listClassName="h-9 w-full max-w-[min(100%,18.5rem)] sm:max-w-[20.5rem]"
            />
          </div>
          <TradeNavAuthActions {...authProps} />
        </div>
      </div>
    </header>
  );
}
