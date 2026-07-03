import { OrderType } from '@socialproof/orderbook';

export type OrderSide = 'buy' | 'sell';
export type OrderKind = 'limit' | 'market';

export type OrderPlacementInput = {
  side: OrderSide;
  orderType: OrderKind;
  amount: number;
  limitPrice?: number;
};

export type PoolBookConstraints = {
  tickSize: number;
  lotSize: number;
  minSize: number;
};

export type OrderPlacementContext = {
  bookParams: PoolBookConstraints | null;
  baseBalance: number | null;
  quoteBalance: number | null;
  midPrice: number | null;
  bestBid: number | null;
  bestAsk: number | null;
};

export type ValidationResult =
  | { ok: true; roundedPrice?: number; roundedQuantity: number }
  | { ok: false; error: string };

/**
 * Rounds a price down to the nearest tick to avoid rejection by the on-chain book.
 * Tick size is in human quote-per-base units (same units as the price input).
 */
export function roundToTick(price: number, tickSize: number): number {
  if (tickSize <= 0) return price;
  return Math.floor(price / tickSize) * tickSize;
}

/**
 * Rounds a quantity down to the nearest lot. Lot size is in human base units.
 */
export function roundToLot(quantity: number, lotSize: number): number {
  if (lotSize <= 0) return quantity;
  return Math.floor(quantity / lotSize) * lotSize;
}

/**
 * Generates a unique u64 client order ID. Uses millisecond timestamp + a monotonic
 * counter to avoid collisions when two orders are placed in the same millisecond.
 */
let clientOrderCounter = 0;
export function generateClientOrderId(): string {
  const ts = BigInt(Date.now());
  const id = ts * BigInt(1000) + BigInt(clientOrderCounter % 1000);
  clientOrderCounter = (clientOrderCounter + 1) % 1000;
  return id.toString();
}

/**
 * Validates an order against pool constraints and available balances. Returns the
 * rounded price (limit only) and quantity to submit, or a user-readable error.
 */
export function validateOrderForSubmission(
  input: OrderPlacementInput,
  ctx: OrderPlacementContext
): ValidationResult {
  const { side, orderType, amount } = input;
  const { bookParams, baseBalance, quoteBalance, midPrice, bestBid, bestAsk } = ctx;

  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: 'Enter an amount greater than 0.' };
  }

  let roundedQuantity = amount;
  let roundedPrice: number | undefined;

  if (bookParams) {
    if (amount < bookParams.minSize) {
      return {
        ok: false,
        error: `Amount is below the minimum order size of ${bookParams.minSize}.`,
      };
    }
    roundedQuantity = roundToLot(amount, bookParams.lotSize);
    if (roundedQuantity <= 0) {
      return {
        ok: false,
        error: `Amount must be at least one lot (${bookParams.lotSize}).`,
      };
    }
  }

  if (orderType === 'limit') {
    const rawPrice = input.limitPrice;
    if (rawPrice == null || !Number.isFinite(rawPrice) || rawPrice <= 0) {
      return { ok: false, error: 'Enter a limit price greater than 0.' };
    }
    roundedPrice = bookParams ? roundToTick(rawPrice, bookParams.tickSize) : rawPrice;
    if (roundedPrice <= 0) {
      return { ok: false, error: 'Limit price is too small for this market.' };
    }
  }

  const referencePrice =
    orderType === 'limit'
      ? (roundedPrice ?? input.limitPrice ?? 0)
      : side === 'buy'
        ? (bestAsk ?? midPrice ?? 0)
        : (bestBid ?? midPrice ?? 0);

  if (side === 'buy') {
    if (quoteBalance != null && quoteBalance > 0 && referencePrice > 0) {
      const cost = roundedQuantity * referencePrice;
      if (cost > quoteBalance) {
        return {
          ok: false,
          error: `Insufficient quote balance. This order needs ~${cost.toFixed(6)} but only ${quoteBalance.toFixed(6)} is available.`,
        };
      }
    }
  } else {
    if (baseBalance != null && baseBalance > 0 && roundedQuantity > baseBalance) {
      return {
        ok: false,
        error: `Insufficient base balance. You have ${baseBalance.toFixed(6)} but are selling ${roundedQuantity.toFixed(6)}.`,
      };
    }
  }

  return {
    ok: true,
    roundedPrice,
    roundedQuantity,
  };
}

/**
 * Maps UI order kind to SDK OrderType. Limit orders default to GTC (NO_RESTRICTION);
 * market orders use IOC (IMMEDIATE_OR_CANCEL) so unfilled remainder is cancelled.
 */
export function sdkOrderTypeFor(kind: OrderKind): OrderType {
  return kind === 'market' ? OrderType.IMMEDIATE_OR_CANCEL : OrderType.NO_RESTRICTION;
}
