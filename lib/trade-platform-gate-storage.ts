import type { NetworkType } from '@/lib/network-utils';
import type { PlatformUserAccess } from '@/lib/graphql/profile-portfolio-overview';

const OK_PREFIX = 'sofiswap_trade_gate_ok';
/** @deprecated Legacy prefetch keys — cleared by clearTradeGateOkForPrefix */
const LEGACY_PREFETCH_PREFIX = 'sofiswap_trade_gate_prefetch';
const ACCESS_CACHE_PREFIX = 'sofiswap_trade_gate_access_cache';

function okKey(network: NetworkType, platformId: string, address: string): string {
  return `${OK_PREFIX}_${network}_${platformId}_${address.toLowerCase()}`;
}

function accessCacheKey(network: NetworkType, platformId: string, address: string): string {
  return `${ACCESS_CACHE_PREFIX}_${network}_${platformId}_${address.toLowerCase()}`;
}

export function readTradeGateOk(
  network: NetworkType,
  platformId: string,
  address: string
): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  return sessionStorage.getItem(okKey(network, platformId, address)) === '1';
}

export function setTradeGateOk(
  network: NetworkType,
  platformId: string,
  address: string
): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(okKey(network, platformId, address), '1');
}

export interface PlatformAccessCachePayload {
  access: PlatformUserAccess | null;
  fetchedAt: number;
}

/** @deprecated Use PlatformAccessCachePayload */
export type PrefetchedAccessPayload = PlatformAccessCachePayload;

function parseAccessPayload(raw: string): PlatformAccessCachePayload | null {
  try {
    const parsed = JSON.parse(raw) as PlatformAccessCachePayload;
    if (
      parsed &&
      typeof parsed === 'object' &&
      'access' in parsed &&
      typeof parsed.fetchedAt === 'number'
    ) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Durable session cache for platformUserAccess (stale-while-revalidate).
 * Read does not remove the entry.
 */
export function readCachedPlatformAccess(
  network: NetworkType,
  platformId: string,
  address: string
): PlatformAccessCachePayload | null {
  if (typeof sessionStorage === 'undefined') return null;
  const raw = sessionStorage.getItem(accessCacheKey(network, platformId, address));
  if (!raw) return null;
  return parseAccessPayload(raw);
}

export function writeCachedPlatformAccess(
  network: NetworkType,
  platformId: string,
  address: string,
  payload: PlatformAccessCachePayload
): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(
      accessCacheKey(network, platformId, address),
      JSON.stringify(payload)
    );
  } catch {
    /* quota / private mode */
  }
}

/** Same as writeCachedPlatformAccess — used after auth callback prefetch. */
export function writePrefetchedAccess(
  network: NetworkType,
  platformId: string,
  address: string,
  payload: PlatformAccessCachePayload
): void {
  writeCachedPlatformAccess(network, platformId, address, payload);
}

/**
 * @deprecated One-shot prefetch consumed on read — use readCachedPlatformAccess.
 * Reads legacy prefetch key once (and removes it), or returns null.
 */
export function readAndConsumePrefetchedAccess(
  network: NetworkType,
  platformId: string,
  address: string
): PlatformAccessCachePayload | null {
  if (typeof sessionStorage === 'undefined') return null;
  const legacyKey = `${LEGACY_PREFETCH_PREFIX}_${network}_${platformId}_${address.toLowerCase()}`;
  const raw = sessionStorage.getItem(legacyKey);
  if (raw) {
    sessionStorage.removeItem(legacyKey);
    const parsed = parseAccessPayload(raw);
    if (parsed) {
      writeCachedPlatformAccess(network, platformId, address, parsed);
      return parsed;
    }
  }
  return null;
}

export function clearTradeGateOkForPrefix(): void {
  if (typeof sessionStorage === 'undefined') return;
  const prefixes = [OK_PREFIX, LEGACY_PREFETCH_PREFIX, ACCESS_CACHE_PREFIX];
  const keys: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const k = sessionStorage.key(i);
    if (k && prefixes.some((p) => k.startsWith(p))) {
      keys.push(k);
    }
  }
  for (const k of keys) {
    sessionStorage.removeItem(k);
  }
}
