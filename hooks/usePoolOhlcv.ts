'use client';

import type { CandlestickData } from 'lightweight-charts';
import { useCallback, useEffect, useState } from 'react';

import { useAdaptiveTradePollMs } from '@/hooks/useAdaptiveTradePollMs';
import {
  type OhlcvInterval,
  fetchPoolOhlcv,
} from '@/lib/orderbook-indexer/ohlcv';
import { useNetwork } from '@/lib/network-provider';

export type UsePoolOhlcvArgs = {
  poolName: string;
  interval: OhlcvInterval;
  /** Passed to indexer as `start_time` (**milliseconds** since epoch). */
  startTime?: number;
  /** Passed to indexer as `end_time` (**milliseconds** since epoch). */
  endTime?: number;
  limit?: number;
  pollIntervalMs?: number;
  /** When false, no request is made (e.g. gate not ready). */
  enabled?: boolean;
};

export function usePoolOhlcv({
  poolName,
  interval,
  startTime,
  endTime,
  limit,
  pollIntervalMs: pollIntervalMsProp,
  enabled = true,
}: UsePoolOhlcvArgs): {
  data: CandlestickData[] | null;
  error: string | null;
  isLoading: boolean;
  refresh: () => void;
} {
  const { currentNetwork } = useNetwork();
  const adaptiveMs = useAdaptiveTradePollMs(8000);
  const pollIntervalMs = pollIntervalMsProp ?? adaptiveMs;
  const [data, setData] = useState<CandlestickData[] | null>(null);
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

    const run = (endInitialLoading: boolean) =>
      fetchPoolOhlcv({
        network: currentNetwork,
        poolName: poolName.trim(),
        interval,
        startTime,
        endTime,
        limit,
        signal: ac.signal,
      })
        .then((res) => {
          if (ac.signal.aborted) return;
          if (endInitialLoading) setIsLoading(false);
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
          if (endInitialLoading) setIsLoading(false);
          setData(null);
          setError(e instanceof Error ? e.message : String(e));
        });

    void run(true);

    const intervalId =
      pollIntervalMs != null && pollIntervalMs > 0
        ? window.setInterval(() => {
            void run(false);
          }, pollIntervalMs)
        : null;

    return () => {
      ac.abort();
      if (intervalId != null) window.clearInterval(intervalId);
    };
  }, [
    enabled,
    poolName,
    interval,
    startTime,
    endTime,
    limit,
    pollIntervalMs,
    refreshNonce,
    currentNetwork,
  ]);

  return { data, error, isLoading, refresh };
}
