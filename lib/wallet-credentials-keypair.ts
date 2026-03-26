import type { WalletCredentials } from '@socialproof/mysocial-auth';
import { Ed25519Keypair } from '@socialproof/myso/keypairs/ed25519';

function parsePrivateKeyToBytes(privateKey: string): Uint8Array {
  const pk = privateKey.trim();
  if (pk.startsWith('0x') || pk.startsWith('0X')) {
    const hex = pk.slice(2);
    if (hex.length !== 64) {
      throw new Error('Invalid private key: hex key must be 64 characters (32 bytes)');
    }
    return new Uint8Array(hex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));
  }
  const keyArray = pk.split(',').map(Number);
  if (keyArray.length !== 32) {
    throw new Error('Invalid private key: comma-separated list must be 32 numbers');
  }
  return new Uint8Array(keyArray);
}

/**
 * Build a MySo Ed25519 keypair from Create/Import Wallet credentials (popup flow).
 * Throws if derivation does not match `credentials.address`.
 */
export function keypairFromWalletCredentials(credentials: WalletCredentials): Ed25519Keypair {
  const addr = credentials.address?.trim();
  if (!addr) {
    throw new Error('Wallet credentials missing address');
  }

  let kp: Ed25519Keypair;
  if (credentials.mnemonic?.trim()) {
    kp = Ed25519Keypair.deriveKeypair(credentials.mnemonic.trim());
  } else if (credentials.privateKey?.trim()) {
    kp = Ed25519Keypair.fromSecretKey(parsePrivateKeyToBytes(credentials.privateKey));
  } else {
    throw new Error('Wallet credentials missing mnemonic or privateKey');
  }

  const derived = kp.getPublicKey().toMySoAddress();
  if (derived.toLowerCase() !== addr.toLowerCase()) {
    throw new Error('Derived address does not match wallet credentials');
  }
  return kp;
}
