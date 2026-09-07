'use client';
import { useCallback, useMemo } from 'react';
import { usePolledResource } from '@/hooks/usePolledResource';
import { fetchSptDiscovery, sptSpotlightItems } from '@/lib/graphql/spt-discovery';
import type { NetworkType } from '@/lib/network-utils';

export function useSptDiscovery(network: NetworkType, offset = 0, limit = 100) {
  const load = useCallback(() => fetchSptDiscovery(network, limit, offset), [network, limit, offset]);
  const result = usePolledResource(`${network}:${offset}:${limit}`, load, 30_000);
  const items = useMemo(() => result.data ? sptSpotlightItems(result.data) : [], [result.data]);
  return { ...result, items, error: result.error || result.data?.errors?.map((e) => e.message).join('; ') || null };
}
