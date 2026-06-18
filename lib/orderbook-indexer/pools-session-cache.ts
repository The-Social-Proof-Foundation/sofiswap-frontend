import type { NetworkType } from '@/lib/network-utils';
import {
  orderbookIndexerPoolsArraySchema,
  type OrderbookIndexerPoolRow,
} from '@/lib/orderbook-indexer/pools';
import { z } from 'zod';

const STORAGE_KEY_PREFIX = 'sofiswap_trade_pools_v1:' as const;

const sessionEnvelopeSchema = z.object({
  v: z.literal(1),
  fetchedAtMs: z.number(),
  pools: orderbookIndexerPoolsArraySchema,
});

export function indexerPoolsSessionStorageKey(network: NetworkType): string {
  return `${STORAGE_KEY_PREFIX}${network}`;
}

export function readIndexerPoolsFromSessionCache(
  network: NetworkType
): OrderbookIndexerPoolRow[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(indexerPoolsSessionStorageKey(network));
    if (!raw) return null;
    const json: unknown = JSON.parse(raw);
    const parsed = sessionEnvelopeSchema.safeParse(json);
    if (!parsed.success) return null;
    return parsed.data.pools;
  } catch {
    return null;
  }
}

export function writeIndexerPoolsToSessionCache(
  network: NetworkType,
  pools: OrderbookIndexerPoolRow[]
): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(
      indexerPoolsSessionStorageKey(network),
      JSON.stringify({ v: 1, fetchedAtMs: Date.now(), pools })
    );
  } catch {
    // Quota exceeded or disabled storage — non-fatal
  }
}
