'use client';

import { useAdaptiveTradePollMs } from '@/hooks/useAdaptiveTradePollMs';
import { fetchPoolOrderBook } from '@/lib/orderbook-indexer/orderbook';
import { orderbookRuntimeNetwork } from '@/lib/orderbook/config';
import {
  formatIndexerDepthError,
  getOrderbookDepthSource,
  orderbookIndexerNotConfiguredMessage,
} from '@/lib/orderbook/depth';
import { getOrderbookIndexerRestBase } from '@/lib/orderbook-indexer/ohlcv';
import { useNetwork } from '@/lib/network-provider';
import { fetchPoolOrderBookFromSdk } from '@/lib/trade/fetch-pool-orderbook-sdk';
import {
  ORDERBOOK_DEFAULT_LEVELS_PER_SIDE,
  type OrderBookSnapshot,
} from '@/lib/trade/orderbook-types';
import type { NetworkType } from '@/lib/network-utils';
import { useCallback, useEffect, useMemo, useState } from 'react';

/** Dev-only: mid, best bid/ask, and a few levels on each side (asks = best three, low → high). */
function logOrderbookSnapshotDev(
  source: 'indexer' | 'sdk',
  network: NetworkType,
  poolKey: string,
  snap: OrderBookSnapshot
): void {
  if (process.env.NODE_ENV !== 'development') return;
  const { bids, asks, midPrice } = snap;
  const bestBid = bids[0]?.price;
  const bestAsk = asks.length > 0 ? asks[asks.length - 1]!.price : undefined;
  const bidsTop = bids.slice(0, 3).map((l) => ({ price: l.price, size: l.size }));
  const asksNear = asks.slice(Math.max(0, asks.length - 3)).map((l) => ({
    price: l.price,
    size: l.size,
  }));
  console.info(`[SofiSwap orderbook · ${source}]`, {
    network,
    pool: poolKey,
    midPrice,
    bestBid,
    bestAsk,
    bidsTop3: bidsTop,
    asksBest3: asksNear,
    levels: { bids: bids.length, asks: asks.length },
  });
}

export type UsePoolOrderBookArgs = {
  poolName: string;
  /** Depth levels per side from mid (SDK ticks). Ignored when `level2Range` is set. */
  levelsPerSide?: number;
  /**
   * Optional human-readable price band for `getLevel2Range` (bids + asks). Forces SDK depth
   * (indexer HTTP snapshot does not support this mode).
   */
  level2Range?: { priceLow: number; priceHigh: number };
  pollIntervalMs?: number;
  /** When false, no request is made. */
  enabled?: boolean;
};

