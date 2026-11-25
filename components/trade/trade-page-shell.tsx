'use client';

import { TradeChartPoolHeader } from '@/components/trade/trade-chart-pool-header';
import { TradeMarketSearch } from '@/components/trade/trade-market-search';
import { TradePlatformAccessGate } from '@/components/trade/trade-platform-access-gate';
import { TradeTopNav } from '@/components/trade/trade-top-nav';
import { TradeSocialProofTokenContainer } from '@/components/trade/trade-social-proof-token-container';
import { TradeWorkspaceLayout } from '@/components/trade/trade-workspace-layout';
import { useGraphqlProfileOverviewSWR } from '@/hooks/useGraphqlProfileOverviewSWR';
import { useMySocialAuth } from '@/hooks/useMySocialAuth';
import { useOrderbookMarketTicker } from '@/hooks/useOrderbookMarketTicker';
import { usePoolOhlcv } from '@/hooks/usePoolOhlcv';
import { usePoolOrderBook } from '@/hooks/usePoolOrderBook';
import { useTradeChartOhlcvEnabled } from '@/hooks/useTradeChartOhlcvEnabled';
import { useTradeSpotlightPoolItems } from '@/hooks/useTradeSpotlightPoolItems';
import { useOwnedSptPositions } from '@/hooks/useSptPortfolio';
import { useSptDiscovery } from '@/hooks/useSptDiscovery';
import {
  mergeOwnedSpotlightItems,
  sptOwnedPositionSpotlightItems,
} from '@/lib/spt/owned-positions';
import { useSofiSwapPlatformConfig } from '@/hooks/useSofiSwapPlatformConfig';
import type { OhlcvInterval } from '@/lib/orderbook-indexer/ohlcv';
import { applyLivePriceToCandles, OHLCV_INTERVALS } from '@/lib/orderbook-indexer/ohlcv';
import { formatTickerPrice, marketDisplayPrice } from '@/lib/orderbook-indexer/ticker';
import { useNetwork } from '@/lib/network-provider';
import { getDefaultNetwork } from '@/lib/network-utils';
import type { TradeNavSegment } from '@/lib/trade-nav-segment-storage';
import {
  readTradeNavSegment,
  tradeNavSegmentStorageKey,
  writeTradeNavSegment,
} from '@/lib/trade-nav-segment-storage';
import { getDefaultTradePoolKey, tradePoolKeysForNetwork } from '@/lib/trade/pool-spotlight-items';
import {
  parseTradePath,
  readTradePoolQuery,
  tradeOrderbookPath,
  tradePathWithPool,
} from '@/lib/trade-route-path';
import { tradeChartWellClass, tradeDownTextClass, tradeUpTextClass } from '@/lib/trade-shell-styles';
import { cn } from '@/lib/utils';
import type { SpotlightItem } from '@sehaj23/react-spotlight-search';
import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type RefCallback,
} from 'react';

const INTERVAL_LABEL: Record<OhlcvInterval, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1h': '1h',
  '4h': '4h',
  '1d': 'D',
  '1w': 'W',
};

