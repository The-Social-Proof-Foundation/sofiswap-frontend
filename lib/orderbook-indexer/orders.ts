import type { NetworkType } from '@/lib/network-utils';
import {
  getOrderbookIndexerRestBase,
  indexerOriginPathPrefix,
  orderbookIndexerNotConfiguredMessage,
} from '@/lib/orderbook-indexer/ohlcv';
import { marketLabelFromPool, type OpenOrderRow } from '@/lib/trade/activity-tables';
import { z } from 'zod';

const finiteNumber = z.union([z.number(), z.string()]).transform((value, ctx) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Expected a finite number' });
    return z.NEVER;
  }
  return parsed;
});

const indexedOrderSchema = z.object({
  order_id: z.union([z.string(), z.number()]).transform(String),
  type: z.enum(['buy', 'sell']),
  price: finiteNumber,
  original_quantity: finiteNumber,
  filled_quantity: finiteNumber,
  current_status: z.string(),
});

export function buildAccountOrdersUrl(
  baseRaw: string,
  poolName: string,
  balanceManagerId: string
): string {
  const base = indexerOriginPathPrefix(baseRaw);
  const url = new URL(
    `orders/${encodeURIComponent(poolName)}/${encodeURIComponent(balanceManagerId)}`,
    base
  );
  url.searchParams.set('status', 'placed,partially_filled');
  url.searchParams.set('limit', '1000');
  return url.toString();
}

export type FetchAccountOpenOrdersResult =
  | { ok: true; data: OpenOrderRow[] }
  | { ok: false; error: string };

/** Reads the user's current open/partially-filled orders from the orderbook indexer. */
export async function fetchAccountOpenOrders(input: {
  network: NetworkType;
  poolName: string;
  balanceManagerId: string;
  signal?: AbortSignal;
}): Promise<FetchAccountOpenOrdersResult> {
  const rawBase = getOrderbookIndexerRestBase(input.network);
  if (!rawBase) return { ok: false, error: orderbookIndexerNotConfiguredMessage() };

  const url = buildAccountOrdersUrl(rawBase, input.poolName, input.balanceManagerId);
  let response: Response;
  try {
    response = await fetch(url, { signal: input.signal, cache: 'no-store' });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    return {
      ok: false,
      error: `Failed to reach indexer: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    return {
      ok: false,
      error: `Indexer returned ${response.status}${body ? ` — ${body.slice(0, 200)}` : ''}`,
    };
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return { ok: false, error: 'Indexer orders response was not valid JSON.' };
  }
  const parsed = z.array(indexedOrderSchema).safeParse(json);
  if (!parsed.success) {
    return { ok: false, error: 'Unexpected orders response shape from indexer.' };
  }

  const market = marketLabelFromPool(input.poolName, input.network);
  return {
    ok: true,
    data: parsed.data.map((order) => ({
      id: order.order_id,
      market,
      side: order.type,
      price: String(order.price),
      quantity: String(order.original_quantity),
      filled: String(order.filled_quantity),
    })),
  };
}
