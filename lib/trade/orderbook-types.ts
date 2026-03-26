export type OrderBookLevel = {
  price: number;
  size: number;
};

export type OrderBookSnapshot = {
  asks: OrderBookLevel[];
  bids: OrderBookLevel[];
  /** Last or mid; if omitted, UI derives mid from best bid/ask. */
  midPrice?: number;
  /** Fractional change, e.g. 0.000218 → 0.0218%. */
  changeFraction?: number;
};

export type TradePrint = {
  price: number;
  size: number;
  side: 'buy' | 'sell';
};
