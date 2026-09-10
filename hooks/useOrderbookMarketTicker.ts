'use client';

import { useCallback } from 'react';

import { usePolledResource } from '@/hooks/usePolledResource';
import type { NetworkType } from '@/lib/network-utils';
import {
  fetchOrderbookMarketSummaries,
  type OrderbookMarketSummary,
} from '@/lib/orderbook-indexer/ticker';

const REFRESH_INTERVAL_MS = 12_000;

export function useOrderbookMarketTicker(network: NetworkType): {
  markets: OrderbookMarketSummary[];
  hasLiveData: boolean;
  isLoading: boolean;
  error: string | null;
} {
  const load = useCallback(async () => {
    const result = await fetchOrderbookMarketSummaries({ network });
    if (!result.ok) throw new Error(result.error);
    return result.data;
  }, [network]);
  const resource = usePolledResource(`orderbook-ticker:${network}`, load, REFRESH_INTERVAL_MS);
  const markets = resource.data ?? [];
  return {
    markets,
    hasLiveData: markets.length > 0,
    isLoading: resource.isLoading,
    error: resource.error,
  };
}
