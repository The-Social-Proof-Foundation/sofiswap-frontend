'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  fetchProfilePortfolioOverview,
  type ProfilePortfolioOverview2Result,
} from '@/lib/graphql/profile-portfolio-overview';
import {
  readCachedProfilePortfolioOverview2,
  SOFISWAP_PROFILE_REVALIDATE_EVENT,
  clearCachedProfilePortfolioOverview2,
  writeCachedProfilePortfolioOverview2,
} from '@/lib/graphql-profile-cache';
import type { NetworkType } from '@/lib/network-utils';

export type GraphqlProfileOverviewData = Omit<
  ProfilePortfolioOverview2Result,
  'errors'
>;

const PROFILE_LOG = '[SofiSwap profile overview]';

function logProfileLoad(
  source: 'cache' | 'graphql',
  context: {
    network: NetworkType;
    platformId: string;
    address: string;
    fetchedAt?: number;
    data: GraphqlProfileOverviewData;
  }
): void {
  const { network, platformId, address, fetchedAt, data } = context;
  console.log(PROFILE_LOG, source, {
    network,
    platformId,
    address,
    fetchedAt,
    result: data,
  });
}

/**
 * Stale-while-revalidate GraphQL profile + platform access (ProfilePortfolioOverview2).
 * Hydrates from sessionStorage, then refetches every time address/platformId/network change.
 */
export function useGraphqlProfileOverviewSWR(
  address: string | null,
  platformId: string | null,
  network: NetworkType
): {
  data: GraphqlProfileOverviewData | null;
  error: string | null;
  isRevalidating: boolean;
  revalidate: () => void;
} {
  const [data, setData] = useState<GraphqlProfileOverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRevalidating, setIsRevalidating] = useState(false);

  const revalidate = useCallback(() => {
    if (!address || !platformId) return;
    setIsRevalidating(true);
    setError(null);
    fetchProfilePortfolioOverview(address, platformId, network)
      .then((res) => {
        if (res.errors?.length) {
          setError(res.errors.map((e) => e.message).join('; '));
          return;
        }
        const next: GraphqlProfileOverviewData = {
          platformUserAccess: res.platformUserAccess,
          address: res.address,
          profile: res.profile,
        };
        logProfileLoad('graphql', {
          network,
          platformId,
          address,
          data: next,
        });
        setData(next);
        writeCachedProfilePortfolioOverview2(network, platformId, address, {
          data: next,
          fetchedAt: Date.now(),
        });
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Failed to load profile');
      })
      .finally(() => {
        setIsRevalidating(false);
      });
  }, [address, platformId, network]);

  useEffect(() => {
    if (!address || !platformId) {
      setData(null);
      setError(null);
      setIsRevalidating(false);
      return;
    }

    const stale = readCachedProfilePortfolioOverview2(network, platformId, address);
    if (stale) {
      setData(stale.data);
      logProfileLoad('cache', {
        network,
        platformId,
        address,
        fetchedAt: stale.fetchedAt,
        data: stale.data,
      });
    }

    revalidate();
  }, [address, platformId, network, revalidate]);

  useEffect(() => {
    if (!address || !platformId || typeof window === 'undefined') return;
    const onMembershipChange = () => {
      clearCachedProfilePortfolioOverview2(network, platformId, address);
      revalidate();
    };
    window.addEventListener(SOFISWAP_PROFILE_REVALIDATE_EVENT, onMembershipChange);
    return () =>
      window.removeEventListener(SOFISWAP_PROFILE_REVALIDATE_EVENT, onMembershipChange);
  }, [address, platformId, network, revalidate]);

  return { data, error, isRevalidating, revalidate };
}
