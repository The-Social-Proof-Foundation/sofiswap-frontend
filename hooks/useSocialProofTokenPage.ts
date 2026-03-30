'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  fetchSocialProofTokenPage,
  type SocialProofTokenPageResult,
} from '@/lib/graphql/social-proof-token-page';
import type { NetworkType } from '@/lib/network-utils';

const DEFAULT_POLL_INTERVAL_MS = 20_000;

export interface UseSocialProofTokenPageArgs {
  profileAddress: string | null;
  poolId: string | null;
  network: NetworkType;
  enabled?: boolean;
  chartPoints?: number;
  holdersLimit?: number;
  txLimit?: number;
  /**
   * Refetch interval for near–real-time data (GraphQL client already uses no-store).
   * Set `null` to disable polling.
   */
  pollIntervalMs?: number | null;
}

export function useSocialProofTokenPage({
  profileAddress,
  poolId,
  network,
  enabled = true,
  chartPoints = 500,
  holdersLimit = 100,
  txLimit = 100,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}: UseSocialProofTokenPageArgs): {
  data: SocialProofTokenPageResult | null;
  error: string | null;
  isLoading: boolean;
  revalidate: () => void;
} {
  const [data, setData] = useState<SocialProofTokenPageResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const revalidate = useCallback(() => {
    if (!enabled || !profileAddress?.trim() || !poolId?.trim()) {
      setData(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    fetchSocialProofTokenPage({
      profileAddress: profileAddress.trim(),
      poolId: poolId.trim(),
      network,
      chartPoints,
      holdersLimit,
      txLimit,
    })
      .then((res) => {
        if (res.errors?.length) {
          setError(res.errors.map((e) => e.message).join('; '));
          setData(res);
          return;
        }
        setData(res);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Failed to load token');
        setData(null);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [enabled, profileAddress, poolId, network, chartPoints, holdersLimit, txLimit]);

  useEffect(() => {
    revalidate();
  }, [revalidate]);

  useEffect(() => {
    if (pollIntervalMs == null || pollIntervalMs < 2000) return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      revalidate();
    }, pollIntervalMs);
    return () => window.clearInterval(id);
  }, [pollIntervalMs, revalidate]);

  return { data, error, isLoading, revalidate };
}
