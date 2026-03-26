import type { NetworkType } from '@/lib/network-utils';

const PREFIX = 'sofiswap_bm_register_pending_v1';
/** Drop stale pending rows so we do not loop register forever with a bad object id. */
const MAX_PENDING_AGE_MS = 2 * 60 * 60 * 1000;

function key(network: NetworkType, address: string): string {
  return `${PREFIX}_${network}_${address.toLowerCase()}`;
}

export interface PendingBalanceManagerRegisterPayload {
  managerObjectId: string;
  createDigest: string;
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
      typeof p.savedAt === 'number'
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
  if (typeof sessionStorage === 'undefined') return null;
  const raw = sessionStorage.getItem(key(network, address));
  if (!raw) return null;
  const p = parse(raw);
  if (!p) return null;
  if (Date.now() - p.savedAt > MAX_PENDING_AGE_MS) {
    sessionStorage.removeItem(key(network, address));
    return null;
  }
  return p;
}

export function writePendingBalanceManagerRegister(
  network: NetworkType,
  address: string,
  payload: Omit<PendingBalanceManagerRegisterPayload, 'savedAt'> & { savedAt?: number }
): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const full: PendingBalanceManagerRegisterPayload = {
      managerObjectId: payload.managerObjectId,
      createDigest: payload.createDigest,
      savedAt: payload.savedAt ?? Date.now(),
    };
    sessionStorage.setItem(key(network, address), JSON.stringify(full));
  } catch {
    /* quota */
  }
}

export function clearPendingBalanceManagerRegister(
  network: NetworkType,
  address: string
): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(key(network, address));
}

export function clearAllPendingBalanceManagerRegister(): void {
  if (typeof sessionStorage === 'undefined') return;
  const keys: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const k = sessionStorage.key(i);
    if (k?.startsWith(`${PREFIX}_`)) keys.push(k);
  }
  for (const k of keys) sessionStorage.removeItem(k);
}
