import type { NetworkType } from '@/lib/network-utils';

const PREFIX = 'sofiswap_bm_register_pending_v1';
/** Drop stale pending rows so we do not loop register forever with a bad object id. */
const MAX_PENDING_AGE_MS = 2 * 60 * 60 * 1000;
const pendingInMemory = new Map<string, PendingBalanceManagerRegisterPayload | null>();

function key(network: NetworkType, address: string): string {
  return `${PREFIX}_${network}_${address.toLowerCase()}`;
}

export interface PendingBalanceManagerRegisterPayload {
  managerObjectId: string;
  createDigest: string;
  /** Successful registration awaiting registry read convergence. */
  registerDigest?: string;
  savedAt: number;
}

function parse(raw: string): PendingBalanceManagerRegisterPayload | null {
  try {
    const p = JSON.parse(raw) as PendingBalanceManagerRegisterPayload;
    if (
      p &&
      typeof p === 'object' &&
      typeof p.managerObjectId === 'string' &&
      typeof p.createDigest === 'string' &&
      p.createDigest.length > 0 &&
      (p.registerDigest === undefined || typeof p.registerDigest === 'string') &&
      typeof p.savedAt === 'number' && Number.isFinite(p.savedAt)
    ) {
      return p;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function readPendingBalanceManagerRegister(
  network: NetworkType,
  address: string
): PendingBalanceManagerRegisterPayload | null {
  const storageKey = key(network, address);
  let p = pendingInMemory.get(storageKey) ?? null;
  try {
    // In-memory writes may be newer than persistent storage when quota is full.
    const raw = pendingInMemory.has(storageKey) || typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(storageKey);
    if (raw) p = parse(raw) ?? p;
  } catch { /* Private browsing can deny storage; retain recovery in memory. */ }
  if (!p) return null;
  if (Date.now() - p.savedAt > MAX_PENDING_AGE_MS) {
    clearPendingBalanceManagerRegister(network, address);
    return null;
  }
  return p;
}

export function writePendingBalanceManagerRegister(
  network: NetworkType,
  address: string,
  payload: Omit<PendingBalanceManagerRegisterPayload, 'savedAt'> & { savedAt?: number }
): void {
  const full: PendingBalanceManagerRegisterPayload = { ...payload, savedAt: payload.savedAt ?? Date.now() };
  pendingInMemory.set(key(network, address), full);
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(key(network, address), JSON.stringify(full));
  } catch {
    /* quota */
  }
}

export function clearPendingBalanceManagerRegister(
  network: NetworkType,
  address: string
): void {
  pendingInMemory.set(key(network, address), null);
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(key(network, address));
  } catch { /* Storage can be unavailable. */ }
}

export function clearAllPendingBalanceManagerRegister(): void {
  pendingInMemory.clear();
  if (typeof sessionStorage === 'undefined') return;
  const keys: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const k = sessionStorage.key(i);
    if (k?.startsWith(`${PREFIX}_`)) keys.push(k);
  }
  for (const k of keys) sessionStorage.removeItem(k);
}
