/** Pool id e.g. MYSO_MYUSD → exchange-style pair label MYUSD-MYSO (base-quote with hyphen). */
export function marketLabelFromPool(poolName: string): string {
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
