import type { CandlestickData, UTCTimestamp } from 'lightweight-charts';
import type { NetworkType } from '@/lib/network-utils';
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

function trimIndexerEnv(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Public indexer host when tier-specific overrides are omitted (HTTPS, no trailing slash). */
export const ORDERBOOK_PUBLIC_INDEXER_MAINNET = 'https://orderbook.mainnet.mysocial.network';
export const ORDERBOOK_PUBLIC_INDEXER_TESTNET = 'https://orderbook.testnet.mysocial.network';

/**
 * Resolved HTTP origin for trade rails (OHLCV, trades, depth, pools) on the user's selected tier.
 * Localnet returns '' unless `NEXT_PUBLIC_ORDERBOOK_INDEXER_URL` / `NEXT_PUBLIC_ORDERBOOK_INDEXER_LOCALNET_URL` is set.
 */
export function getOrderbookIndexerRestBase(network: NetworkType): string {
  const generic = trimIndexerEnv(process.env.NEXT_PUBLIC_ORDERBOOK_INDEXER_URL);

  if (network === 'mainnet') {
    const o =
      trimIndexerEnv(process.env.NEXT_PUBLIC_ORDERBOOK_INDEXER_MAINNET_URL) || generic;
    if (o) return o.replace(/\/$/, '');
    return ORDERBOOK_PUBLIC_INDEXER_MAINNET;
  }

  if (network === 'testnet') {
    const o =
      trimIndexerEnv(process.env.NEXT_PUBLIC_ORDERBOOK_INDEXER_TESTNET_URL) || generic;
    if (o) return o.replace(/\/$/, '');
    return ORDERBOOK_PUBLIC_INDEXER_TESTNET;
  }

  const o = trimIndexerEnv(process.env.NEXT_PUBLIC_ORDERBOOK_INDEXER_LOCALNET_URL) || generic;
  return o.replace(/\/$/, '');
}

export function orderbookIndexerNotConfiguredMessage(): string {
  return (
    'Orderbook indexer URL is not configured for this network. Set NEXT_PUBLIC_ORDERBOOK_INDEXER_URL or ' +
    'NEXT_PUBLIC_ORDERBOOK_INDEXER_LOCALNET_URL / _TESTNET / _MAINNET (see .env.example).'
  );
}

/** Trade tape empty-state guidance when indexer base is unresolved for current tier (localnet unset, etc.). */
export function tradeTapeIndexerUnsetDetail(): string {
  return (
    'Set NEXT_PUBLIC_ORDERBOOK_INDEXER_URL or tier NEXT_PUBLIC_ORDERBOOK_INDEXER_LOCALNET_URL / _TESTNET / ' +
    '_MAINNET (see .env.example; e.g. http://127.0.0.1:9008/ for local) so the app can call GET /trades on the indexer.'
  );
}

/**
 * Legacy global indexer URL only (no tier splitting). Prefer `getOrderbookIndexerRestBase`.
 */
export function readOrderbookIndexerBaseUrl(): string {
  return trimIndexerEnv(process.env.NEXT_PUBLIC_ORDERBOOK_INDEXER_URL);
}

/** Ensures `new URL(relative, base)` resolves under the indexer root (handles `base` with or without trailing slash). */
export function indexerOriginPathPrefix(baseRaw: string): string {
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
    /** `start_time` query — must match server: epoch **milliseconds** (see myso-orderbook-server `reader.rs`). */
    startTime?: number;
    /** `end_time` query — epoch **milliseconds**. */
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

/** `GET {base}ohclv/{pool}` (path spelled `ohclv`). Response `{ candles: [ [ms, o,h,l,c, vol], … ] }`. */
export async function fetchPoolOhlcv(input: {
  network: NetworkType;
  poolName: string;
  interval: OhlcvInterval;
  /** Maps to `start_time` — epoch **milliseconds** (server SQL uses ms). */
  startTime?: number;
  /** Maps to `end_time` — epoch **milliseconds**. */
  endTime?: number;
  limit?: number;
  signal?: AbortSignal;
}): Promise<FetchPoolOhlcvResult> {
  const base = getOrderbookIndexerRestBase(input.network);
  if (!base) {
    return { ok: false, error: orderbookIndexerNotConfiguredMessage() };
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
