'use client';

import { useAdaptiveTradePollMs } from '@/hooks/useAdaptiveTradePollMs';
import { fetchPoolOrderBook } from '@/lib/orderbook-indexer/orderbook';
import { readOrderbookIndexerBaseUrl } from '@/lib/orderbook-indexer/ohlcv';
import { orderbookRuntimeNetwork } from '@/lib/orderbook-config';
import { useNetwork } from '@/lib/network-provider';
import { fetchPoolOrderBookFromSdk } from '@/lib/trade/fetch-pool-orderbook-sdk';
import type { OrderBookSnapshot } from '@/lib/trade/orderbook-types';
import { useCallback, useEffect, useMemo, useState } from 'react';

function readDepthSource(): 'sdk' | 'indexer' {
  const raw = process.env.NEXT_PUBLIC_ORDERBOOK_DEPTH_SOURCE?.trim().toLowerCase();
  return raw === 'indexer' ? 'indexer' : 'sdk';
}

export type UsePoolOrderBookArgs = {
  poolName: string;
  /** Depth levels per side from mid (SDK ticks). */
  levelsPerSide?: number;
  pollIntervalMs?: number;
  /** When false, no request is made. */
  enabled?: boolean;
};

export function usePoolOrderBook({
  poolName,
  levelsPerSide = 18,
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
  const indexerBase = readOrderbookIndexerBaseUrl();
  const depthSource = readDepthSource();

  const useIndexerPath = useMemo(() => {
    if (depthSource === 'indexer') return Boolean(indexerBase);
    if (!obNet) return Boolean(indexerBase);
    return false;
  }, [depthSource, indexerBase, obNet]);

  const [data, setData] = useState<OrderBookSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const refresh = useCallback(() => {
    setRefreshNonce((n) => n + 1);
  }, []);

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

    const run = () => {
      if (depthSource === 'indexer' && !indexerBase) {
        if (ac.signal.aborted) return;
        setIsLoading(false);
        setData(null);
        setError('Orderbook indexer URL is not configured (NEXT_PUBLIC_ORDERBOOK_INDEXER_URL).');
        return;
      }

      if (useIndexerPath) {
        if (!indexerBase) {
          if (ac.signal.aborted) return;
          setIsLoading(false);
          setData(null);
          setError('Orderbook indexer URL is not configured (NEXT_PUBLIC_ORDERBOOK_INDEXER_URL).');
          return;
        }
        void fetchPoolOrderBook({ poolName: poolName.trim(), signal: ac.signal })
          .then((res) => {
            if (ac.signal.aborted) return;
            setIsLoading(false);
            if (res.ok) {
              setData(res.data);
              setError(null);
            } else {
              setData(null);
              setError(res.error);
            }
          })
          .catch((e) => {
            if (e instanceof DOMException && e.name === 'AbortError') return;
            setIsLoading(false);
            setData(null);
            setError(e instanceof Error ? e.message : String(e));
          });
        return;
      }

      if (!obNet) {
        if (ac.signal.aborted) return;
        setIsLoading(false);
        setData(null);
        setError('Orderbook depth (SDK) requires mainnet or testnet.');
        return;
      }

      void fetchPoolOrderBookFromSdk({
        obNet,
        poolKey: poolName.trim(),
        ticks: levelsPerSide,
        signal: ac.signal,
      })
        .then((res) => {
          if (ac.signal.aborted) return;
          setIsLoading(false);
          if (res.ok) {
            setData(res.data);
            setError(null);
          } else {
            setData(null);
            setError(res.error);
          }
        })
        .catch((e) => {
          if (e instanceof DOMException && e.name === 'AbortError') return;
          setIsLoading(false);
          setData(null);
          setError(e instanceof Error ? e.message : String(e));
        });
    };

    run();

    const canPoll =
      (useIndexerPath && Boolean(indexerBase)) ||
      (!useIndexerPath && Boolean(obNet) && depthSource === 'sdk');

    const useInterval = canPoll && pollIntervalMs != null && pollIntervalMs > 0;
    let interval: number | null = null;

    if (useInterval) {
      interval = window.setInterval(() => {
        if (useIndexerPath && indexerBase) {
          void fetchPoolOrderBook({ poolName: poolName.trim(), signal: ac.signal })
            .then((res) => {
              if (ac.signal.aborted) return;
              if (res.ok) {
                setData(res.data);
                setError(null);
              } else {
                setData(null);
                setError(res.error);
              }
            })
            .catch((e) => {
              if (e instanceof DOMException && e.name === 'AbortError') return;
              setData(null);
              setError(e instanceof Error ? e.message : String(e));
            });
        } else if (obNet) {
          void fetchPoolOrderBookFromSdk({
            obNet,
            poolKey: poolName.trim(),
            ticks: levelsPerSide,
            signal: ac.signal,
          })
            .then((res) => {
              if (ac.signal.aborted) return;
              if (res.ok) {
                setData(res.data);
                setError(null);
              } else {
                setData(null);
                setError(res.error);
              }
            })
            .catch((e) => {
              if (e instanceof DOMException && e.name === 'AbortError') return;
              setData(null);
              setError(e instanceof Error ? e.message : String(e));
            });
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
    pollIntervalMs,
    refreshNonce,
    useIndexerPath,
    indexerBase,
    obNet,
    depthSource,
  ]);

  return { data, error, isLoading, refresh };
}
