const priceFmt = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

/** Ladder floor: keeps the exchange look for 4-dp markets like `1.2170`. */
export const ORDERBOOK_MIN_PRICE_DECIMALS = 4;
/** Ceiling for prices with a very fine tick, so a column never runs away with digits. */
export const ORDERBOOK_MAX_PRICE_DECIMALS = 8;

const compactAbove = 1000;

function trimTrailingZeros(s: string): string {
  if (!s.includes('.')) return s;
  return s.replace(/\.?0+$/, '') || '0';
}

/**
 * Fixed 4 dp for order book / trade history price columns (exchange-style).
 * The depth ladder uses {@link orderBookPriceDecimals} instead, so a fine-tick book keeps
 * every level distinct.
 */
export function formatOrderPrice(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return priceFmt.format(n);
}

/** Digits after the decimal point in a price's own representation (handles `1e-7` values). */
function priceDecimalPlaces(value: number): number {
  const text = String(value);
  const exponent = /e([+-]?\d+)$/i.exec(text);
  const mantissa = exponent ? text.slice(0, exponent.index) : text;
  const fraction = mantissa.split('.')[1]?.length ?? 0;
  return exponent ? Math.max(0, fraction - Number(exponent[1])) : fraction;
}

/**
 * Fraction digits that render the ladder exactly as the feed prints it: never fewer than 4,
 * never more than {@link ORDERBOOK_MAX_PRICE_DECIMALS}. Derive this from quantized ask/bid
 * prices only — a computed mid may carry float noise and should follow the ladder's precision.
 */
export function orderBookPriceDecimals(levels: readonly number[]): number {
  let decimals = ORDERBOOK_MIN_PRICE_DECIMALS;
  for (const price of levels) {
    if (!Number.isFinite(price) || price === 0) continue;
    const digits = priceDecimalPlaces(price);
    if (digits > decimals) decimals = digits;
  }
  return Math.min(decimals, ORDERBOOK_MAX_PRICE_DECIMALS);
}

/** Fixed-precision price formatter for the ladder; create once per precision, not per row. */
export function createOrderPriceFormat(decimals: number): Intl.NumberFormat {
  const digits = Number.isFinite(decimals)
    ? Math.max(0, Math.min(Math.trunc(decimals), ORDERBOOK_MAX_PRICE_DECIMALS))
    : ORDERBOOK_MIN_PRICE_DECIMALS;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export type FormatCompactOptions = {
  /** When abs(n) < compact threshold, max fractional digits. */
  maxFractionDigits?: number;
};

/**
 * Ladder amounts (size and cumulative depth) as plain numbers with separators.
 *
 * Never uses K/M suffixes: a ladder has to be checkable by eye, and `5.049K` next to a raw
 * quote total reads as `5.049 × price` — a thousand times off, which makes the Total column
 * look like it does not add up. Sub-unit sizes keep enough digits to stay non-zero.
 */
export function formatOrderBookAmount(
  value: number,
  maxFractionDigits = 4,
  minFractionDigits = 0
): string {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  const digits = abs >= 0.01 ? Math.max(0, maxFractionDigits) : 6;
  const min = Math.min(Math.max(0, minFractionDigits), digits);
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: min,
    maximumFractionDigits: digits,
  }).format(value);
}

/**
 * Uses K (and M) suffix when |n| ≥ 1000; otherwise compact decimal.
 */
export function formatCompactDecimal(n: number, options?: FormatCompactOptions): string {
  if (!Number.isFinite(n)) return '—';
  const maxFd = options?.maxFractionDigits ?? 2;
  const sign = n < 0 ? '-' : '';
  const x = Math.abs(n);
  if (x >= 1_000_000) {
    const v = x / 1_000_000;
    return `${sign}${trimTrailingZeros(v.toFixed(maxFd))}M`;
  }
  if (x >= compactAbove) {
    const v = x / 1000;
    return `${sign}${trimTrailingZeros(v.toFixed(Math.min(maxFd + 1, 4)))}K`;
  }
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: maxFd,
    minimumFractionDigits: 0,
  }).format(sign ? -x : x);
}

/**
 * Percent string for small fractional changes (e.g. 0.0218%).
 * Also used for the spread, which is a fraction of the mid.
 */
export function formatChangePercent(changeFraction: number | undefined): string {
  if (changeFraction == null || !Number.isFinite(changeFraction)) return '—';
  const pct = changeFraction * 100;
  const abs = Math.abs(pct);
  const digits = abs >= 0.1 ? 4 : 6;
  const s = pct.toFixed(digits).replace(/\.?0+$/, '');
  return `${s}%`;
}

/** Quote assets that already price in dollars, so 1 unit ≈ 1 USD. */
const USD_QUOTE_SYMBOLS = new Set(['USD', 'USDC', 'USDT', 'MYUSD', 'DAI', 'USDC.E']);

export function isUsdQuoteSymbol(symbol: string | null | undefined): boolean {
  return USD_QUOTE_SYMBOLS.has((symbol ?? '').trim().toUpperCase());
}

/** `NEXT_PUBLIC_RESERVATION_USD_PER_MYSO` — the app's single USD-per-MYSO assumption. */
export function usdPerMysoRate(): number | null {
  const raw = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_RESERVATION_USD_PER_MYSO?.trim() : '';
  if (!raw) return null;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Dollar label for a mid price whose quote asset is `quoteSymbol`: 1:1 for dollar stablecoins,
 * otherwise converted through {@link usdPerMysoRate}. Null when no honest conversion exists.
 */
export function formatUsdQuotePrice(mid: number, quoteSymbol: string | null | undefined): string | null {
  if (!Number.isFinite(mid) || mid <= 0) return null;
  const rate = isUsdQuoteSymbol(quoteSymbol) ? 1 : usdPerMysoRate();
  if (rate == null) return null;
  const usd = mid * rate;
  if (!Number.isFinite(usd) || usd <= 0) return null;
  const digits = usd >= 1000 ? 2 : usd >= 1 ? 4 : 6;
  return `$${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(usd)}`;
}

/** Best-ask spread as a fraction of the mid; null unless the book is genuinely two-sided. */
export function orderBookSpreadFraction(
  bestBid: number | null,
  bestAsk: number | null,
  mid: number | null
): number | null {
  if (bestBid == null || bestAsk == null || mid == null) return null;
  if (!Number.isFinite(bestBid) || !Number.isFinite(bestAsk) || !Number.isFinite(mid)) return null;
  if (mid <= 0 || bestAsk <= bestBid) return null;
  return (bestAsk - bestBid) / mid;
}
