import type { OrderBookSnapshot } from '@/lib/trade/orderbook-types';
import { indexerOriginPathPrefix, readOrderbookIndexerBaseUrl } from '@/lib/orderbook-indexer/ohlcv';
import { z } from 'zod';

const levelSchema = z.object({
  price: z.number(),
  size: z.number(),
});

/**
 * Expected JSON shape once the indexer exposes depth — adjust to match the real API.
 * GET `{NEXT_PUBLIC_ORDERBOOK_INDEXER_URL}orderbook/{poolName}`
 */
const orderbookResponseSchema = z.object({
  asks: z.array(levelSchema),
  bids: z.array(levelSchema),
  mid_price: z.number().optional(),
  midPrice: z.number().optional(),
  change_fraction: z.number().optional(),
  changeFraction: z.number().optional(),
});

export type FetchPoolOrderBookResult =
  | { ok: true; data: OrderBookSnapshot }
  | { ok: false; error: string };

export function buildPoolOrderBookUrl(baseRaw: string, poolName: string): string {
  const base = indexerOriginPathPrefix(baseRaw);
  const rel = `orderbook/${encodeURIComponent(poolName)}`;
  return new URL(rel, base).toString();
}

function normalizeSnapshot(parsed: z.infer<typeof orderbookResponseSchema>): OrderBookSnapshot {
  const midPrice = parsed.mid_price ?? parsed.midPrice;
  const changeFraction = parsed.change_fraction ?? parsed.changeFraction;
  return {
    /** Asks descending by price (high → low), best ask last — align with UI. */
    asks: [...parsed.asks].sort((a, b) => b.price - a.price),
    bids: [...parsed.bids].sort((a, b) => b.price - a.price),
    midPrice,
    changeFraction,
  };
}

export async function fetchPoolOrderBook(input: {
  poolName: string;
  signal?: AbortSignal;
}): Promise<FetchPoolOrderBookResult> {
  const base = readOrderbookIndexerBaseUrl();
  if (!base) {
    return {
      ok: false,
      error: 'Orderbook indexer URL is not configured (NEXT_PUBLIC_ORDERBOOK_INDEXER_URL).',
    };
  }

  const url = buildPoolOrderBookUrl(base, input.poolName);
  let res: Response;
  try {
    res = await fetch(url, { signal: input.signal, cache: 'no-store' });
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
    return { ok: false, error: 'Indexer response was not valid JSON.' };
  }

  const parsed = orderbookResponseSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, error: 'Unexpected order book response shape from indexer.' };
  }

  return { ok: true, data: normalizeSnapshot(parsed.data) };
}
