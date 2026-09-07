'use client';

import { useCallback } from 'react';
import { usePolledResource } from '@/hooks/usePolledResource';

import {
  fetchReservationPools,
  type ReservationPoolRow,
} from '@/lib/social-indexer/reservation-pools';
import type { NetworkType } from '@/lib/network-utils';
import { getSocialIndexerRestBaseUrl } from '@/lib/social-indexer/base-url';

const PAGE_SIZE = 20;
const REFRESH_INTERVAL_MS = 60_000;

export function useReservationPoolsMarquee(network: NetworkType): {
  pools: ReservationPoolRow[];
  hasLiveData: boolean;
  isLoading: boolean;
  error: string | null;
} {
  const load = useCallback(async () => {
    const result = await fetchReservationPools({ baseUrl: getSocialIndexerRestBaseUrl(network), page: 1, limit: PAGE_SIZE });
    if (!result.ok) throw new Error(result.error);
    return result.data;
  }, [network]);
  const resource = usePolledResource(`reservation-ticker:${network}`, load, REFRESH_INTERVAL_MS);
  const pools = resource.data ?? [];
  return { pools, hasLiveData: pools.length > 0, isLoading: resource.isLoading, error: resource.error };
}
