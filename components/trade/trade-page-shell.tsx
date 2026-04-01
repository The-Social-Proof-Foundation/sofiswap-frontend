'use client';

import '@sehaj23/react-spotlight-search/dist/index.css';

import { TradeChartPoolHeader } from '@/components/trade/trade-chart-pool-header';
import { TradePlatformAccessGate } from '@/components/trade/trade-platform-access-gate';
import { TradeTopNav } from '@/components/trade/trade-top-nav';
import { TradeSocialProofTokenContainer } from '@/components/trade/trade-social-proof-token-container';
import { TradeWorkspaceLayout } from '@/components/trade/trade-workspace-layout';
import { useGraphqlProfileOverviewSWR } from '@/hooks/useGraphqlProfileOverviewSWR';
import { useMySocialAuth } from '@/hooks/useMySocialAuth';
import { usePoolOhlcv } from '@/hooks/usePoolOhlcv';
import { useTradeChartOhlcvEnabled } from '@/hooks/useTradeChartOhlcvEnabled';
import type { OhlcvInterval } from '@/lib/orderbook-indexer/ohlcv';
import { useNetwork } from '@/lib/network-provider';
import { getDefaultNetwork } from '@/lib/network-utils';
import { getSofiSwapPlatformConfig } from '@/lib/platform-config';
import type { TradeNavSegment } from '@/lib/trade-nav-segment-storage';
import {
  readTradeNavSegment,
  tradeNavSegmentStorageKey,
  writeTradeNavSegment,
} from '@/lib/trade-nav-segment-storage';
import {
  buildTradePoolSpotlightItems,
  getDefaultTradePoolKey,
  tradePoolKeysForNetwork,
} from '@/lib/trade/pool-spotlight-items';
import { parseTradePath, tradeOrderbookPath } from '@/lib/trade-route-path';
import { cn } from '@/lib/utils';
import type { SpotlightItem } from '@sehaj23/react-spotlight-search';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type RefCallback,
} from 'react';

const TradeCandlestickChart = dynamic(
  () =>
    import('@/components/trade/trade-candlestick-chart').then((m) => ({
      default: m.TradeCandlestickChart,
    })),
  { ssr: false }
);

const Spotlight = dynamic(
  () =>
    import('@sehaj23/react-spotlight-search/dist/index.esm.js').then((m) => ({
      default: m.Spotlight,
    })),
  { ssr: false }
);

const DEFAULT_INTERVAL: OhlcvInterval = '1h';
const DEFAULT_LIMIT = 200;

function isSearchHotkeyBlockedTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  const role = target.getAttribute('role');
  if (role === 'textbox' || role === 'combobox') return true;
  return Boolean(target.closest('[data-radix-select-viewport],[data-radix-popper-content-wrapper]'));
}

function TradeAuthMessage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const error = searchParams.get('error');

  useEffect(() => {
    if (!error) return;
    const t = window.setTimeout(() => {
      router.replace(tradeOrderbookPath());
    }, 8000);
    return () => window.clearTimeout(t);
  }, [error, router]);

  if (error === 'rate_limit') {
    return (
      <div
        role="status"
        className="shrink-0 border-b border-secondary/50 bg-muted/30 px-4 py-2 text-sm text-foreground"
      >
        Too many refresh attempts. Please wait a moment and try signing in again.
      </div>
    );
  }
  if (error === 'auth_failed') {
    return (
      <div
        role="status"
        className="shrink-0 border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-foreground"
      >
        Sign-in could not be completed. Try signing in again from the header.
      </div>
    );
  }
  return null;
}

function TradeChartWorkspace({
  poolName,
  onOpenPoolSpotlight,
  ohlcvEnabled,
  chartContainerRef,
}: {
  poolName: string;
  onOpenPoolSpotlight: () => void;
  ohlcvEnabled: boolean;
  chartContainerRef: RefCallback<HTMLDivElement>;
}) {
  const { data, error, isLoading } = usePoolOhlcv({
    poolName,
    interval: DEFAULT_INTERVAL,
    limit: DEFAULT_LIMIT,
    enabled: ohlcvEnabled,
  });

  const chartStatus = useMemo(() => {
    if (!ohlcvEnabled) return 'empty' as const;
    if (isLoading) return 'loading' as const;
    if (error) return 'error' as const;
    if (!data?.length) return 'empty' as const;
    return null;
  }, [ohlcvEnabled, isLoading, error, data]);

  return (
    <div
      ref={chartContainerRef}
      className="flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden"
    >
      <TradeChartPoolHeader
        className="shrink-0"
        poolName={poolName}
        onPoolPickerOpen={onOpenPoolSpotlight}
      />
      <TradeCandlestickChart
        className="flex-1"
        data={data}
        status={chartStatus}
        errorMessage={error}
        aria-label={`${poolName} candlestick chart`}
      />
    </div>
  );
}

