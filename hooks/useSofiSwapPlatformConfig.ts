'use client';
import { useCallback } from 'react';
import { usePolledResource } from '@/hooks/usePolledResource';
import type { NetworkType } from '@/lib/network-utils';
import type { SofiSwapPlatformConfig } from '@/lib/platform-config';
import { resolveSptChainConfig } from '@/lib/spt/chain-config';

/** Current-network object discovery, with stale network responses discarded. */
export function useSofiSwapPlatformConfig(network: NetworkType) {
  const load = useCallback(async (): Promise<SofiSwapPlatformConfig> => {
    const chain = await resolveSptChainConfig(network, { force: true });
    if (!chain.platformId) throw new Error('SofiSwap is not registered as an approved platform on this network.');
    return {
      platformGraphqlId: chain.platformId,
      platformPackageId: chain.packageId,
      platformRegistryObjectId: chain.platformRegistryId,
      blockListRegistryObjectId: chain.blockListRegistryId,
    };
  }, [network]);
  const result = usePolledResource(network, load, 60_000);
  return { config: result.data, isLoading: result.isLoading, error: result.error, revalidate: result.revalidate };
}
