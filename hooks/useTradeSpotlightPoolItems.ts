'use client';

import { useCallback } from 'react';
import { usePolledResource } from '@/hooks/usePolledResource';
import { refreshOrderbookMarkets } from '@/lib/graphql/orderbook-markets';
import type { NetworkType } from '@/lib/network-utils';
import { mergeDiscoveredOrderbookMarkets, orderbookMarketRevision } from '@/lib/orderbook/discovered-markets';
import {
  discoveredMarketsFromIndexerPools,
  fetchOrderbookIndexerPools,
} from '@/lib/orderbook-indexer/pools';
import {
  writeIndexerPoolsToSessionCache,
} from '@/lib/orderbook-indexer/pools-session-cache';
import { spotlightItemsFromIndexerPools } from '@/lib/trade/indexer-pools-spotlight';
import { buildTradePoolSpotlightItems } from '@/lib/trade/pool-spotlight-items';

export function useTradeSpotlightPoolItems(network: NetworkType) {
  const load = useCallback(async () => {
    const [indexer, graphql] = await Promise.allSettled([
      fetchOrderbookIndexerPools({ network }),
      refreshOrderbookMarkets(network),
    ]);

    if (indexer.status === 'fulfilled' && indexer.value.ok) {
      mergeDiscoveredOrderbookMarkets(
        network,
        discoveredMarketsFromIndexerPools(indexer.value.data)
      );
      writeIndexerPoolsToSessionCache(network, indexer.value.data);
      if (indexer.value.data.length > 0) {
        return spotlightItemsFromIndexerPools(network, indexer.value.data);
      }
    }

    if (graphql.status === 'fulfilled') {
      return buildTradePoolSpotlightItems(network);
    }

    if (indexer.status === 'fulfilled' && !indexer.value.ok) {
      throw new Error(indexer.value.error);
    }
    if (graphql.status === 'rejected') {
      throw graphql.reason instanceof Error ? graphql.reason : new Error('Could not load markets.');
    }
    return buildTradePoolSpotlightItems(network);
  }, [network]);

  const result = usePolledResource(`trade-markets:${network}`, load, 30_000);
  return {
    items: result.data ?? [],
    error: result.error,
    isLoading: result.isLoading,
    revalidate: result.revalidate,
    revision: orderbookMarketRevision(network),
    spotlightSource: 'indexer' as const,
  };
}
