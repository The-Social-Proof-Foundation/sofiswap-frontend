'use client';

import { useEffect, useState } from 'react';

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
} {
  const [pools, setPools] = useState<ReservationPoolRow[]>([]);

  useEffect(() => {
    let inFlight: AbortController | null = null;

    const run = () => {
      inFlight?.abort();
      const ac = new AbortController();
      inFlight = ac;
      const baseUrl = getSocialIndexerRestBaseUrl(network);
      void fetchReservationPools({
        baseUrl,
        page: 1,
        limit: PAGE_SIZE,
        signal: ac.signal,
      })
        .then((result) => {
          if (!result.ok) {
            setPools([]);
            return;
          }
          setPools(result.data);
        })
        .catch((e) => {
          if (e instanceof DOMException && e.name === 'AbortError') return;
          setPools([]);
        });
    };

    run();
    const id = window.setInterval(run, REFRESH_INTERVAL_MS);
    return () => {
      window.clearInterval(id);
      inFlight?.abort();
    };
  }, [network]);

  return { pools, hasLiveData: pools.length > 0 };
}
