import type { OrderbookRuntimeNetwork } from '@/lib/orderbook/config';
import { getOrderbookDepthClient } from '@/lib/orderbook/orderbook-read-client';

/** Simulated reads from `OrderbookClient`: fees, book step sizes, and vault balances. */
export type PoolOnchainMeta = {
  tradeParams: { takerFee: number; makerFee: number; stakeRequired: number };
  bookParams: { tickSize: number; lotSize: number; minSize: number };
  vaultBalances: { base: number; quote: number; myusd: number };
};

export async function fetchPoolOnchainMeta(input: {
  obNet: OrderbookRuntimeNetwork;
  poolKey: string;
  signal?: AbortSignal;
}): Promise<{ ok: true; data: PoolOnchainMeta } | { ok: false; error: string }> {
  if (input.signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
  const pk = input.poolKey.trim();
  try {
    const c = getOrderbookDepthClient(input.obNet);
    const [tradeParams, bookParams, vaultBalances] = await Promise.all([
      c.orderbook.poolTradeParams(pk),
      c.orderbook.poolBookParams(pk),
      c.orderbook.vaultBalances(pk),
    ]);
    if (input.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    return { ok: true, data: { tradeParams, bookParams, vaultBalances } };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
