import type { TradePrint } from '@/lib/trade/orderbook-types';
import type { UserTradeHistoryRow } from '@/lib/trade/activity-tables';
import type { NetworkType } from '@/lib/network-utils';
import {
  getOrderbookIndexerRestBase,
  indexerOriginPathPrefix,
  orderbookIndexerNotConfiguredMessage,
} from '@/lib/orderbook-indexer/ohlcv';

export type FetchPoolTradesQuery = {
  /** Server default is 1; pass an explicit row count for tape UI (e.g. 50). */
  limit?: number;
  /** Unix seconds (server multiplies by 1000 for internal ms). */
  startTimeSec?: number;
  endTimeSec?: number;
  makerBalanceManagerId?: string;
  takerBalanceManagerId?: string;
  balanceManagerId?: string;
};

export type FetchPoolTradesResult =
  | { ok: true; data: TradePrint[] }
  | { ok: false; error: string };

function coerceFiniteNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/**
 * Maps myso-orderbook-server trade JSON (from `order_fills`) to UI rows.
 * Accepts snake_case / camelCase and several legacy field names.
 */
export function indexerTradeRowToPrint(row: Record<string, unknown>): TradePrint | null {
  const price =
    coerceFiniteNumber(row.price) ??
    coerceFiniteNumber(row.execution_price) ??
    coerceFiniteNumber(row.executionPrice);

  const size =
    coerceFiniteNumber(row.size) ??
    coerceFiniteNumber(row.base_quantity) ??
    coerceFiniteNumber(row.baseQuantity) ??
    coerceFiniteNumber(row.base_volume) ??
    coerceFiniteNumber(row.baseVolume) ??
    coerceFiniteNumber(row.quantity);

  if (price == null || size == null) {
    return null;
  }

  let side: 'buy' | 'sell' = 'buy';
  const rawSide = row.side ?? row.type ?? row.taker_side ?? row.takerSide;
  if (rawSide === 'sell' || rawSide === 'buy') {
    side = rawSide;
  } else if (typeof row.taker_is_bid === 'boolean') {
    side = row.taker_is_bid ? 'buy' : 'sell';
  } else if (typeof row.takerIsBid === 'boolean') {
    side = row.takerIsBid ? 'buy' : 'sell';
  }

  return { price, size, side };
}

function parseTradesResponseBody(json: unknown): TradePrint[] {
  let rows: unknown[];

  if (Array.isArray(json)) {
    rows = json;
  } else if (
    json &&
    typeof json === 'object' &&
    Array.isArray((json as { trades?: unknown }).trades)
  ) {
    rows = (json as { trades: unknown[] }).trades;
  } else {
    return [];
  }

  const out: TradePrint[] = [];
  for (const r of rows) {
    if (r && typeof r === 'object') {
      const p = indexerTradeRowToPrint(r as Record<string, unknown>);
      if (p) out.push(p);
    }
  }
  return out;
}

/**
 * `GET {base}trades/{pool_name}` — orderbook REST (e.g. myso-orderbook-server).
 * Response is a top-level JSON array (or legacy `{ trades: [...] }`).
 */
export function buildPoolTradesUrl(
  baseRaw: string,
  poolName: string,
  query?: FetchPoolTradesQuery
): string {
  const base = indexerOriginPathPrefix(baseRaw);
  const rel = `trades/${encodeURIComponent(poolName)}`;
  const url = new URL(rel, base);
  const q = query ?? {};
  if (q.limit != null) url.searchParams.set('limit', String(q.limit));
  if (q.startTimeSec != null) url.searchParams.set('start_time', String(q.startTimeSec));
  if (q.endTimeSec != null) url.searchParams.set('end_time', String(q.endTimeSec));
  if (q.makerBalanceManagerId) {
    url.searchParams.set('maker_balance_manager_id', q.makerBalanceManagerId);
  }
  if (q.takerBalanceManagerId) {
    url.searchParams.set('taker_balance_manager_id', q.takerBalanceManagerId);
  }
  if (q.balanceManagerId) {
    url.searchParams.set('balance_manager_id', q.balanceManagerId);
  }
  return url.toString();
}

