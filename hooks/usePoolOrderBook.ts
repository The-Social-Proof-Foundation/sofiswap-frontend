'use client';

import { readOrderbookIndexerBaseUrl } from '@/lib/orderbook-indexer/ohlcv';
import { fetchPoolOrderBook } from '@/lib/orderbook-indexer/orderbook';
import { mockOrderBookSnapshot } from '@/lib/trade/mock-orderbook-data';
import type { OrderBookSnapshot } from '@/lib/trade/orderbook-types';
import { useCallback, useEffect, useState } from 'react';

function useMockOrderbookData(): boolean {
  const base = readOrderbookIndexerBaseUrl();
  if (!base) return true;
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_TRADE_MOCK_DATA === 'true') {
    return true;
  }
  return false;
}

export type UsePoolOrderBookArgs = {
  poolName: string;
  /** Depth levels to generate / expect per side (panel may show fewer). */
  levelsPerSide?: number;
  pollIntervalMs?: number;
  enabled?: boolean;
};

export function usePoolOrderBook({
  poolName,
  levelsPerSide = 18,
  pollIntervalMs,
  enabled = true,
}: UsePoolOrderBookArgs): {
  data: OrderBookSnapshot | null;
  error: string | null;
  isLoading: boolean;
  refresh: () => void;
} {
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

    const mock = useMockOrderbookData();
    const ac = new AbortController();
    setIsLoading(true);
    setError(null);

    const run = () => {
      if (mock) {
        if (ac.signal.aborted) return;
        setIsLoading(false);
        setData(mockOrderBookSnapshot(poolName.trim(), levelsPerSide));
        setError(null);
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
    };

    run();

    const useInterval = !mock && pollIntervalMs != null && pollIntervalMs > 0;
    const interval = useInterval
      ? window.setInterval(() => {
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
        }, pollIntervalMs)
      : null;

    return () => {
      ac.abort();
      if (interval != null) window.clearInterval(interval);
    };
  }, [enabled, poolName, levelsPerSide, pollIntervalMs, refreshNonce]);

  return { data, error, isLoading, refresh };
}
