'use client';

import { useAdaptiveTradePollMs } from '@/hooks/useAdaptiveTradePollMs';
import { getOrderbookIndexerRestBase } from '@/lib/orderbook-indexer/ohlcv';
import {
  DEFAULT_POOL_TRADES_LIMIT,
  fetchAccountTradeHistory,
} from '@/lib/orderbook-indexer/trades';
import { useNetwork } from '@/lib/network-provider';
import type { UserTradeHistoryRow } from '@/lib/trade/activity-tables';
import { useCallback, useEffect, useState } from 'react';

export type UseAccountTradeHistoryArgs = {
  poolName: string;
  balanceManagerId: string | null;
  tradeRows?: number;
  pollIntervalMs?: number;
  enabled?: boolean;
};

/**
 * Fetches the signed-in user's trade history for a single pool from the indexer,
 * filtered by `balance_manager_id`. Drives the "My Trades" tab in the activity panel.
 */
export function useAccountTradeHistory({
  poolName,
  balanceManagerId,
  tradeRows = DEFAULT_POOL_TRADES_LIMIT,
  pollIntervalMs: pollIntervalMsProp,
  enabled = true,
}: UseAccountTradeHistoryArgs): {
  data: UserTradeHistoryRow[];
  error: string | null;
  isLoading: boolean;
  refresh: () => void;
} {
  const { currentNetwork } = useNetwork();
  const adaptiveMs = useAdaptiveTradePollMs(3000);
  const pollIntervalMs = pollIntervalMsProp ?? adaptiveMs;
  const [data, setData] = useState<UserTradeHistoryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const refresh = useCallback(() => {
    setRefreshNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!enabled || !poolName.trim() || !balanceManagerId) {
      setData([]);
      setError(null);
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

    let cancelled = false;
    let inFlight = false;
    const controller = new AbortController();

    const run = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      setIsLoading(true);
      try {
        const result = await fetchAccountTradeHistory({
          network: currentNetwork,
          poolName: poolName.trim(),
          balanceManagerId,
          limit: tradeRows,
          signal: controller.signal,
        });
        if (cancelled) return;
        if (result.ok) {
          setData(result.data);
          setError(null);
        } else {
          setData([]);
          setError(result.error);
        }
      } catch (e) {
        if (cancelled || (e instanceof DOMException && e.name === 'AbortError')) return;
        setData([]);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        inFlight = false;
        if (!cancelled) setIsLoading(false);
      }
    };

    void run();

    const useInterval = pollIntervalMs != null && pollIntervalMs > 0;
    const interval = useInterval
      ? window.setInterval(() => {
          void run();
        }, pollIntervalMs)
      : null;

    return () => {
      cancelled = true;
      controller.abort();
      if (interval != null) window.clearInterval(interval);
    };
  }, [
    enabled,
    currentNetwork,
    poolName,
    balanceManagerId,
    tradeRows,
    pollIntervalMs,
    refreshNonce,
  ]);

  return { data, error, isLoading, refresh };
}