/** Default `limit` for `GET /trades/:pool` (server default is 1 without this). */
export const DEFAULT_POOL_TRADES_LIMIT = 50;

/**
 * Maps a raw indexer trade row to a `UserTradeHistoryRow` for the "My Trades" tab.
 * Determines maker/taker role by matching the user's balanceManagerId. Missing
 * fields are rendered as "—" rather than throwing.
 */
export function indexerTradeRowToUserHistory(
  row: Record<string, unknown>,
  poolName: string,
  userBalanceManagerId: string
): UserTradeHistoryRow | null {
  const price =
    coerceFiniteNumber(row.price) ??
    coerceFiniteNumber(row.execution_price) ??
    coerceFiniteNumber(row.executionPrice);
  const size =
    coerceFiniteNumber(row.size) ??
    coerceFiniteNumber(row.base_quantity) ??
    coerceFiniteNumber(row.baseQuantity) ??
    coerceFiniteNumber(row.base_volume) ??
    coerceFiniteNumber(row.baseVolume) ??
    coerceFiniteNumber(row.quantity);
  if (price == null || size == null) return null;

  const rawMaker = String(row.maker_balance_manager_id ?? row.makerBalanceManagerId ?? '');
  const rawTaker = String(row.taker_balance_manager_id ?? row.takerBalanceManagerId ?? '');
  const isMaker = Boolean(rawMaker) && rawMaker === userBalanceManagerId;
  const isTaker = Boolean(rawTaker) && rawTaker === userBalanceManagerId;
  const role = isMaker ? 'Maker' : isTaker ? 'Taker' : '—';

  let takerSide: 'buy' | 'sell' = 'buy';
  const rawSide = row.side ?? row.type ?? row.taker_side ?? row.takerSide;
  if (rawSide === 'sell' || rawSide === 'buy') {
    takerSide = rawSide;
  } else if (typeof row.taker_is_bid === 'boolean') {
    takerSide = row.taker_is_bid ? 'buy' : 'sell';
  } else if (typeof row.takerIsBid === 'boolean') {
    takerSide = row.takerIsBid ? 'buy' : 'sell';
  }
  const side = isMaker ? (takerSide === 'buy' ? 'sell' : 'buy') : takerSide;

  const ts =
    coerceFiniteNumber(row.timestamp) ??
    coerceFiniteNumber(row.time) ??
    coerceFiniteNumber(row.created_at) ??
    coerceFiniteNumber(row.createdAt);
  const timeStr =
    ts != null ? new Date(ts >= 1_000_000_000_000 ? ts : ts * 1000).toLocaleString() : '—';

  const fee =
    coerceFiniteNumber(row.fee) ??
    (isMaker
      ? coerceFiniteNumber(row.maker_fee ?? row.makerFee)
      : coerceFiniteNumber(row.taker_fee ?? row.takerFee));
  const explicitFeeType =
    typeof row.fee_type === 'string'
      ? row.fee_type
      : typeof row.feeType === 'string'
        ? row.feeType
        : null;
  const feeIsMyso = isMaker
    ? row.maker_fee_is_myso === true || row.makerFeeIsMyso === true
    : row.taker_fee_is_myso === true || row.takerFeeIsMyso === true;
  const [baseSymbol = 'BASE', quoteSymbol = 'QUOTE'] = poolName.split('_');
  const nativeFeeType = isMaker
    ? takerSide === 'buy'
      ? baseSymbol
      : quoteSymbol
    : takerSide === 'buy'
      ? quoteSymbol
      : baseSymbol;
  const feeType = explicitFeeType ?? (feeIsMyso ? 'MYSO' : nativeFeeType);
  const quoteVolume =
    coerceFiniteNumber(row.quote_volume) ?? coerceFiniteNumber(row.quoteVolume) ?? price * size;

  return {
    id: String(row.id ?? row.order_id ?? row.fill_id ?? `${ts ?? Date.now()}-${price}-${size}`),
    market: poolName,
    time: timeStr,
    side,
    role,
    price: new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 }).format(price),
    fee: fee != null ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 }).format(fee) : '—',
    feeType,
    baseVolume: new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 }).format(size),
    quoteVolume: new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 }).format(quoteVolume),
  };
}

