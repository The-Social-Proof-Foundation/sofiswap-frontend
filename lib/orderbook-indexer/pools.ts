import type { CoinMap, PoolMap } from '@socialproof/orderbook';
import type { NetworkType } from '@/lib/network-utils';
import type { DiscoveredOrderbookMarkets } from '@/lib/orderbook/discovered-markets';
import {
  getOrderbookIndexerRestBase,
  indexerOriginPathPrefix,
  orderbookIndexerNotConfiguredMessage,
} from '@/lib/orderbook-indexer/ohlcv';
import { z } from 'zod';

const orderbookIndexerPoolRowSchema = z.object({
  pool_id: z.string().min(1),
  pool_name: z.string().min(1),
  base_asset_id: z.string().optional(),
  base_asset_decimals: z.number().optional(),
  base_asset_symbol: z.string().min(1),
  base_asset_name: z.string().optional(),
  quote_asset_id: z.string().optional(),
  quote_asset_decimals: z.number().optional(),
  quote_asset_symbol: z.string().min(1),
  quote_asset_name: z.string().optional(),
  min_size: z.number().optional(),
  lot_size: z.number().optional(),
  tick_size: z.number().optional(),
});

export type OrderbookIndexerPoolRow = z.infer<typeof orderbookIndexerPoolRowSchema>;

export function buildGetPoolsUrl(baseRaw: string): string {
  const base = indexerOriginPathPrefix(baseRaw);
  return new URL('get_pools', base).toString();
}

export const orderbookIndexerPoolsArraySchema = z.array(orderbookIndexerPoolRowSchema);

export type FetchOrderbookIndexerPoolsResult =
  | { ok: true; data: OrderbookIndexerPoolRow[] }
  | { ok: false; error: string };

export async function fetchOrderbookIndexerPools(input: {
  network: NetworkType;
  signal?: AbortSignal;
}): Promise<FetchOrderbookIndexerPoolsResult> {
  const rawBase = getOrderbookIndexerRestBase(input.network);
  if (!rawBase) {
    return { ok: false, error: orderbookIndexerNotConfiguredMessage() };
  }

  const url = buildGetPoolsUrl(rawBase);
  let res: Response;
  try {
    res = await fetch(url, {
      signal: input.signal,
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Failed to reach indexer: ${msg}` };
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const hint = body ? ` — ${body.slice(0, 200)}` : '';
    return { ok: false, error: `Indexer returned ${res.status}${hint}` };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, error: 'Indexer pools response was not valid JSON.' };
  }

  const parsed = orderbookIndexerPoolsArraySchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, error: 'Unexpected GET /get_pools response shape.' };
  }

  return { ok: true, data: parsed.data };
}

function coinSymbolKey(symbol: string): string {
  return symbol.trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

function coinEntry(
  type: string | undefined,
  decimals: number | undefined
): CoinMap[string] | null {
  if (!type?.includes('::') || decimals == null || decimals < 0 || decimals > 15) return null;
  return {
    address: type.split('::')[0] ?? type,
    type,
    scalar: 10 ** decimals,
  };
}

/** Map GET /get_pools rows into the same coin/pool shape GraphQL discovery writes. */
export function discoveredMarketsFromIndexerPools(
  rows: OrderbookIndexerPoolRow[]
): DiscoveredOrderbookMarkets {
  const coins: CoinMap = {};
  const pools: PoolMap = {};
  for (const row of rows) {
    const base = coinSymbolKey(row.base_asset_symbol);
    const quote = coinSymbolKey(row.quote_asset_symbol);
    if (!base || !quote) continue;
    const baseCoin = coinEntry(row.base_asset_id, row.base_asset_decimals);
    const quoteCoin = coinEntry(row.quote_asset_id, row.quote_asset_decimals);
    if (baseCoin) coins[base] = baseCoin;
    if (quoteCoin) coins[quote] = quoteCoin;
    const key = row.pool_name.trim();
    if (!key) continue;
    pools[key] = { address: row.pool_id, baseCoin: base, quoteCoin: quote };
  }
  return { coins, pools };
}
