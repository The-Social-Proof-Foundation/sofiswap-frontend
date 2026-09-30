'use client';

import { useCallback, useEffect, useState } from 'react';

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

  /**
   * Keep the last summaries while a refresh is in flight or fails: a blank ticker made the header
   * price flash to an em dash between polls. Keyed by network so a switch cannot show the other
   * chain's quotes.
   */
  const [lastGood, setLastGood] = useState<{ network: NetworkType; markets: OrderbookMarketSummary[] } | null>(null);
  useEffect(() => {
    if (resource.data && resource.data.length > 0) {
      setLastGood({ network, markets: resource.data });
    }
  }, [resource.data, network]);
  const markets = lastGood?.network === network ? lastGood.markets : [];

  return {
    markets,
    hasLiveData: markets.length > 0,
    isLoading: resource.isLoading,
    error: resource.error,
  };
}
