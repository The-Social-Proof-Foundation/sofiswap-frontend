'use client';

import '@sehaj23/react-spotlight-search/dist/index.css';

import { TradeChartPoolHeader } from '@/components/trade/trade-chart-pool-header';
import { TradePlatformAccessGate } from '@/components/trade/trade-platform-access-gate';
import { TradeTopNav } from '@/components/trade/trade-top-nav';
import { TradeWorkspaceLayout } from '@/components/trade/trade-workspace-layout';
import { usePoolOhlcv } from '@/hooks/usePoolOhlcv';
import { useTradeChartOhlcvEnabled } from '@/hooks/useTradeChartOhlcvEnabled';
import type { OhlcvInterval } from '@/lib/orderbook-indexer/ohlcv';
import { useNetwork } from '@/lib/network-provider';
import { getDefaultNetwork } from '@/lib/network-utils';
import type { TradeNavSegment } from '@/lib/trade-nav-segment-storage';
import {
  buildTradePoolSpotlightItems,
  getDefaultTradePoolKey,
  tradePoolKeysForNetwork,
} from '@/lib/trade/pool-spotlight-items';
import type { SpotlightItem } from '@sehaj23/react-spotlight-search';
import { useRouter, useSearchParams } from 'next/navigation';
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

function TradeAuthMessage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const error = searchParams.get('error');

  useEffect(() => {
    if (!error) return;
    const t = window.setTimeout(() => {
      router.replace('/trade');
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

export default function TradePage() {
  const { currentNetwork } = useNetwork();
  const [poolName, setPoolName] = useState(() =>
    getDefaultTradePoolKey(getDefaultNetwork())
  );
  const [poolSpotlightOpen, setPoolSpotlightOpen] = useState(false);
  const [tradeNavSegment, setTradeNavSegment] = useState<TradeNavSegment>('orderbook');
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

  const onPoolSpotlightSelect = useCallback((item: SpotlightItem) => {
    setPoolName(item.id);
    setPoolSpotlightOpen(false);
  }, []);

  useEffect(() => {
    if (!showOrderbookWorkspace) {
      setPoolSpotlightOpen(false);
    }
  }, [showOrderbookWorkspace]);

  useEffect(() => {
    if (!showOrderbookWorkspace) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key !== 'k') return;
      e.preventDefault();
      setPoolSpotlightOpen((open) => !open);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showOrderbookWorkspace]);

  useLayoutEffect(() => {
    if (!showOrderbookWorkspace || !poolSpotlightOpen) return;
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
  }, [showOrderbookWorkspace, poolSpotlightOpen]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden font-sans text-foreground">
      <TradeTopNav onTradeNavSegmentChange={setTradeNavSegment} />
      {showOrderbookWorkspace ? (
        <>
          <TradePlatformAccessGate />
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
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

          <Spotlight
            items={spotlightItems}
            onSelect={onPoolSpotlightSelect}
            isOpen={poolSpotlightOpen}
            onClose={() => setPoolSpotlightOpen(false)}
            placeholder="Search any trading pool..."
            showInitialResults
          />
        </>
      ) : (
        <div className="min-h-0 flex-1 bg-background" aria-hidden />
      )}
    </div>
  );
}
