import type { NetworkType } from '@/lib/network-utils';

import { clearAllPendingBalanceManagerRegister } from '@/lib/trading-setup-pending-storage';

const PREFIX = 'sofiswap_trading_setup_v1';
const DEFAULT_TTL_MS = 5 * 60_000;
/** Empty registry results go stale quickly so we re-check before creating another BalanceManager. */
const NEGATIVE_IDS_TTL_MS = 15_000;

function cacheKey(network: NetworkType, address: string): string {
  return `${PREFIX}_${network}_${address.toLowerCase()}`;
}

export interface TradingSetupCachePayload {
  ids: string[];
  error: string | null;
  fetchedAt: number;
}

function parse(raw: string): TradingSetupCachePayload | null {
  try {
    const p = JSON.parse(raw) as TradingSetupCachePayload;
    if (
      p &&
      typeof p === 'object' &&
      Array.isArray(p.ids) &&
      typeof p.fetchedAt === 'number'
    ) {
      return p;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function effectiveTtlMs(payload: TradingSetupCachePayload, maxAgeMs: number): number {
  if (payload.ids.length > 0) return maxAgeMs;
  if (payload.error != null) return Math.min(maxAgeMs, 60_000);
  return Math.min(maxAgeMs, NEGATIVE_IDS_TTL_MS);
}

export function readTradingSetupCache(
  network: NetworkType,
  address: string,
  maxAgeMs: number = DEFAULT_TTL_MS
): TradingSetupCachePayload | null {
  if (typeof sessionStorage === 'undefined') return null;
  const raw = sessionStorage.getItem(cacheKey(network, address));
  if (!raw) return null;
  const p = parse(raw);
  if (!p) return null;
  if (Date.now() - p.fetchedAt > effectiveTtlMs(p, maxAgeMs)) return null;
  return p;
}

export function writeTradingSetupCache(
  network: NetworkType,
  address: string,
  payload: Omit<TradingSetupCachePayload, 'fetchedAt'> & { fetchedAt?: number }
): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const full: TradingSetupCachePayload = {
      ids: payload.ids,
      error: payload.error,
      fetchedAt: payload.fetchedAt ?? Date.now(),
    };
    sessionStorage.setItem(cacheKey(network, address), JSON.stringify(full));
  } catch {
    /* quota */
  }
}

export function clearTradingSetupCacheForAddress(
  network: NetworkType,
  address: string
): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(cacheKey(network, address));
}

/** Clears all trading-setup cache entries (e.g. sign-out, bulk invalidation). */
export function clearAllTradingSetupCache(): void {
  if (typeof sessionStorage === 'undefined') return;
  const keys: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const k = sessionStorage.key(i);
    if (k?.startsWith(`${PREFIX}_`)) keys.push(k);
  }
  for (const k of keys) sessionStorage.removeItem(k);
  clearAllPendingBalanceManagerRegister();
}
