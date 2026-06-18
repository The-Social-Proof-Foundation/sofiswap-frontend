import type { FetchPoolOrderBookResult } from '@/lib/orderbook-indexer/orderbook';
import { augmentOrderbookReadErrorMessage, type OrderbookRuntimeNetwork } from '@/lib/orderbook/config';
import { getOrderbookDepthClient } from '@/lib/orderbook/orderbook-read-client';
import {
  ORDERBOOK_DEFAULT_LEVELS_PER_SIDE,
  type OrderBookLevel,
  type OrderBookSnapshot,
} from '@/lib/trade/orderbook-types';

function levelsFromPricesSizes(prices: number[], sizes: number[]): OrderBookLevel[] {
  const out: OrderBookLevel[] = [];
  const n = Math.min(prices.length, sizes.length);
  for (let i = 0; i < n; i += 1) {
    out.push({ price: prices[i]!, size: sizes[i]! });
  }
  return out;
}

function derivedMidFromLevels(bids: OrderBookLevel[], asks: OrderBookLevel[]): number | undefined {
  const bestBid = bids[0]?.price;
  const bestAsk = asks[asks.length - 1]?.price ?? asks[0]?.price;
  if (bestBid != null && bestAsk != null) {
    return (bestBid + bestAsk) / 2;
  }
  return bestBid ?? bestAsk;
}

/** gRPC / gateway sometimes returns URL-encoded copy; decode for readable UI. */
function decodePossibleEncodedMessage(raw: string): string {
  if (!/%(?:2[0-9A-Fa-f]|[3-9A-Fa-f][0-9A-Fa-f])/i.test(raw)) return raw;
  try {
    return decodeURIComponent(raw.replace(/\+/g, ' '));
  } catch {
    return raw;
  }
}

/** Match indexer ordering: asks and bids descending by price (see `normalizeSnapshot` in orderbook-indexer). */
function normalizeSnapshotFromSdk(
  raw: {
    bid_prices: number[];
    bid_quantities: number[];
    ask_prices: number[];
    ask_quantities: number[];
  },
  chainMid?: number
): OrderBookSnapshot {
  const bids = levelsFromPricesSizes(raw.bid_prices, raw.bid_quantities);
  const asks = levelsFromPricesSizes(raw.ask_prices, raw.ask_quantities);
  bids.sort((a, b) => b.price - a.price);
  asks.sort((a, b) => b.price - a.price);
  const midPrice =
    chainMid != null && Number.isFinite(chainMid) ? chainMid : derivedMidFromLevels(bids, asks);
  return {
    bids,
    asks,
    ...(midPrice != null && Number.isFinite(midPrice) ? { midPrice } : {}),
  };
}

function normalizeSnapshotFromRange(
  bidRaw: { prices: number[]; quantities: number[] },
  askRaw: { prices: number[]; quantities: number[] },
  chainMid?: number
): OrderBookSnapshot {
  const bids = levelsFromPricesSizes(bidRaw.prices, bidRaw.quantities);
  const asks = levelsFromPricesSizes(askRaw.prices, askRaw.quantities);
  bids.sort((a, b) => b.price - a.price);
  asks.sort((a, b) => b.price - a.price);
  const midPrice =
    chainMid != null && Number.isFinite(chainMid) ? chainMid : derivedMidFromLevels(bids, asks);
  return {
    bids,
    asks,
    ...(midPrice != null && Number.isFinite(midPrice) ? { midPrice } : {}),
  };
}

export type FetchPoolOrderBookFromSdkInput = {
  obNet: OrderbookRuntimeNetwork;
  poolKey: string;
  signal?: AbortSignal;
  /**
   * Levels on each side from mid (default {@link ORDERBOOK_DEFAULT_LEVELS_PER_SIDE}). Ignored when `priceLow` + `priceHigh` range mode is used.
   */
  ticks?: number;
  /**
   * When set with `priceHigh`, fetches depth via `getLevel2Range` for bids and asks (SDK-only).
   * Prices are human-readable quote-per-base values (same units as `getLevel2TicksFromMid`).
   */
  priceLow?: number;
  priceHigh?: number;
};

/**
 * Fetches L2 depth via `OrderbookClient`. Uses `getLevel2TicksFromMid` by default, or `getLevel2Range`
 * when `priceLow` / `priceHigh` define a valid band.
 * Merges on-chain **`midPrice()`** with the ladder so headers use the same mid as Move, not only bid/ask mid from ticks.
 */
export async function fetchPoolOrderBookFromSdk(
  input: FetchPoolOrderBookFromSdkInput
): Promise<FetchPoolOrderBookResult> {
  if (input.signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
  const poolKey = input.poolKey.trim();
  const ticks = input.ticks ?? ORDERBOOK_DEFAULT_LEVELS_PER_SIDE;
  const useRange =
    input.priceLow != null &&
    input.priceHigh != null &&
    Number.isFinite(input.priceLow) &&
    Number.isFinite(input.priceHigh) &&
    input.priceLow < input.priceHigh;

  try {
    const client = getOrderbookDepthClient(input.obNet);

    const midP = client.orderbook.midPrice(poolKey).catch(() => undefined as number | undefined);

    if (useRange) {
      const low = input.priceLow!;
      const high = input.priceHigh!;
      const [bidRaw, askRaw, chainMid] = await Promise.all([
        client.orderbook.getLevel2Range(poolKey, low, high, true),
        client.orderbook.getLevel2Range(poolKey, low, high, false),
        midP,
      ]);
      if (input.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      return {
        ok: true,
        data: normalizeSnapshotFromRange(bidRaw, askRaw, chainMid),
      };
    }

    const [raw, chainMid] = await Promise.all([
      client.orderbook.getLevel2TicksFromMid(poolKey, ticks),
      midP,
    ]);
    if (input.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    return { ok: true, data: normalizeSnapshotFromSdk(raw, chainMid) };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: augmentOrderbookReadErrorMessage(input.obNet, decodePossibleEncodedMessage(msg)),
    };
  }
}
