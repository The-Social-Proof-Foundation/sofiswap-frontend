import type { NetworkType } from '@/lib/network-utils';
import {
  getOrderbookIndexerRestBase,
  indexerOriginPathPrefix,
  orderbookIndexerNotConfiguredMessage,
} from '@/lib/orderbook-indexer/ohlcv';
import { fetchPoolOrderBook } from '@/lib/orderbook-indexer/orderbook';
import {
  fetchOrderbookIndexerPools,
  type OrderbookIndexerPoolRow,
} from '@/lib/orderbook-indexer/pools';
import { z } from 'zod';

const finiteNumber = z.union([z.number(), z.string()]).transform((value, ctx) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Expected a finite number' });
    return z.NEVER;
  }
  return parsed;
});

const summaryRowSchema = z.object({
  trading_pairs: z.string().min(1),
  base_currency: z.string().optional(),
  quote_currency: z.string().optional(),
  last_price: finiteNumber.optional(),
  highest_bid: finiteNumber.optional(),
  lowest_ask: finiteNumber.optional(),
  highest_price_24h: finiteNumber.optional(),
  lowest_price_24h: finiteNumber.optional(),
  price_change_percent_24h: finiteNumber.optional(),
  base_volume: finiteNumber.optional(),
  quote_volume: finiteNumber.optional(),
});

export type OrderbookMarketSummary = z.infer<typeof summaryRowSchema>;

export type FetchOrderbookMarketSummariesResult =
  | { ok: true; data: OrderbookMarketSummary[] }
  | { ok: false; error: string };

export function buildOrderbookSummaryUrl(baseRaw: string, poolNames?: string[]): string {
  const url = new URL('summary', indexerOriginPathPrefix(baseRaw));
  const names = (poolNames ?? []).map((n) => n.trim()).filter(Boolean);
  if (names.length > 0) {
    url.searchParams.set('pool_names', names.join(','));
  }
  return url.toString();
}

export function marketDisplayPrice(row: OrderbookMarketSummary): number | null {
  if (row.last_price != null && row.last_price > 0) return row.last_price;
  const bid = row.highest_bid != null && row.highest_bid > 0 ? row.highest_bid : null;
  const ask = row.lowest_ask != null && row.lowest_ask > 0 ? row.lowest_ask : null;
  if (bid != null && ask != null) return (bid + ask) / 2;
  return bid ?? ask;
}

export function formatTickerPrice(n: number | null): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return '—';
  if (n >= 1000) {
    return new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    }).format(n);
  }
  if (n >= 1) {
    return new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 4,
      minimumFractionDigits: 2,
    }).format(n);
  }
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 6,
    minimumFractionDigits: 2,
  }).format(n);
}

