/** MySocial web wallet URL (same origin as trade nav profile links). */
const MYSOCIAL_WEB_ORIGIN = 'https://www.mysocial.network';

export function buildMysocialWalletExplorerHref(address: string): string {
  const a = address.trim();
  if (!a) return `${MYSOCIAL_WEB_ORIGIN}/ecosystem/sofiswap`;
  const url = new URL('/wallet', MYSOCIAL_WEB_ORIGIN);
  url.searchParams.set('address', a);
  return url.toString();
}
