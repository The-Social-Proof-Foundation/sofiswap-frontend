import type { OrderbookRuntimeNetwork } from '@/lib/orderbook-config';
import { getOrderbookDepthClient } from '@/lib/orderbook/orderbook-read-client';
import type { FetchPoolOrderBookResult } from '@/lib/orderbook-indexer/orderbook';
import type { OrderBookLevel, OrderBookSnapshot } from '@/lib/trade/orderbook-types';

function levelsFromPricesSizes(prices: number[], sizes: number[]): OrderBookLevel[] {
  const out: OrderBookLevel[] = [];
  const n = Math.min(prices.length, sizes.length);
  for (let i = 0; i < n; i += 1) {
    out.push({ price: prices[i]!, size: sizes[i]! });
  }
  return out;
}

/** Match indexer ordering: asks and bids descending by price (see `normalizeSnapshot` in orderbook-indexer). */
function normalizeSnapshotFromSdk(raw: {
  bid_prices: number[];
  bid_quantities: number[];
  ask_prices: number[];
  ask_quantities: number[];
}): OrderBookSnapshot {
  const bids = levelsFromPricesSizes(raw.bid_prices, raw.bid_quantities);
  const asks = levelsFromPricesSizes(raw.ask_prices, raw.ask_quantities);
  bids.sort((a, b) => b.price - a.price);
  asks.sort((a, b) => b.price - a.price);
  const bestBid = bids[0]?.price;
  const bestAsk = asks[asks.length - 1]?.price ?? asks[0]?.price;
  let midPrice: number | undefined;
  if (bestBid != null && bestAsk != null) {
    midPrice = (bestBid + bestAsk) / 2;
  } else {
    midPrice = bestBid ?? bestAsk;
  }
  return {
    bids,
    asks,
    ...(midPrice != null && Number.isFinite(midPrice) ? { midPrice } : {}),
  };
}

export async function fetchPoolOrderBookFromSdk(input: {
  obNet: OrderbookRuntimeNetwork;
  poolKey: string;
  ticks: number;
  signal?: AbortSignal;
}): Promise<FetchPoolOrderBookResult> {
  if (input.signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
  try {
    const client = getOrderbookDepthClient(input.obNet);
    const raw = await client.orderbook.getLevel2TicksFromMid(
      input.poolKey.trim(),
      input.ticks
    );
    if (input.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    return { ok: true, data: normalizeSnapshotFromSdk(raw) };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