export function parseOrderbookSummaryPayload(json: unknown): OrderbookMarketSummary[] {
  const rows = Array.isArray(json)
    ? json
    : json && typeof json === 'object' && Array.isArray((json as { markets?: unknown }).markets)
      ? (json as { markets: unknown[] }).markets
      : [];
  const out: OrderbookMarketSummary[] = [];
  for (const row of rows) {
    const parsed = summaryRowSchema.safeParse(row);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

type MarketDepthQuote = {
  bid?: number;
  ask?: number;
};

function positiveOrUndefined(value: number | undefined): number | undefined {
  return value != null && Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * Keep the ticker catalog-complete even when /summary is temporarily missing
 * a newly registered or not-yet-traded pool. Catalog order is preserved and
 * summary-only rows are appended for forwards compatibility.
 */
export function mergeOrderbookMarketSummaries(
  pools: OrderbookIndexerPoolRow[],
  summaries: OrderbookMarketSummary[],
  depthQuotes: ReadonlyMap<string, MarketDepthQuote> = new Map()
): OrderbookMarketSummary[] {
  const summaryByName = new Map(
    summaries.map((summary) => [summary.trading_pairs.trim().toUpperCase(), summary])
  );
  const included = new Set<string>();
  const merged: OrderbookMarketSummary[] = pools.map((pool) => {
    const name = pool.pool_name.trim();
    const key = name.toUpperCase();
    const summary = summaryByName.get(key);
    const quote = depthQuotes.get(key);
    included.add(key);

    return {
      trading_pairs: name,
      base_currency: summary?.base_currency || pool.base_asset_symbol,
      quote_currency: summary?.quote_currency || pool.quote_asset_symbol,
      last_price: summary?.last_price,
      highest_bid: positiveOrUndefined(summary?.highest_bid) ?? quote?.bid,
      lowest_ask: positiveOrUndefined(summary?.lowest_ask) ?? quote?.ask,
      highest_price_24h: summary?.highest_price_24h,
      lowest_price_24h: summary?.lowest_price_24h,
      price_change_percent_24h: summary?.price_change_percent_24h,
      base_volume: summary?.base_volume,
      quote_volume: summary?.quote_volume,
    };
  });

  for (const summary of summaries) {
    const key = summary.trading_pairs.trim().toUpperCase();
    if (!included.has(key)) merged.push(summary);
  }

  return merged;
}

async function fetchMissingDepthQuotes(input: {
  network: NetworkType;
  pools: OrderbookIndexerPoolRow[];
  summaries: OrderbookMarketSummary[];
  signal?: AbortSignal;
}): Promise<Map<string, MarketDepthQuote>> {
  const summariesByName = new Map(
    input.summaries.map((summary) => [summary.trading_pairs.trim().toUpperCase(), summary])
  );
  const missing = input.pools.filter((pool) => {
    const summary = summariesByName.get(pool.pool_name.trim().toUpperCase());
    return !summary || marketDisplayPrice(summary) == null;
  });
  const quotes = new Map<string, MarketDepthQuote>();
  let cursor = 0;

  const worker = async () => {
    while (cursor < missing.length) {
      const pool = missing[cursor++];
      if (!pool) return;
      const result = await fetchPoolOrderBook({
        network: input.network,
        poolName: pool.pool_name,
        levelsPerSide: 1,
        signal: input.signal,
      });
      if (!result.ok) continue;
      quotes.set(pool.pool_name.trim().toUpperCase(), {
        bid: result.data.bids[0]?.price,
        ask: result.data.asks.at(-1)?.price,
      });
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(6, missing.length) }, () => worker())
  );
  return quotes;
}

async function readSummaryResponse(
  res: Response
): Promise<{ ok: true; data: OrderbookMarketSummary[] } | { ok: false; status: number; body: string }> {
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return { ok: false, status: res.status, body };
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, status: res.status, body: 'not-json' };
  }
  return { ok: true, data: parseOrderbookSummaryPayload(json) };
}

/**
 * `GET {base}summary` — last, bid/ask, and 24h stats for indexed pools.
 * Some hosts require `pool_names`; we then resolve names from `GET /get_pools`.
 */
export async function fetchOrderbookMarketSummaries(input: {
  network: NetworkType;
  signal?: AbortSignal;
}): Promise<FetchOrderbookMarketSummariesResult> {
  const base = getOrderbookIndexerRestBase(input.network);
  if (!base) {
    return { ok: false, error: orderbookIndexerNotConfiguredMessage() };
  }

  const headers = { Accept: 'application/json' };
  let first:
    | { ok: true; data: OrderbookMarketSummary[] }
    | { ok: false; status: number; body: string };
  try {
    const res = await fetch(buildOrderbookSummaryUrl(base), {
      signal: input.signal,
      cache: 'no-store',
      headers,
    });
    first = await readSummaryResponse(res);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    const msg = e instanceof Error ? e.message : String(e);
    first = { ok: false, status: 0, body: `Failed to reach summary: ${msg}` };
  }

  const pools = await fetchOrderbookIndexerPools({
    network: input.network,
    signal: input.signal,
  });

  if (pools.ok) {
    const summaries = first.ok ? first.data : [];
    const depthQuotes = await fetchMissingDepthQuotes({
      network: input.network,
      pools: pools.data,
      summaries,
      signal: input.signal,
    });
    return {
      ok: true,
      data: mergeOrderbookMarketSummaries(pools.data, summaries, depthQuotes),
    };
  }

  if (first.ok) return { ok: true, data: first.data };
  const summaryHint = first.body ? ` — ${first.body.slice(0, 160)}` : '';
  return {
    ok: false,
    error: `Summary returned ${first.status}${summaryHint}; pools unavailable — ${pools.error}`,
  };
}
