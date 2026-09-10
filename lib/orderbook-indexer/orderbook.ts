import type { OrderBookSnapshot } from '@/lib/trade/orderbook-types';
import type { NetworkType } from '@/lib/network-utils';
import {
  getOrderbookIndexerRestBase,
  indexerOriginPathPrefix,
  orderbookIndexerNotConfiguredMessage,
} from '@/lib/orderbook-indexer/ohlcv';
import { z } from 'zod';

const finiteNumberSchema = z.union([z.number(), z.string()]).transform((value, ctx) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Expected a finite number' });
    return z.NEVER;
  }
  return parsed;
});

const levelSchema = z
  .union([
    z.object({ price: finiteNumberSchema, size: finiteNumberSchema }),
    z.tuple([finiteNumberSchema, finiteNumberSchema]),
  ])
  .transform((level) =>
    Array.isArray(level) ? { price: level[0], size: level[1] } : level
  );

/**
 * The live server returns `[price, size]` string tuples. Object levels and numeric
 * values remain accepted for compatibility with older deployments.
 */
const orderbookResponseSchema = z.object({
  asks: z.array(levelSchema),
  bids: z.array(levelSchema),
  mid_price: finiteNumberSchema.optional(),
  midPrice: finiteNumberSchema.optional(),
  change_fraction: finiteNumberSchema.optional(),
  changeFraction: finiteNumberSchema.optional(),
});

export type FetchPoolOrderBookResult =
  | { ok: true; data: OrderBookSnapshot }
  | { ok: false; error: string };

export function buildPoolOrderBookUrl(
  baseRaw: string,
  poolName: string,
  levelsPerSide?: number
): string {
  const base = indexerOriginPathPrefix(baseRaw);
  const rel = `orderbook/${encodeURIComponent(poolName)}`;
  const url = new URL(rel, base);
  if (levelsPerSide != null && Number.isFinite(levelsPerSide) && levelsPerSide > 0) {
    // The server's depth is the total across both sides and divides it by two.
    url.searchParams.set('depth', String(Math.max(2, Math.trunc(levelsPerSide) * 2)));
    url.searchParams.set('level', '2');
  }
  return url.toString();
}

function normalizeSnapshot(parsed: z.infer<typeof orderbookResponseSchema>): OrderBookSnapshot {
  const asks = [...parsed.asks].sort((a, b) => b.price - a.price);
  const bids = [...parsed.bids].sort((a, b) => b.price - a.price);
  const bestAsk = asks.at(-1)?.price;
  const bestBid = bids[0]?.price;
  const derivedMid =
    bestAsk != null && bestBid != null
      ? (bestAsk + bestBid) / 2
      : bestAsk ?? bestBid;
  const midPrice = parsed.mid_price ?? parsed.midPrice ?? derivedMid;
  const changeFraction = parsed.change_fraction ?? parsed.changeFraction;
  return {
    /** Asks descending by price (high → low), best ask last — align with UI. */
    asks,
    bids,
    midPrice,
    changeFraction,
  };
}

export async function fetchPoolOrderBook(input: {
  network: NetworkType;
  poolName: string;
  levelsPerSide?: number;
  signal?: AbortSignal;
}): Promise<FetchPoolOrderBookResult> {
  const base = getOrderbookIndexerRestBase(input.network);
  if (!base) {
    return {
      ok: false,
      error: orderbookIndexerNotConfiguredMessage(),
    };
  }

  const url = buildPoolOrderBookUrl(base, input.poolName, input.levelsPerSide);
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
