import type { NetworkType } from '@/lib/network-utils';
import type { ProfilePortfolioOverviewResult } from '@/lib/graphql/profile-portfolio-overview';

const PREFIX = 'sofiswap_graphql_profile_overview';

/** Dispatch on `window` after platform membership changes so profile SWR refetches. */
export const SOFISWAP_PROFILE_REVALIDATE_EVENT = 'sofiswap-profile-revalidate';

export interface GraphqlProfileOverviewCachePayload {
  data: Omit<ProfilePortfolioOverviewResult, 'errors'>;
  fetchedAt: number;
}

function cacheKey(network: NetworkType, platformId: string, address: string): string {
  return `${PREFIX}_${network}_${platformId}_${address.toLowerCase()}`;
}

export function readCachedProfilePortfolioOverview(
  network: NetworkType,
  platformId: string,
  address: string
): GraphqlProfileOverviewCachePayload | null {
  if (typeof sessionStorage === 'undefined') return null;
  const raw = sessionStorage.getItem(cacheKey(network, platformId, address));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as GraphqlProfileOverviewCachePayload;
    if (
      parsed &&
      typeof parsed === 'object' &&
      parsed.data &&
      typeof parsed.fetchedAt === 'number'
    ) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

export function writeCachedProfilePortfolioOverview(
  network: NetworkType,
  platformId: string,
  address: string,
  payload: GraphqlProfileOverviewCachePayload
): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(
      cacheKey(network, platformId, address),
      JSON.stringify(payload)
    );
  } catch {
    /* quota / private mode */
  }
}

export function clearCachedProfilePortfolioOverview(
  network: NetworkType,
  platformId: string,
  address: string
): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(cacheKey(network, platformId, address));
  } catch {
    /* ignore */
  }
}

export function clearGraphqlProfileCacheForPrefix(): void {
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