const TradeCandlestickChart = dynamic(
  () =>
    import('@/components/trade/trade-candlestick-chart').then((m) => ({
      default: m.TradeCandlestickChart,
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
  const { currentNetwork } = useNetwork();
  const [chartInterval, setChartInterval] = useState<OhlcvInterval>(DEFAULT_INTERVAL);
  const [hoverCandle, setHoverCandle] = useState<{
    open: number;
    high: number;
    low: number;
    close: number;
  } | null>(null);
  const { data, error, isLoading } = usePoolOhlcv({
    poolName,
    interval: chartInterval,
    limit: DEFAULT_LIMIT,
    enabled: ohlcvEnabled,
  });
  const { data: book } = usePoolOrderBook({
    poolName,
    levelsPerSide: 4,
    enabled: ohlcvEnabled,
  });
  const { markets } = useOrderbookMarketTicker(currentNetwork);

  const liveQuote = useMemo(() => {
    const mid = book?.midPrice;
    if (mid != null && Number.isFinite(mid) && mid > 0) {
      const bestBid = book?.bids[0]?.price;
      const bestAsk = book?.asks.length ? book.asks[book.asks.length - 1]?.price : undefined;
      return { price: mid, bid: bestBid, ask: bestAsk };
    }
    const summary = markets.find((row) => row.trading_pairs === poolName);
    const price = summary ? marketDisplayPrice(summary) : null;
    if (price == null) return undefined;
    return { price, bid: summary?.highest_bid, ask: summary?.lowest_ask };
  }, [book, markets, poolName]);

  const chartData = useMemo(
    () => applyLivePriceToCandles(data ?? [], liveQuote, chartInterval),
    [data, liveQuote, chartInterval]
  );

  const market = useMemo(
    () => markets.find((row) => row.trading_pairs === poolName) ?? null,
    [markets, poolName]
  );

  const legend = hoverCandle ?? chartData.at(-1) ?? null;
  const legendUp = legend != null && legend.close >= legend.open;

  const chartStatus = useMemo(() => {
    if (!ohlcvEnabled) return 'empty' as const;
    if (isLoading && !chartData.length) return 'loading' as const;
    if (error && !chartData.length) return 'error' as const;
    if (!chartData.length) return 'empty' as const;
    return null;
  }, [ohlcvEnabled, isLoading, error, chartData]);

  return (
    <div
      ref={chartContainerRef}
      className={cn('flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden', tradeChartWellClass)}
    >
      <TradeChartPoolHeader
        className="shrink-0"
        poolName={poolName}
        onPoolPickerOpen={onOpenPoolSpotlight}
        lastPrice={liveQuote?.price ?? (market ? marketDisplayPrice(market) : null)}
        changePercent={market?.price_change_percent_24h ?? null}
        quoteVolume={market?.quote_volume ?? null}
        marketPrice={liveQuote?.price ?? (market ? marketDisplayPrice(market) : null)}
        bestBid={liveQuote?.bid ?? market?.highest_bid ?? null}
        bestAsk={liveQuote?.ask ?? market?.lowest_ask ?? null}
      />
      <div className="flex shrink-0 items-center gap-2 border-b border-black/10 px-2 py-1 dark:border-white/5">
        <div className="hidden min-w-0 flex-1 items-center gap-2 overflow-hidden pl-1 font-mono text-[11px] tabular-nums md:flex">
          {legend ? (
            <>
              <span className="text-muted-foreground">{INTERVAL_LABEL[chartInterval]}</span>
              <span className="text-muted-foreground">
                O <span className="text-foreground">{formatTickerPrice(legend.open)}</span>
              </span>
              <span className="text-muted-foreground">
                H <span className="text-foreground">{formatTickerPrice(legend.high)}</span>
              </span>
              <span className="text-muted-foreground">
                L <span className="text-foreground">{formatTickerPrice(legend.low)}</span>
              </span>
              <span className="text-muted-foreground">
                C{' '}
                <span className={legendUp ? tradeUpTextClass : tradeDownTextClass}>
                  {formatTickerPrice(legend.close)}
                </span>
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">OHLC</span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-0.5">
          {OHLCV_INTERVALS.map((iv) => (
            <button
              key={iv}
              type="button"
              onClick={() => setChartInterval(iv)}
              className={cn(
                'rounded px-1.5 py-0.5 text-[11px] font-medium tabular-nums transition-colors',
                iv === chartInterval
                  ? 'bg-foreground/10 text-foreground'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              )}
              aria-pressed={iv === chartInterval}
            >
              {INTERVAL_LABEL[iv]}
            </button>
          ))}
        </div>
      </div>
      <TradeCandlestickChart
        className="flex-1"
        data={chartData}
        status={chartStatus}
        errorMessage={error}
        onLegendChange={setHoverCandle}
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

  const { segment: pathSegment, routeProfileAddress, routePostId } = useMemo(
    () => parseTradePath(pathname),
    [pathname]
  );
  const isSptRoute = pathSegment === 'social-proof-tokens';

  /** On `/trade` only (not `/trade/spt/...`), segment is client-local so the URL can stay stable. */
  const [inlineTradeSegment, setInlineTradeSegment] = useState<TradeNavSegment>('orderbook');

  const { currentNetwork } = useNetwork();
  const { isAuthenticated, displayAddress, isLoading: tradeAuthLoading } = useMySocialAuth();
  const { config: platformConfig } = useSofiSwapPlatformConfig(currentNetwork);
  const platformGraphqlId = platformConfig?.platformGraphqlId ?? null;
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

  const poolFromQuery = readTradePoolQuery(searchParams);
  const [poolName, setPoolName] = useState(() =>
    poolFromQuery || getDefaultTradePoolKey(getDefaultNetwork())
  );
  const [poolSpotlightOpen, setPoolSpotlightOpen] = useState(false);
  const showOrderbookWorkspace = tradeNavSegment === 'orderbook';
  const { enabled: ohlcvEnabled, setChartContainerRef } = useTradeChartOhlcvEnabled(
    showOrderbookWorkspace
  );

  const { items: spotlightItems, error: marketError, isLoading: marketsLoading, revalidate: refreshMarkets, revision: marketRevision } = useTradeSpotlightPoolItems(currentNetwork);
  const { items: sptSpotlightItems } = useSptDiscovery(currentNetwork);
  // Tokens the connected wallet holds are indexed ahead of the native spot markets, so
  // "my tokens" searches and the initial result list lead with what is tradable today.
  const { positions: ownedPositions } = useOwnedSptPositions({
    network: currentNetwork,
    owner: displayAddress,
    enabled: isAuthenticated,
  });
  const ownedSpotlightItems = useMemo(
    () => sptOwnedPositionSpotlightItems(ownedPositions),
    [ownedPositions]
  );
  const allSpotlightItems = useMemo(
    () => mergeOwnedSpotlightItems(ownedSpotlightItems, [...spotlightItems, ...sptSpotlightItems]),
    [ownedSpotlightItems, spotlightItems, sptSpotlightItems]
  );

  const spotlightPoolIds = useMemo(() => spotlightItems.map((item) => item.id), [spotlightItems]);

  /**
   * Markets are polled, and a single failed poll empties the list. Once the workspace has been
   * shown for this network it stays mounted, so a refresh never swaps the whole exchange out for
   * a loading panel and back.
   */
  const [marketsSeenFor, setMarketsSeenFor] = useState<string | null>(null);
  useEffect(() => {
    if (spotlightItems.length > 0) setMarketsSeenFor(currentNetwork);
  }, [spotlightItems.length, currentNetwork]);
  const hasMarkets = spotlightItems.length > 0 || marketsSeenFor === currentNetwork;

  useEffect(() => {
    const keys = tradePoolKeysForNetwork(currentNetwork);
    const fallback = getDefaultTradePoolKey(currentNetwork);
    const valid = new Set<string>([
      ...(keys.length > 0 ? keys : [fallback]),
      ...spotlightPoolIds,
      ...(poolFromQuery ? [poolFromQuery] : []),
    ]);
    if (poolFromQuery && poolFromQuery !== poolName) {
      setPoolName(poolFromQuery);
      return;
    }
    if (!valid.has(poolName)) {
      setPoolName(keys[0] ?? fallback);
    }
  }, [currentNetwork, poolName, poolFromQuery, spotlightPoolIds]);

  const onPoolSpotlightSelect = useCallback(
    (item: SpotlightItem) => {
      if (item.id.startsWith('spt:')) {
        setPoolSpotlightOpen(false);
        setInlineTradeSegment('social-proof-tokens');
        writeTradeNavSegment(
          tradeNavSegmentStorageKey(displayAddress, isAuthenticated),
          'social-proof-tokens'
        );
        router.replace(item.url || '/trade/spt');
        return;
      }
      setPoolName(item.id);
      setPoolSpotlightOpen(false);
      setInlineTradeSegment('orderbook');
      writeTradeNavSegment(
        tradeNavSegmentStorageKey(displayAddress, isAuthenticated),
        'orderbook'
      );
      router.replace(tradePathWithPool(tradeOrderbookPath(), item.id, searchParams.toString()));
    },
    [router, searchParams, displayAddress, isAuthenticated]
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
        if (parsed.routePostId || parsed.routeProfileAddress) router.push('/trade/spt');
        return;
      }

      setInlineTradeSegment('social-proof-tokens');
      writeTradeNavSegment(key, 'social-proof-tokens');
      router.push('/trade/spt');
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

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden font-sans text-foreground">
      <TradeTopNav
        tradeSegment={tradeNavSegment}
        onTradeSegmentChange={onTradeSegmentChange}
        onOpenTradeSearch={() => setPoolSpotlightOpen(true)}
        poolName={poolName}
      />
      <TradePlatformAccessGate verifyOrderbookTradingSetup={showOrderbookWorkspace} />
      <div
        className={cn(
          'min-h-0 min-w-0 flex-col overflow-y-auto overscroll-y-contain md:overflow-hidden',
          showOrderbookWorkspace ? 'flex min-h-0 flex-1' : 'hidden'
        )}
        aria-hidden={!showOrderbookWorkspace}
      >
        <Suspense fallback={null}>
          <TradeAuthMessage />
        </Suspense>
        {!hasMarkets ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center" role="status">
            <p className="font-semibold">{marketsLoading ? 'Loading markets…' : marketError ? 'Markets are unavailable' : 'No orderbook markets on this network yet'}</p>
            <p className="max-w-lg text-sm text-muted-foreground">{marketError || (!marketsLoading && 'Deployed markets will appear here automatically when the network indexes them.')}</p>
            {!marketsLoading ? <button type="button" onClick={refreshMarkets} className="rounded-md border border-trade-shell px-4 py-2 text-sm">Refresh markets</button> : null}
          </div>
        ) : <TradeWorkspaceLayout
          key={`${currentNetwork}:${marketRevision}`}
          className="h-full min-h-0 flex-1"
          chart={
            <TradeChartWorkspace
              poolName={poolName}
              onOpenPoolSpotlight={() => setPoolSpotlightOpen(true)}
              ohlcvEnabled={ohlcvEnabled}
              chartContainerRef={setChartContainerRef}
            />
          }
          poolName={poolName}
        />}
      </div>
      <div
        className={cn(
          'min-h-0 min-w-0 w-full flex-col overflow-hidden bg-background',
          showOrderbookWorkspace ? 'hidden' : 'flex min-h-0 flex-1'
        )}
        aria-hidden={showOrderbookWorkspace}
      >
        <Suspense fallback={null}>
          <TradeSocialProofTokenContainer
            enabled={!showOrderbookWorkspace}
            profileOverview={tradeProfileOverview}
            profileAddressOverride={isSptRoute ? routeProfileAddress : null}
            postIdOverride={isSptRoute ? routePostId : null}
          />
        </Suspense>
      </div>
      <TradeMarketSearch
        open={poolSpotlightOpen}
        items={allSpotlightItems}
        onClose={() => setPoolSpotlightOpen(false)}
        onSelect={onPoolSpotlightSelect}
      />
    </div>
  );
}
