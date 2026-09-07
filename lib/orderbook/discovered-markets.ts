import type { CoinMap, PoolMap } from '@socialproof/orderbook';
import type { NetworkType } from '@/lib/network-utils';

export type DiscoveredOrderbookMarkets = { coins: CoinMap; pools: PoolMap };
const markets = new Map<NetworkType, DiscoveredOrderbookMarkets>();
const revisions = new Map<NetworkType, number>();

export function getDiscoveredOrderbookMarkets(network: NetworkType) { return markets.get(network); }
export function orderbookMarketRevision(network: NetworkType) { return revisions.get(network) ?? 0; }
export function setDiscoveredOrderbookMarkets(network: NetworkType, value: DiscoveredOrderbookMarkets) {
  if (JSON.stringify(markets.get(network)) === JSON.stringify(value)) return;
  markets.set(network, value);
  revisions.set(network, orderbookMarketRevision(network) + 1);
}
