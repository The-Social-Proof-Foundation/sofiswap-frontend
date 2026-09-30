'use client';

import { useAdaptiveTradePollMs } from '@/hooks/useAdaptiveTradePollMs';
import { getOrderbookIndexerRestBase } from '@/lib/orderbook-indexer/ohlcv';
import { DEFAULT_POOL_TRADES_LIMIT, fetchPoolTrades } from '@/lib/orderbook-indexer/trades';
import { useNetwork } from '@/lib/network-provider';
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
  tradeRows = DEFAULT_POOL_TRADES_LIMIT,
  pollIntervalMs: pollIntervalMsProp,
  enabled = true,
}: UsePoolTradesArgs): {
  data: TradePrint[];
  error: string | null;
  isLoading: boolean;
  refresh: () => void;
} {
  const { currentNetwork } = useNetwork();
  const adaptiveMs = useAdaptiveTradePollMs(3000);
  const pollIntervalMs = pollIntervalMsProp ?? adaptiveMs;
  const [data, setData] = useState<TradePrint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const refresh = useCallback(() => {
    setRefreshNonce((n) => n + 1);
  }, []);

  /**
   * The tape updates in place: a failed poll reports instead of emptying the list, and flipping the
   * rail tab off and on keeps the prints already received. Only a different pool drops them.
   */
  useEffect(() => {
    setData([]);
    setError(null);
  }, [poolName, tradeRows, currentNetwork]);

  useEffect(() => {
    if (!enabled || !poolName.trim()) {
      setIsLoading(false);
      return;
    }

    const indexerBase = getOrderbookIndexerRestBase(currentNetwork);
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
      void fetchPoolTrades({
        network: currentNetwork,
        poolName: poolName.trim(),
        signal: ac.signal,
        limit: tradeRows > 0 ? tradeRows : DEFAULT_POOL_TRADES_LIMIT,
      })
        .then((res) => {
          if (ac.signal.aborted) return;
          setIsLoading(false);
          if (res.ok) {
            setData(res.data);
            setError(null);
          } else {
            // Report the failure; the tape keeps its last prints.
            setError(res.error);
          }
        })
        .catch((e) => {
          if (e instanceof DOMException && e.name === 'AbortError') return;
          setIsLoading(false);
          setError(e instanceof Error ? e.message : String(e));
        });
    };

    run();

    const useInterval = pollIntervalMs != null && pollIntervalMs > 0;
    const interval = useInterval
      ? window.setInterval(() => {
          void fetchPoolTrades({
            network: currentNetwork,
            poolName: poolName.trim(),
            signal: ac.signal,
            limit: tradeRows > 0 ? tradeRows : DEFAULT_POOL_TRADES_LIMIT,
          })
            .then((res) => {
              if (ac.signal.aborted) return;
              if (res.ok) {
                setData(res.data);
                setError(null);
              } else {
                setError(res.error);
              }
            })
            .catch((e) => {
              if (e instanceof DOMException && e.name === 'AbortError') return;
              setError(e instanceof Error ? e.message : String(e));
            });
        }, pollIntervalMs)
      : null;

    return () => {
      ac.abort();
      if (interval != null) window.clearInterval(interval);
    };
  }, [enabled, poolName, tradeRows, pollIntervalMs, refreshNonce, currentNetwork]);

  return { data, error, isLoading, refresh };
}
