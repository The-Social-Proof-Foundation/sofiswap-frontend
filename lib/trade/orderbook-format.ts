const priceFmt = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

const compactAbove = 1000;

function trimTrailingZeros(s: string): string {
  if (!s.includes('.')) return s;
  return s.replace(/\.?0+$/, '') || '0';
}

/**
 * Fixed 4 dp for order book / trade history price columns (exchange-style).
 */
export function formatOrderPrice(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return priceFmt.format(n);
}

export type FormatCompactOptions = {
  /** When abs(n) < compact threshold, max fractional digits. */
  maxFractionDigits?: number;
};

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
 */
export function formatChangePercent(changeFraction: number | undefined): string {
  if (changeFraction == null || !Number.isFinite(changeFraction)) return '—';
  const pct = changeFraction * 100;
  const abs = Math.abs(pct);
  const digits = abs >= 0.1 ? 4 : 6;
  const s = pct.toFixed(digits).replace(/\.?0+$/, '');
  return `${s}%`;
}
