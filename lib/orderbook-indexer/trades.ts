import type { TradePrint } from '@/lib/trade/orderbook-types';
import { indexerOriginPathPrefix, readOrderbookIndexerBaseUrl } from '@/lib/orderbook-indexer/ohlcv';
import { z } from 'zod';

/**
 * Expected JSON shape once the indexer exposes prints — adjust to match the real API.
 * GET `{NEXT_PUBLIC_ORDERBOOK_INDEXER_URL}trades/{poolName}`
 */
const tradesResponseSchema = z.object({
  trades: z.array(
    z.object({
      price: z.number(),
      size: z.number(),
      side: z.enum(['buy', 'sell']),
    })
  ),
});

export type FetchPoolTradesResult =
  | { ok: true; data: TradePrint[] }
  | { ok: false; error: string };

export function buildPoolTradesUrl(baseRaw: string, poolName: string): string {
  const base = indexerOriginPathPrefix(baseRaw);
  const rel = `trades/${encodeURIComponent(poolName)}`;
  return new URL(rel, base).toString();
}

export async function fetchPoolTrades(input: {
  poolName: string;
  signal?: AbortSignal;
}): Promise<FetchPoolTradesResult> {
  const base = readOrderbookIndexerBaseUrl();
  if (!base) {
    return {
      ok: false,
      error: 'Orderbook indexer URL is not configured (NEXT_PUBLIC_ORDERBOOK_INDEXER_URL).',
    };
  }

  const url = buildPoolTradesUrl(base, input.poolName);
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

  const parsed = tradesResponseSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, error: 'Unexpected trades response shape from indexer.' };
  }

  return { ok: true, data: parsed.data.trades };
}