export function usePoolOrderBook({
  poolName,
  levelsPerSide = ORDERBOOK_DEFAULT_LEVELS_PER_SIDE,
  level2Range,
  pollIntervalMs: pollIntervalMsProp,
  enabled = true,
}: UsePoolOrderBookArgs): {
  data: OrderBookSnapshot | null;
  error: string | null;
  isLoading: boolean;
  refresh: () => void;
} {
  const { currentNetwork } = useNetwork();
  const obNet = orderbookRuntimeNetwork(currentNetwork);
  const adaptiveMs = useAdaptiveTradePollMs(2500);
  const pollIntervalMs = pollIntervalMsProp ?? adaptiveMs;
  const indexerBase = getOrderbookIndexerRestBase(currentNetwork);
  const depthSource = getOrderbookDepthSource();

  const useIndexerPath = useMemo(() => {
    if (level2Range != null) return false;
    if (depthSource === 'indexer') return Boolean(indexerBase);
    if (depthSource === 'auto') return Boolean(indexerBase);
    return false;
  }, [depthSource, indexerBase, level2Range]);

  const [data, setData] = useState<OrderBookSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const refresh = useCallback(() => {
    setRefreshNonce((n) => n + 1);
  }, []);

  const rangeKey = level2Range ? `${level2Range.priceLow}-${level2Range.priceHigh}` : '';

  useEffect(() => {
    if (!enabled || !poolName.trim()) {
      setData(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    const ac = new AbortController();
    setIsLoading(true);
    setError(null);

    const trimmedPool = poolName.trim();
    const sdkPayload = {
      obNet,
      poolKey: trimmedPool,
      ticks: levelsPerSide,
      ...(level2Range
        ? { priceLow: level2Range.priceLow, priceHigh: level2Range.priceHigh }
        : {}),
      signal: ac.signal,
    };

    const applyIndexerResult = (
      res: Awaited<ReturnType<typeof fetchPoolOrderBook>>,
      endInitialLoading: boolean
    ) => {
      if (ac.signal.aborted) return;
      if (endInitialLoading) setIsLoading(false);
      if (res.ok) {
        logOrderbookSnapshotDev('indexer', currentNetwork, trimmedPool, res.data);
        setData(res.data);
        setError(null);
      } else {
        setData(null);
        setError(formatIndexerDepthError(res.error, currentNetwork));
      }
    };

    const runSdk = (endInitialLoading: boolean) =>
      fetchPoolOrderBookFromSdk(sdkPayload)
        .then((result) => applySdkResult(result, endInitialLoading))
        .catch((e) => handleAsyncErr(e, endInitialLoading));

    const runIndexer = (endInitialLoading: boolean) =>
      fetchPoolOrderBook({
        network: currentNetwork,
        poolName: trimmedPool,
        levelsPerSide,
        signal: ac.signal,
      })
        .then((result) => {
          if (!result.ok && depthSource === 'auto') {
            return runSdk(endInitialLoading);
          }
          applyIndexerResult(result, endInitialLoading);
        })
        .catch((e) => {
          if (depthSource === 'auto') return runSdk(endInitialLoading);
          handleAsyncErr(e, endInitialLoading);
        });

    const applySdkResult = (
      res: Awaited<ReturnType<typeof fetchPoolOrderBookFromSdk>>,
      endInitialLoading: boolean
    ) => {
      if (ac.signal.aborted) return;
      if (endInitialLoading) setIsLoading(false);
      if (res.ok) {
        logOrderbookSnapshotDev('sdk', currentNetwork, trimmedPool, res.data);
        setData(res.data);
        setError(null);
      } else {
        setData(null);
        setError(res.error);
      }
    };

    const handleAsyncErr = (e: unknown, endInitialLoading: boolean) => {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      if (endInitialLoading) setIsLoading(false);
      setData(null);
      setError(e instanceof Error ? e.message : String(e));
    };

    const runOnce = () => {
      if (depthSource === 'indexer' && !indexerBase) {
        if (ac.signal.aborted) return;
        setIsLoading(false);
        setData(null);
        setError(orderbookIndexerNotConfiguredMessage());
        return;
      }

      if (useIndexerPath) {
        if (!indexerBase) {
          if (ac.signal.aborted) return;
          setIsLoading(false);
          setData(null);
          setError(orderbookIndexerNotConfiguredMessage());
          return;
        }
        void runIndexer(true);
        return;
      }

      void runSdk(true);
    };

    runOnce();

    const canPoll = (useIndexerPath && Boolean(indexerBase)) || !useIndexerPath;
    const useInterval = canPoll && pollIntervalMs != null && pollIntervalMs > 0;
    let interval: number | null = null;

    if (useInterval) {
      interval = window.setInterval(() => {
        if (useIndexerPath && indexerBase) {
          void runIndexer(false);
        } else {
          void runSdk(false);
        }
      }, pollIntervalMs);
    }

    return () => {
      ac.abort();
      if (interval != null) window.clearInterval(interval);
    };
  }, [
    enabled,
    poolName,
    levelsPerSide,
    level2Range,
    rangeKey,
    pollIntervalMs,
    refreshNonce,
    useIndexerPath,
    indexerBase,
    obNet,
    depthSource,
    currentNetwork,
  ]);

  return { data, error, isLoading, refresh };
}
