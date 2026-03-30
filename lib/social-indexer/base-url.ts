import type { NetworkType } from '@/lib/network-utils';
import { getFullnodeJsonRpcUrl } from '@/lib/network-utils';

/** Same host the app uses for `/profiles/...` (see profile-utils). Not the Sui JSON-RPC fullnode. */
export const SOCIAL_INDEXER_TESTNET_DEFAULT =
  'https://social.testnet.mysocial.network';

function trimBase(v: string | undefined): string {
  if (typeof v !== 'string') return '';
  return v.trim().replace(/\/$/, '');
}

/**
 * HTTP base for social indexer REST routes: `/spt/reservation-pools`, `/profiles/...`, etc.
 * The fullnode JSON-RPC URL does not serve these paths; using it here yields perpetual fallbacks in the marquee.
 */
export function getSocialIndexerRestBaseUrl(network: NetworkType): string {
  const generic = trimBase(process.env.NEXT_PUBLIC_SOCIAL_INDEXER_URL);

  if (network === 'mainnet') {
    const o =
      trimBase(process.env.NEXT_PUBLIC_SOCIAL_INDEXER_MAINNET_URL) || generic;
    if (o) return o;
  }

  if (network === 'testnet') {
    const o =
      trimBase(process.env.NEXT_PUBLIC_SOCIAL_INDEXER_TESTNET_URL) || generic;
    if (o) return o;
    return SOCIAL_INDEXER_TESTNET_DEFAULT;
  }

  if (network === 'localnet') {
    const o = trimBase(process.env.NEXT_PUBLIC_SOCIAL_INDEXER_LOCALNET_URL) || generic;
    if (o) return o;
  }

  return getFullnodeJsonRpcUrl(network);
}
