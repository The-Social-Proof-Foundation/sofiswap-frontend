'use client';

import { readOrderbookIndexerBaseUrl } from '@/lib/orderbook-indexer/ohlcv';
import { fetchPoolTrades } from '@/lib/orderbook-indexer/trades';
import { mockTradeHistory } from '@/lib/trade/mock-orderbook-data';
import type { TradePrint } from '@/lib/trade/orderbook-types';
import { useCallback, useEffect, useState } from 'react';

function useMockTradesData(): boolean {
  const base = readOrderbookIndexerBaseUrl();
  if (!base) return true;
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_TRADE_MOCK_DATA === 'true') {
    return true;
  }
  return false;
}

export type UsePoolTradesArgs = {
  poolName: string;
  tradeRows?: number;
  pollIntervalMs?: number;
  enabled?: boolean;
};

export function usePoolTrades({
  poolName,
  tradeRows = 48,
  pollIntervalMs,
  enabled = true,
}: UsePoolTradesArgs): {
  data: TradePrint[];
  error: string | null;
  isLoading: boolean;
  refresh: () => void;
} {
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

    const mock = useMockTradesData();
    const ac = new AbortController();
    setIsLoading(true);
    setError(null);

    const run = () => {
      if (mock) {
        if (ac.signal.aborted) return;
        setIsLoading(false);
        setData(mockTradeHistory(poolName.trim(), tradeRows));
        setError(null);
        return;
      }

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

    const useInterval = !mock && pollIntervalMs != null && pollIntervalMs > 0;
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
  }, [enabled, poolName, tradeRows, pollIntervalMs, refreshNonce]);

  return { data, error, isLoading, refresh };
}
