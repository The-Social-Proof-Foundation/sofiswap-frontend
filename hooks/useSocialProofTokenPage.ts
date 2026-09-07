'use client';

import { useCallback } from 'react';
import { usePolledResource } from '@/hooks/usePolledResource';
import { fetchSocialProofTokenPage } from '@/lib/graphql/social-proof-token-page';
import type { NetworkType } from '@/lib/network-utils';

export interface UseSocialProofTokenPageArgs {
  profileAddress: string | null;
  poolId?: string | null;
  viewer?: string | null;
  network: NetworkType;
  enabled?: boolean;
  chartPoints?: number;
  holdersLimit?: number;
  txLimit?: number;
  pollIntervalMs?: number | null;
}

export function useSocialProofTokenPage({
  profileAddress, viewer, network, enabled = true, chartPoints = 500,
  holdersLimit = 100, txLimit = 100, pollIntervalMs = 20_000,
}: UseSocialProofTokenPageArgs) {
  const load = useCallback(() => fetchSocialProofTokenPage({
    profileAddress: profileAddress!, viewer, network, chartPoints, holdersLimit, txLimit,
  }), [profileAddress, viewer, network, chartPoints, holdersLimit, txLimit]);
  const result = usePolledResource(enabled && profileAddress ? `${network}:${profileAddress}:${viewer}` : null, load, pollIntervalMs);
  return { ...result, error: result.error || result.data?.errors?.map((e) => e.message).join('; ') || null };
}
