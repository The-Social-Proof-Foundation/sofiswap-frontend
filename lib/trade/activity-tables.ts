import type { OrderbookRuntimeNetwork } from '@/lib/orderbook-config';
import type { NetworkType } from '@/lib/network-utils';

import { poolTickerForKey } from '@/lib/trade/trade-pool-catalog';

/**
 * Pool id → `BASE-QUOTE` for tables. When `network` is set, labels use SDK pool metadata (coin keys),
 * not the raw underscore key (e.g. `MYSO_USDC` → MYSO-USDC).
 */
export function marketLabelFromPool(
  poolName: string,
  network?: NetworkType | OrderbookRuntimeNetwork
): string {
  if (network === 'mainnet' || network === 'testnet' || network === 'localnet') {
    const { base, quote } = poolTickerForKey(network, poolName);
    if (quote && quote !== '—') return `${base}-${quote}`;
    return base;
  }
  const parts = poolName.split('_').filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]}-${parts[1]}`;
  }
  return poolName.replace(/_/g, '-') || '—';
}

export type ActivityOrderSide = 'buy' | 'sell';

export type OpenOrderRow = {
  id: string;
  market: string;
  side: ActivityOrderSide;
  price: string;
  quantity: string;
  filled: string;
};

export type UserTradeHistoryRow = {
  id: string;
  market: string;
  /** ISO or display string */
  time: string;
  side: ActivityOrderSide;
  role: string;
  price: string;
  fee: string;
  feeType: string;
  baseVolume: string;
  quoteVolume: string;
};
