import type { CandlestickData, UTCTimestamp } from 'lightweight-charts';
import { z } from 'zod';

export const OHLCV_INTERVALS = [
  '1m',
  '5m',
  '15m',
  '30m',
  '1h',
  '4h',
  '1d',
  '1w',
] as const;

export type OhlcvInterval = (typeof OHLCV_INTERVALS)[number];

const candleRowSchema = z.tuple([
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
]);

const ohlcvResponseSchema = z.object({
  candles: z.array(candleRowSchema),
});

export type IndexerCandleTuple = z.infer<typeof candleRowSchema>;

export function readOrderbookIndexerBaseUrl(): string {
  return (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_ORDERBOOK_INDEXER_URL
    ? process.env.NEXT_PUBLIC_ORDERBOOK_INDEXER_URL
    : ''
  ).trim();
}

/** Ensures `new URL(relative, base)` resolves under the indexer root (handles `base` with or without trailing slash). */
function indexerOriginPathPrefix(baseRaw: string): string {
  const trimmed = baseRaw.trim();
  if (!trimmed) return '';
  try {
    const u = new URL(trimmed);
    const path = u.pathname.replace(/\/?$/, '/');
    u.pathname = path;
    return u.toString();
  } catch {
    return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
  }
}

export function buildPoolOhlcvUrl(
  baseRaw: string,
  poolName: string,
  query: {
    interval: OhlcvInterval;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }
): string {
  const base = indexerOriginPathPrefix(baseRaw);
  const rel = `ohclv/${encodeURIComponent(poolName)}`;
  const url = new URL(rel, base);
  url.searchParams.set('interval', query.interval);
  if (query.startTime != null) url.searchParams.set('start_time', String(query.startTime));
  if (query.endTime != null) url.searchParams.set('end_time', String(query.endTime));
  if (query.limit != null) url.searchParams.set('limit', String(query.limit));
  return url.toString();
}

export function indexerTupleToCandlestick(row: IndexerCandleTuple): CandlestickData {
  const [time, open, high, low, close] = row;
  return {
    time: time as UTCTimestamp,
    open,
    high,
    low,
    close,
  };
}

export function sortCandlestickDataAscending(data: CandlestickData[]): CandlestickData[] {
  return [...data].sort((a, b) => (a.time as number) - (b.time as number));
}

export type FetchPoolOhlcvResult =
  | { ok: true; data: CandlestickData[] }
  | { ok: false; error: string };

export async function fetchPoolOhlcv(input: {
  poolName: string;
  interval: OhlcvInterval;
  startTime?: number;
  endTime?: number;
  limit?: number;
  signal?: AbortSignal;
}): Promise<FetchPoolOhlcvResult> {
  const base = readOrderbookIndexerBaseUrl();
  if (!base) {
    return { ok: false, error: 'Orderbook indexer URL is not configured (NEXT_PUBLIC_ORDERBOOK_INDEXER_URL).' };
  }

  const url = buildPoolOhlcvUrl(base, input.poolName, {
    interval: input.interval,
    startTime: input.startTime,
    endTime: input.endTime,
    limit: input.limit,
  });

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

  const parsed = ohlcvResponseSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, error: 'Unexpected OHLCV response shape from indexer.' };
  }

  const data = sortCandlestickDataAscending(parsed.data.candles.map(indexerTupleToCandlestick));
  return { ok: true, data };
}
