import { mySoAddressFromString } from '@/lib/mysocial-oauth-utils';
import type { TradeNavSegment } from '@/lib/trade-nav-segment-storage';

export type ParsedTradePath = {
  segment: TradeNavSegment;
  /** Raw third segment from URL before validation (may be invalid if not from [wallet] route). */
  routeWalletRaw: string | null;
  /** Normalized profile override when third segment is a valid MySo address. */
  routeProfileAddress: string | null;
  /** Post object id from `/trade/spt/post/:postId`. */
  routePostId: string | null;
};

/**
 * Parses `/trade`, optional `/trade/spt`, optional `/trade/spt/:wallet`.
 * Supports deployments with a Next.js `basePath` (e.g. `/spt/trade/...`) by locating the `trade` segment.
 */
export function parseTradePath(pathname: string): ParsedTradePath {
  const segments = pathname.split('/').filter(Boolean);
  const tradeIdx = segments.indexOf('trade');
  if (tradeIdx === -1) {
    return { segment: 'orderbook', routeWalletRaw: null, routeProfileAddress: null, routePostId: null };
  }
  const after = segments.slice(tradeIdx + 1);
  if (after[0] !== 'spt') {
    return { segment: 'orderbook', routeWalletRaw: null, routeProfileAddress: null, routePostId: null };
  }
  if (after[1] === 'post') {
    const postRaw = after[2]?.trim() || null;
    return {
      segment: 'social-proof-tokens',
      routeWalletRaw: null,
      routeProfileAddress: null,
      routePostId: postRaw ? mySoAddressFromString(postRaw) : null,
    };
  }
  const raw = after[1]?.trim() || null;
  const normalized = raw ? mySoAddressFromString(raw) : null;
  return {
    segment: 'social-proof-tokens',
    routeWalletRaw: raw,
    routeProfileAddress: normalized,
    routePostId: null,
  };
}

export function tradeSptPostPath(postId: string): string {
  const normalized = mySoAddressFromString(postId.trim());
  return normalized ? `/trade/spt/post/${normalized}` : '/trade/spt';
}

export function tradeOrderbookPath(): string {
  return '/trade';
}

export function tradeSptPath(routeWallet: string | null | undefined): string {
  const normalized =
    routeWallet?.trim() ? mySoAddressFromString(routeWallet.trim()) : null;
  if (normalized) return `/trade/spt/${normalized}`;
  return '/trade/spt';
}
