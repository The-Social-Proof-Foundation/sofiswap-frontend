'use client';

import type { CandlestickData } from 'lightweight-charts';
import { useCallback, useEffect, useState } from 'react';

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
  /** When false, no request is made (e.g. gate not ready). */
  enabled?: boolean;
};

export function usePoolOhlcv({
  poolName,
  interval,
  startTime,
  endTime,
  limit,
  enabled = true,
}: UsePoolOhlcvArgs): {
  data: CandlestickData[] | null;
  error: string | null;
  isLoading: boolean;
  refresh: () => void;
} {
  const { currentNetwork } = useNetwork();
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

    void fetchPoolOhlcv({
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

    return () => {
      ac.abort();
    };
  }, [enabled, poolName, interval, startTime, endTime, limit, refreshNonce, currentNetwork]);

  return { data, error, isLoading, refresh };
}
