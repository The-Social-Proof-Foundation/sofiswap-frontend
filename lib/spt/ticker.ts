import type { SptDiscoveryPool, SptDiscoveryResult } from '@/lib/graphql/spt-discovery';
import { postDirectoryThumbUrl, profileDirectoryThumbUrl } from '@/lib/spt/media';
import { tradeSptPath, tradeSptPostPath } from '@/lib/trade-route-path';

export const TRENDING_SPT_TICKER_LIMIT = 20;

export type SptTickerItem = {
  id: string;
  href: string;
  symbol: string;
  avatarSrc: string | null;
  avatarShape: 'circle' | 'square';
  price: number | null;
  changePercent: number;
  quoteVolume: number;
};

function isPostPool(pool: SptDiscoveryPool): boolean {
  return pool.tokenType === 2 || Boolean(pool.holders[0]?.post);
}

export function tickerSymbolFromLabel(label: string): string {
  const cleaned = label.replace(/^@/, '').replace(/[^a-zA-Z0-9]/g, '');
  return cleaned.slice(0, 6).toUpperCase() || 'SPT';
}

function trendingScore(pool: SptDiscoveryPool): number {
  return (pool.volume24H ?? 0) * 1_000_000 + Math.abs(pool.priceChange24H ?? 0);
}

/** Live SPT pools ranked by 24h volume, then |24h %|. Profile = circle; post = square. */
export function trendingSptTickerItems(
  result: Pick<SptDiscoveryResult, 'pools'> | null | undefined,
  limit = TRENDING_SPT_TICKER_LIMIT
): SptTickerItem[] {
  const seen = new Set<string>();
  const pools = [...(result?.pools ?? [])]
    .filter((pool) => {
      const key = pool.poolId.trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => trendingScore(b) - trendingScore(a))
    .slice(0, limit);

  return pools.map((pool) => {
    const post = pool.holders[0]?.post ?? null;
    const postish = isPostPool(pool);
    const profile = post?.ownerProfile ?? pool.ownerProfile;
    const label = profile?.username || profile?.displayName || pool.owner;
    return {
      id: `spt:${pool.poolId}`,
      href: postish && post ? tradeSptPostPath(post.postId) : tradeSptPath(pool.owner),
      symbol: tickerSymbolFromLabel(label),
      avatarSrc: postish
        ? postDirectoryThumbUrl(post?.mediaUrls, profile?.profilePhoto)
        : profileDirectoryThumbUrl(profile?.profilePhoto),
      avatarShape: postish ? 'square' : 'circle',
      price: Number.isFinite(pool.price) && pool.price > 0 ? pool.price : null,
      changePercent: pool.priceChange24H ?? 0,
      quoteVolume: pool.volume24H ?? 0,
    };
  });
}