export async function fetchPoolTrades(input: {
  network: NetworkType;
  poolName: string;
  signal?: AbortSignal;
} & FetchPoolTradesQuery): Promise<FetchPoolTradesResult> {
  const base = getOrderbookIndexerRestBase(input.network);
  if (!base) {
    return {
      ok: false,
      error: orderbookIndexerNotConfiguredMessage(),
    };
  }

  const { network, poolName, signal, ...query } = input;
  const limit = query.limit ?? DEFAULT_POOL_TRADES_LIMIT;
  const url = buildPoolTradesUrl(base, poolName, {
    ...query,
    limit,
  });

  let res: Response;
  try {
    res = await fetch(url, { signal, cache: 'no-store' });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Failed to reach indexer: ${msg}` };
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (
      network === 'localnet' &&
      res.status === 404 &&
      /pool/i.test(body) &&
      /not\s+found/i.test(body)
    ) {
      return { ok: true, data: [] };
    }
    const hint = body ? ` — ${body.slice(0, 200)}` : '';
    return { ok: false, error: `Indexer returned ${res.status}${hint}` };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, error: 'Indexer response was not valid JSON.' };
  }

  const data = parseTradesResponseBody(json);
  return { ok: true, data };
}

function parseTradesRawRows(json: unknown): Record<string, unknown>[] {
  let rows: unknown[];
  if (Array.isArray(json)) {
    rows = json;
  } else if (
    json &&
    typeof json === 'object' &&
    Array.isArray((json as { trades?: unknown }).trades)
  ) {
    rows = (json as { trades: unknown[] }).trades;
  } else {
    return [];
  }
  const out: Record<string, unknown>[] = [];
  for (const r of rows) {
    if (r && typeof r === 'object') {
      out.push(r as Record<string, unknown>);
    }
  }
  return out;
}

export type FetchAccountTradeHistoryResult =
  | { ok: true; data: UserTradeHistoryRow[] }
  | { ok: false; error: string };

/**
 * Fetches trades for a specific BalanceManager from the indexer and maps them to
 * `UserTradeHistoryRow` for the "My Trades" tab. Uses the `balance_manager_id`
 * query param so the server returns only fills where the user was maker or taker.
 */
export async function fetchAccountTradeHistory(input: {
  network: NetworkType;
  poolName: string;
  balanceManagerId: string;
  limit?: number;
  signal?: AbortSignal;
}): Promise<FetchAccountTradeHistoryResult> {
  const base = getOrderbookIndexerRestBase(input.network);
  if (!base) {
    return { ok: false, error: orderbookIndexerNotConfiguredMessage() };
  }

  const url = buildPoolTradesUrl(base, input.poolName, {
    limit: input.limit ?? DEFAULT_POOL_TRADES_LIMIT,
    balanceManagerId: input.balanceManagerId,
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
    if (
      input.network === 'localnet' &&
      res.status === 404 &&
      /pool/i.test(body) &&
      /not\s+found/i.test(body)
    ) {
      return { ok: true, data: [] };
    }
    const hint = body ? ` — ${body.slice(0, 200)}` : '';
    return { ok: false, error: `Indexer returned ${res.status}${hint}` };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, error: 'Indexer response was not valid JSON.' };
  }

  const rawRows = parseTradesRawRows(json);
  const rows: UserTradeHistoryRow[] = [];
  for (const r of rawRows) {
    const mapped = indexerTradeRowToUserHistory(r, input.poolName, input.balanceManagerId);
    if (mapped) rows.push(mapped);
  }
  return { ok: true, data: rows };
}
