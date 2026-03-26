import { Ed25519Keypair } from '@socialproof/myso/keypairs/ed25519';

const PREFIX = 'mysocial_wallet_signing_v1:';

function storageKey(address: string): string {
  return `${PREFIX}${address.trim().toLowerCase()}`;
}

/**
 * Persist MySocial-derived key material for the tab session (sessionStorage).
 * Value is Bech32 secret key from `Ed25519Keypair.getSecretKey()` so it round-trips via `fromSecretKey`.
 */
export function storeWalletSigningKey(address: string, bech32SecretKey: string): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(storageKey(address), bech32SecretKey);
  } catch {
    /* quota / private mode */
  }
}

export function loadWalletSigningKeypair(address: string): Ed25519Keypair | null {
  if (typeof sessionStorage === 'undefined') return null;
  const raw = sessionStorage.getItem(storageKey(address));
  if (!raw) return null;
  try {
    return Ed25519Keypair.fromSecretKey(raw);
  } catch {
    return null;
  }
}

export function clearWalletSigningKey(address: string): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(storageKey(address));
}

export function clearAllWalletSigningKeys(): void {
  if (typeof sessionStorage === 'undefined') return;
  const keys: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const k = sessionStorage.key(i);
    if (k?.startsWith(PREFIX)) keys.push(k);
  }
  for (const k of keys) {
    sessionStorage.removeItem(k);
  }
}
