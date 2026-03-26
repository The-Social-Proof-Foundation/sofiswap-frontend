export type TradeNavSegment = 'orderbook' | 'social-proof-tokens';

const STORAGE_PREFIX = 'sofiswap:trade-nav-segment';

export function tradeNavSegmentStorageKey(
  displayAddress: string | null | undefined,
  isAuthenticated: boolean
): string {
  const addr = displayAddress?.trim();
  if (isAuthenticated && addr) {
    return `${STORAGE_PREFIX}:user:${addr.toLowerCase()}`;
  }
  return `${STORAGE_PREFIX}:universal`;
}

export function readTradeNavSegment(key: string): TradeNavSegment | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    if (raw === 'orderbook' || raw === 'social-proof-tokens') return raw;
    return null;
  } catch {
    return null;
  }
}

export function writeTradeNavSegment(key: string, segment: TradeNavSegment): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, segment);
  } catch {
    // quota / private mode
  }
}
