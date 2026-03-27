'use client';

import { useAdaptiveTradePollMs } from '@/hooks/useAdaptiveTradePollMs';
import { readOrderbookIndexerBaseUrl } from '@/lib/orderbook-indexer/ohlcv';
import { fetchPoolTrades } from '@/lib/orderbook-indexer/trades';
import type { TradePrint } from '@/lib/trade/orderbook-types';
import { useCallback, useEffect, useState } from 'react';

export type UsePoolTradesArgs = {
  poolName: string;
  tradeRows?: number;
  pollIntervalMs?: number;
  enabled?: boolean;
};

export function usePoolTrades({
  poolName,
  pollIntervalMs: pollIntervalMsProp,
  enabled = true,
}: UsePoolTradesArgs): {
  data: TradePrint[];
  error: string | null;
  isLoading: boolean;
  refresh: () => void;
} {
  const adaptiveMs = useAdaptiveTradePollMs(3000);
  const pollIntervalMs = pollIntervalMsProp ?? adaptiveMs;
  const [data, setData] = useState<TradePrint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const refresh = useCallback(() => {
    setRefreshNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!enabled || !poolName.trim()) {
      setData([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    const indexerBase = readOrderbookIndexerBaseUrl();
    if (!indexerBase) {
      setData([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    const ac = new AbortController();
    setIsLoading(true);
    setError(null);

    const run = () => {
      void fetchPoolTrades({ poolName: poolName.trim(), signal: ac.signal })
        .then((res) => {
          if (ac.signal.aborted) return;
          setIsLoading(false);
          if (res.ok) {
            setData(res.data);
            setError(null);
          } else {
            setData([]);
            setError(res.error);
          }
        })
        .catch((e) => {
          if (e instanceof DOMException && e.name === 'AbortError') return;
          setIsLoading(false);
          setData([]);
          setError(e instanceof Error ? e.message : String(e));
        });
    };

    run();

    const useInterval = pollIntervalMs != null && pollIntervalMs > 0;
    const interval = useInterval
      ? window.setInterval(() => {
          void fetchPoolTrades({ poolName: poolName.trim(), signal: ac.signal })
            .then((res) => {
              if (ac.signal.aborted) return;
              if (res.ok) {
                setData(res.data);
                setError(null);
              } else {
                setData([]);
                setError(res.error);
              }
            })
            .catch((e) => {
              if (e instanceof DOMException && e.name === 'AbortError') return;
              setData([]);
              setError(e instanceof Error ? e.message : String(e));
            });
        }, pollIntervalMs)
      : null;

    return () => {
      ac.abort();
      if (interval != null) window.clearInterval(interval);
    };
  }, [enabled, poolName, pollIntervalMs, refreshNonce]);

  return { data, error, isLoading, refresh };
}
