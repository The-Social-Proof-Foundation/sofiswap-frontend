import type { OrderBookSnapshot, TradePrint } from '@/lib/trade/orderbook-types';

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function mockOrderBookSnapshot(poolName: string, levelsPerSide: number): OrderBookSnapshot {
  const rand = mulberry32(hashSeed(`ob:${poolName}`));
  const mid = 0.85 + rand() * 0.15;
  const tick = 0.0001 + Math.floor(rand() * 5) * 0.00005;
  const asks: OrderBookSnapshot['asks'] = [];
  const bids: OrderBookSnapshot['bids'] = [];
  for (let i = 0; i < levelsPerSide; i++) {
    const askPrice = mid + tick * (levelsPerSide - i);
    const bidPrice = mid - tick * (i + 1);
    const askSize = 20 + rand() * 8000 * (1 + i * 0.08);
    const bidSize = 15 + rand() * 7500 * (1 + i * 0.07);
    asks.push({ price: Number(askPrice.toFixed(6)), size: askSize });
    bids.push({ price: Number(bidPrice.toFixed(6)), size: bidSize });
  }
  asks.sort((a, b) => b.price - a.price);
  bids.sort((a, b) => b.price - a.price);
  const changeFraction = (rand() - 0.5) * 0.002;
  return {
    asks,
    bids,
    midPrice: Number(mid.toFixed(4)),
    changeFraction,
  };
}

export function mockTradeHistory(poolName: string, count: number): TradePrint[] {
  const rand = mulberry32(hashSeed(`tr:${poolName}`));
  const base = 0.85 + rand() * 0.15;
  const out: TradePrint[] = [];
  let last = base;
  for (let i = 0; i < count; i++) {
    const step = (rand() - 0.48) * 0.0025;
    last = Math.max(0.01, last + step);
    const size =
      rand() > 0.35 ? Math.round(rand() * 200) : Math.round(rand() * 200) / 10;
    const side: TradePrint['side'] = rand() >= 0.5 ? 'buy' : 'sell';
    out.push({
      price: Number(last.toFixed(4)),
      size: Math.max(0.1, size),
      side,
    });
  }
  return out;
}
