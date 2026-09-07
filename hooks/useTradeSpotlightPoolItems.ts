'use client';

import { useCallback } from 'react';
import { usePolledResource } from '@/hooks/usePolledResource';
import { refreshOrderbookMarkets } from '@/lib/graphql/orderbook-markets';
import type { NetworkType } from '@/lib/network-utils';
import { buildTradePoolSpotlightItems } from '@/lib/trade/pool-spotlight-items';
import { orderbookMarketRevision } from '@/lib/orderbook/discovered-markets';

export function useTradeSpotlightPoolItems(network: NetworkType) {
  const load = useCallback(async () => {
    await refreshOrderbookMarkets(network);
    return buildTradePoolSpotlightItems(network);
  }, [network]);
  const result = usePolledResource(network, load, 30_000);
  return {
    items: result.data ?? [],
    error: result.error,
    isLoading: result.isLoading,
    revalidate: result.revalidate,
    revision: orderbookMarketRevision(network),
    spotlightSource: 'graphql' as const,
  };
}
