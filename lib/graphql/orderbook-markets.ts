import type { CoinMap, PoolMap } from '@socialproof/orderbook';
import { getMySoGraphQLClient } from '@/lib/myso-graphql-client';
import type { NetworkType } from '@/lib/network-utils';
import { getResolvedOrderbookDeployment } from '@/lib/orderbook/config';
import { setDiscoveredOrderbookMarkets } from '@/lib/orderbook/discovered-markets';

export const ORDERBOOK_MARKETS_QUERY = /* GraphQL */ `
  query SofiSwapOrderbookMarkets($type: String!, $after: String) {
    objects(filter: { type: $type, ownerKind: SHARED }, first: 50, after: $after) {
      nodes { address asMoveObject { contents { type { repr } } } }
      pageInfo { endCursor hasNextPage }
    }
  }
`;
export const ORDERBOOK_COIN_METADATA_QUERY = /* GraphQL */ `
  query SofiSwapOrderbookCoinMetadata($type: String!) {
    coinMetadata(coinType: $type) { symbol decimals }
  }
`;

/** Split generic arguments without breaking nested coin types. */
export function poolCoinTypes(type: string): [string, string] | null {
  const start = type.indexOf('<');
  if (start < 0 || !type.endsWith('>')) return null;
  const body = type.slice(start + 1, -1);
  let depth = 0;
  for (let i = 0; i < body.length; i += 1) {
    if (body[i] === '<') depth += 1;
    if (body[i] === '>') depth -= 1;
    if (body[i] === ',' && depth === 0) return [body.slice(0, i).trim(), body.slice(i + 1).trim()];
  }
  return null;
}

/** Discovers deployed pools and decimals from this network, including fresh local genesis. */
export async function refreshOrderbookMarkets(network: NetworkType) {
  const client = getMySoGraphQLClient(network);
  const { orderbookPackageId } = getResolvedOrderbookDeployment(network);
  const rows: Array<{ address: string; types: [string, string] }> = [];
  let after: string | null = null;
  do {
    const response = await client.query<{
      objects: { nodes: Array<{ address: string; asMoveObject: { contents: { type: { repr: string } } | null } | null }>; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
    }>({ query: ORDERBOOK_MARKETS_QUERY, variables: { type: `${orderbookPackageId}::pool::Pool`, after } });
    if (response.errors?.length) throw new Error(response.errors.map((e) => e.message).join('; '));
    if (!response.data?.objects) throw new Error('Could not load markets for this network.');
    for (const row of response.data.objects.nodes) {
      const types = poolCoinTypes(row.asMoveObject?.contents?.type.repr || '');
      if (types) rows.push({ address: row.address, types });
    }
    const page: { hasNextPage: boolean; endCursor: string | null } = response.data.objects.pageInfo;
    after = page.hasNextPage ? page.endCursor : null;
  } while (after);
  const types = Array.from(new Set(rows.flatMap((row) => row.types))).sort();
  const coins: CoinMap = {};
  const keys = new Map<string, string>();
  // Bounded batches avoid flooding the GraphQL service on large deployments.
  for (let i = 0; i < types.length; i += 8) {
    const metadata = await Promise.all(types.slice(i, i + 8).map(async (type) => {
      const result = await client.query<{ coinMetadata: { symbol: string | null; decimals: number | null } | null }>({
        query: ORDERBOOK_COIN_METADATA_QUERY, variables: { type },
      });
      if (result.errors?.length) throw new Error(result.errors.map((e) => e.message).join('; '));
      return { type, meta: result.data?.coinMetadata };
    }));
    for (const { type, meta } of metadata) {
      if (!meta?.symbol || meta.decimals == null || meta.decimals < 0 || meta.decimals > 15) continue;
      const symbol = meta.symbol.trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase() || 'TOKEN';
      // Different Move types may share a ticker. Keep their balances and trades distinct.
      const key = coins[symbol] ? `${symbol}-${type}` : symbol;
      coins[key] = { address: type.split('::')[0], type, scalar: 10 ** meta.decimals };
      keys.set(type, key);
    }
  }
  const pools: PoolMap = {};
  for (const row of rows.sort((a, b) => a.address.localeCompare(b.address))) {
    const baseCoin = keys.get(row.types[0]);
    const quoteCoin = keys.get(row.types[1]);
    if (!baseCoin || !quoteCoin) continue;
    const pair = `${baseCoin}_${quoteCoin}`;
    const key = pools[pair] ? `${pair}-${row.address.slice(2)}` : pair;
    pools[key] = { address: row.address, baseCoin, quoteCoin };
  }
  const result = { coins, pools };
  setDiscoveredOrderbookMarkets(network, result);
  return result;
}
