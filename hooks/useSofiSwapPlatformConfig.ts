'use client';
import { useCallback } from 'react';
import { usePolledResource } from '@/hooks/usePolledResource';
import type { NetworkType } from '@/lib/network-utils';
import {
  missingSofiSwapPlatformConfigMessage,
  sofiSwapPlatformConfigFromChain,
  type SofiSwapPlatformConfig,
} from '@/lib/platform-config';
import { resolveSptChainConfig } from '@/lib/spt/chain-config';

/** Current-network object discovery, with env ids over GraphQL and stale network responses discarded. */
export function useSofiSwapPlatformConfig(network: NetworkType) {
  const load = useCallback(async (): Promise<SofiSwapPlatformConfig> => {
    const chain = await resolveSptChainConfig(network, { force: true });
    const config = sofiSwapPlatformConfigFromChain(network, chain);
    if (!config) throw new Error(missingSofiSwapPlatformConfigMessage(network, chain));
    return config;
  }, [network]);
  const result = usePolledResource(network, load, 60_000);
  return { config: result.data, isLoading: result.isLoading, error: result.error, revalidate: result.revalidate };
}
