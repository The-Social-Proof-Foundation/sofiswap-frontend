import type { NetworkType } from '@/lib/network-utils';
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
