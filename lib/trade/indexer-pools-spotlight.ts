import type { SpotlightItem } from '@sehaj23/react-spotlight-search';

import type { OrderbookIndexerPoolRow } from '@/lib/orderbook-indexer/pools';
import type { NetworkType } from '@/lib/network-utils';
import { spotAssetSymbolDisplay } from '@/lib/trade/trade-pool-catalog';

function spotlightSortScore(poolName: string): number {
  if (poolName === 'MYSO_MYUSD') return 0;
  if (poolName === 'BTC_MYUSD') return 1;
  if (poolName === 'ETH_MYUSD') return 2;
  if (poolName === 'MYSO_USDC') return 3;
  if (poolName === 'MYUSD_USDC') return 4;
  if (poolName.startsWith('MYSO_')) return 10;
  return 50;
}

/**
 * Spotlight rows from GET /get_pools — every indexed spot market.
 */
export function spotlightItemsFromIndexerPools(
  _network: NetworkType,
  pools: OrderbookIndexerPoolRow[]
): SpotlightItem[] {
  const rows = [...pools];
  rows.sort((a, b) => {
    const d = spotlightSortScore(a.pool_name) - spotlightSortScore(b.pool_name);
    if (d !== 0) return d;
    return a.pool_name.localeCompare(b.pool_name);
  });

  return rows.map((p) => {
    const base = p.base_asset_symbol.trim();
    const quote = p.quote_asset_symbol.trim();
    const dispB = spotAssetSymbolDisplay(base);
    const dispQ = spotAssetSymbolDisplay(quote);
    const name = `${dispB} / ${dispQ}`;
    const id = p.pool_name.trim();

    const poolIdShort =
      p.pool_id.length > 18 ? `${p.pool_id.slice(0, 10)}…${p.pool_id.slice(-6)}` : p.pool_id;

    return {
      id,
      name,
      url: '/trade',
      tags: Array.from(
        new Set([
          base,
          quote,
          dispB,
          dispQ,
          p.pool_name,
          p.pool_name.toLowerCase(),
          p.pool_id,
          poolIdShort,
          'pool',
          p.base_asset_name ?? '',
          p.quote_asset_name ?? '',
        ])
      ).filter(Boolean),
    };
  });
}
