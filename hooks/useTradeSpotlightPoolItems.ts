'use client';

import type { SpotlightItem } from '@sehaj23/react-spotlight-search';
import { useEffect, useMemo, useState } from 'react';

import { getOrderbookIndexerRestBase } from '@/lib/orderbook-indexer/ohlcv';
import {
  fetchOrderbookIndexerPools,
  type OrderbookIndexerPoolRow,
} from '@/lib/orderbook-indexer/pools';
import {
  readIndexerPoolsFromSessionCache,
  writeIndexerPoolsToSessionCache,
} from '@/lib/orderbook-indexer/pools-session-cache';
import type { NetworkType } from '@/lib/network-utils';
import { spotlightItemsFromIndexerPools } from '@/lib/trade/indexer-pools-spotlight';
import { buildTradePoolSpotlightItems } from '@/lib/trade/pool-spotlight-items';

export type TradeSpotlightPoolItemsSource = 'indexer' | 'fallback';

function applyIndexerOrFallback(
  network: NetworkType,
  pooled: OrderbookIndexerPoolRow[] | null | undefined,
  fallbackItems: SpotlightItem[]
): { next: SpotlightItem[]; src: TradeSpotlightPoolItemsSource } {
  if (pooled?.length) {
    const spotlight = spotlightItemsFromIndexerPools(network, pooled);
    if (spotlight.length > 0) {
      return { next: spotlight, src: 'indexer' };
    }
  }
  return { next: fallbackItems, src: 'fallback' };
}

/**
 * Pools shown in Spotlight: GET /get_pools once per selected network tier per tab session,
 * with SDK-backed fallback when indexer is unreachable or unset.
 */
export function useTradeSpotlightPoolItems(network: NetworkType): {
  items: SpotlightItem[];
  spotlightSource: TradeSpotlightPoolItemsSource;
} {
  const fallbackItems = useMemo(() => buildTradePoolSpotlightItems(network), [network]);

  const [items, setItems] = useState<SpotlightItem[]>(fallbackItems);
  const [spotlightSource, setSpotlightSource] =
    useState<TradeSpotlightPoolItemsSource>('fallback');

  /** Hydrate from session cache + indexer when tier changes */
  useEffect(() => {
    const base = getOrderbookIndexerRestBase(network);
    if (!base) {
      setItems(fallbackItems);
      setSpotlightSource('fallback');
      return;
    }

    const cached = readIndexerPoolsFromSessionCache(network);
    const { next, src } = applyIndexerOrFallback(network, cached ?? null, fallbackItems);
    setItems(next);
    setSpotlightSource(src);
  }, [network, fallbackItems]);

  /** Background GET /get_pools if this tier has no session cache row */
  useEffect(() => {
    const base = getOrderbookIndexerRestBase(network);
    if (!base) return;
    if ((readIndexerPoolsFromSessionCache(network)?.length ?? 0) > 0) return;

    const ac = new AbortController();

    void fetchOrderbookIndexerPools({ network, signal: ac.signal })
      .then((res) => {
        if (ac.signal.aborted) return;
        if (res.ok && res.data.length > 0) {
          writeIndexerPoolsToSessionCache(network, res.data);
          const { next, src } = applyIndexerOrFallback(network, res.data, fallbackItems);
          setItems(next);
          setSpotlightSource(src);
        }
      })
      .catch(() => {
        /* leave fallback rows */
      });

    return () => {
      ac.abort();
    };
  }, [network, fallbackItems]);

  return { items, spotlightSource };
}
