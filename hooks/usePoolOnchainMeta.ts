'use client';

import type { OrderbookRuntimeNetwork } from '@/lib/orderbook/config';
import {
  type PoolOnchainMeta,
  fetchPoolOnchainMeta,
} from '@/lib/orderbook/pool-meta-sdk';
import { useCallback, useEffect, useState } from 'react';

export type UsePoolOnchainMetaArgs = {
  poolName: string;
  obNet: OrderbookRuntimeNetwork | null;
  pollIntervalMs?: number;
  enabled?: boolean;
};

export function usePoolOnchainMeta({
  poolName,
  obNet,
  pollIntervalMs = 45_000,
  enabled = true,
}: UsePoolOnchainMetaArgs): {
  data: PoolOnchainMeta | null;
  error: string | null;
  isLoading: boolean;
  refresh: () => void;
} {
  const [data, setData] = useState<PoolOnchainMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const refresh = useCallback(() => {
    setRefreshNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!enabled || !poolName.trim() || !obNet) {
      setData(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    const ac = new AbortController();
    setIsLoading(true);
    setError(null);

    const run = () => {
      void fetchPoolOnchainMeta({
        obNet,
        poolKey: poolName.trim(),
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

    const useInterval = pollIntervalMs != null && pollIntervalMs > 0;
    const interval = useInterval
      ? window.setInterval(() => {
          void fetchPoolOnchainMeta({
            obNet,
            poolKey: poolName.trim(),
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
        }, pollIntervalMs)
      : null;

    return () => {
      ac.abort();
      if (interval != null) window.clearInterval(interval);
    };
  }, [enabled, poolName, obNet, pollIntervalMs, refreshNonce]);

  return { data, error, isLoading, refresh };
}
