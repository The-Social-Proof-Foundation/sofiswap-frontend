'use client';

import { TradeChartPoolHeader } from '@/components/trade/trade-chart-pool-header';
import { TradePlatformAccessGate } from '@/components/trade/trade-platform-access-gate';
import { TradeTopNav } from '@/components/trade/trade-top-nav';
import { TradeWorkspaceLayout } from '@/components/trade/trade-workspace-layout';
import { usePoolOhlcv } from '@/hooks/usePoolOhlcv';
import type { OhlcvInterval } from '@/lib/orderbook-indexer/ohlcv';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Suspense, useEffect, useMemo } from 'react';

const TradeCandlestickChart = dynamic(
  () =>
    import('@/components/trade/trade-candlestick-chart').then((m) => ({
      default: m.TradeCandlestickChart,
    })),
  { ssr: false }
);

const DEFAULT_POOL_NAME = 'MYSO_MYUSD';
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

function TradeChartWorkspace() {
  const { data, error, isLoading } = usePoolOhlcv({
    poolName: DEFAULT_POOL_NAME,
    interval: DEFAULT_INTERVAL,
    limit: DEFAULT_LIMIT,
    enabled: true,
  });

  const chartStatus = useMemo(() => {
    if (isLoading) return 'loading' as const;
    if (error) return 'error' as const;
    if (!data?.length) return 'empty' as const;
    return null;
  }, [isLoading, error, data]);

  return (
    <div className="flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden">
      <TradeChartPoolHeader className="shrink-0" poolName={DEFAULT_POOL_NAME} />
      <TradeCandlestickChart
        className="flex-1"
        data={data}
        status={chartStatus}
        errorMessage={error}
        aria-label={`${DEFAULT_POOL_NAME} candlestick chart`}
      />
    </div>
  );
}

export default function TradePage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden font-sans text-foreground">
      <TradeTopNav />
      <TradePlatformAccessGate />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Suspense fallback={null}>
          <TradeAuthMessage />
        </Suspense>
        <TradeWorkspaceLayout chart={<TradeChartWorkspace />} />
      </div>
    </div>
  );
}