export function TradePageShell() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const withSearch = useCallback(
    (path: string) => {
      const qs = searchParams.toString();
      return qs ? `${path}?${qs}` : path;
    },
    [searchParams]
  );

  const { segment: pathSegment, routeProfileAddress } = useMemo(
    () => parseTradePath(pathname),
    [pathname]
  );
  const isSptRoute = pathSegment === 'social-proof-tokens';

  /** On `/trade` only (not `/trade/spt/...`), segment is client-local so the URL can stay stable. */
  const [inlineTradeSegment, setInlineTradeSegment] = useState<TradeNavSegment>('orderbook');

  const { currentNetwork } = useNetwork();
  const { isAuthenticated, displayAddress, isLoading: tradeAuthLoading } = useMySocialAuth();
  const platformGraphqlId = useMemo(
    () => getSofiSwapPlatformConfig()?.platformGraphqlId ?? null,
    []
  );
  const profileOverviewAddress = useMemo(() => {
    if (!isAuthenticated || tradeAuthLoading) return null;
    return displayAddress?.trim() || null;
  }, [isAuthenticated, tradeAuthLoading, displayAddress]);
  const { data: tradeProfileOverview } = useGraphqlProfileOverviewSWR(
    profileOverviewAddress,
    platformGraphqlId,
    currentNetwork
  );

  useEffect(() => {
    if (isSptRoute || tradeAuthLoading) return;
    const key = tradeNavSegmentStorageKey(displayAddress, isAuthenticated);
    const stored = readTradeNavSegment(key);
    if (stored) setInlineTradeSegment(stored);
  }, [isSptRoute, tradeAuthLoading, isAuthenticated, displayAddress, pathname]);

  const tradeNavSegment: TradeNavSegment = isSptRoute ? 'social-proof-tokens' : inlineTradeSegment;

  const [poolName, setPoolName] = useState(() =>
    getDefaultTradePoolKey(getDefaultNetwork())
  );
  const [poolSpotlightOpen, setPoolSpotlightOpen] = useState(false);
  const showOrderbookWorkspace = tradeNavSegment === 'orderbook';
  const { enabled: ohlcvEnabled, setChartContainerRef } = useTradeChartOhlcvEnabled(
    showOrderbookWorkspace
  );

  const spotlightItems = useMemo(
    () => buildTradePoolSpotlightItems(currentNetwork),
    [currentNetwork]
  );

  useEffect(() => {
    const keys = tradePoolKeysForNetwork(currentNetwork);
    const fallback = getDefaultTradePoolKey(currentNetwork);
    const valid = new Set(keys.length > 0 ? keys : [fallback]);
    if (!valid.has(poolName)) {
      setPoolName(keys[0] ?? fallback);
    }
  }, [currentNetwork, poolName]);

  const onPoolSpotlightSelect = useCallback(
    (item: SpotlightItem) => {
      setPoolName(item.id);
      setPoolSpotlightOpen(false);
      setInlineTradeSegment('orderbook');
      writeTradeNavSegment(
        tradeNavSegmentStorageKey(displayAddress, isAuthenticated),
        'orderbook'
      );
      router.replace(withSearch(tradeOrderbookPath()));
    },
    [router, withSearch, displayAddress, isAuthenticated]
  );

  const onTradeSegmentChange = useCallback(
    (segment: TradeNavSegment) => {
      const parsed = parseTradePath(pathname);
      const onSptUrl = parsed.segment === 'social-proof-tokens';
      const key = tradeNavSegmentStorageKey(displayAddress, isAuthenticated);

      if (segment === 'orderbook') {
        if (onSptUrl) {
          router.replace(withSearch(tradeOrderbookPath()));
        }
        setInlineTradeSegment('orderbook');
        writeTradeNavSegment(key, 'orderbook');
        return;
      }

      if (onSptUrl) {
        return;
      }

      setInlineTradeSegment('social-proof-tokens');
      writeTradeNavSegment(key, 'social-proof-tokens');
    },
    [pathname, router, withSearch, displayAddress, isAuthenticated]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat) return;
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.isComposing) return;
      if (isSearchHotkeyBlockedTarget(e.target as EventTarget)) return;
      e.preventDefault();
      setPoolSpotlightOpen(true);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  useLayoutEffect(() => {
    if (!poolSpotlightOpen) return;
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 40;

    const tryFocus = () => {
      if (cancelled) return;
      const input = document.querySelector<HTMLInputElement>(
        '.spotlight-overlay .spotlight-input input, .spotlight-overlay .MuiInputBase-input'
      );
      if (input) {
        input.focus({ preventScroll: true });
        return;
      }
      attempts += 1;
      if (attempts < maxAttempts) requestAnimationFrame(tryFocus);
    };

    tryFocus();
    return () => {
      cancelled = true;
    };
  }, [poolSpotlightOpen]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden font-sans text-foreground">
      <TradeTopNav
        tradeSegment={tradeNavSegment}
        onTradeSegmentChange={onTradeSegmentChange}
        onOpenTradeSearch={() => setPoolSpotlightOpen(true)}
      />
      <TradePlatformAccessGate verifyOrderbookTradingSetup={showOrderbookWorkspace} />
      <div
        className={cn(
          'flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-y-contain md:overflow-hidden',
          !showOrderbookWorkspace && 'hidden'
        )}
        aria-hidden={!showOrderbookWorkspace}
      >
        <Suspense fallback={null}>
          <TradeAuthMessage />
        </Suspense>
        <TradeWorkspaceLayout
          chart={
            <TradeChartWorkspace
              poolName={poolName}
              onOpenPoolSpotlight={() => setPoolSpotlightOpen(true)}
              ohlcvEnabled={ohlcvEnabled}
              chartContainerRef={setChartContainerRef}
            />
          }
          poolName={poolName}
        />
      </div>
      <div
        className={cn(
          'flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden bg-background',
          showOrderbookWorkspace && 'hidden'
        )}
        aria-hidden={showOrderbookWorkspace}
      >
        <Suspense fallback={null}>
          <TradeSocialProofTokenContainer
            enabled={!showOrderbookWorkspace}
            profileOverview={tradeProfileOverview}
            profileAddressOverride={isSptRoute ? routeProfileAddress : null}
          />
        </Suspense>
      </div>
      <Spotlight
        items={spotlightItems}
        onSelect={onPoolSpotlightSelect}
        isOpen={poolSpotlightOpen}
        onClose={() => setPoolSpotlightOpen(false)}
        placeholder="Search tokens, pools, and wallets"
        showInitialResults
      />
    </div>
  );
}
