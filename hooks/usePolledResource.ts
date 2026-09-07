'use client';

import { useCallback, useEffect, useState } from 'react';

/** Keeps responses scoped to their network/subject and never overlaps polling requests. */
export function usePolledResource<T>(
  key: string | null,
  load: () => Promise<T>,
  pollIntervalMs: number | null = 20_000
): { data: T | null; error: string | null; isLoading: boolean; revalidate: () => void } {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ key: string | null; data: T | null; error: string | null; isLoading: boolean }>({
    key: null, data: null, error: null, isLoading: false,
  });
  const revalidate = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    let pending = false;
    const refresh = async () => {
      if (cancelled || pending) return;
      pending = true;
      setState((previous) => ({ key, data: previous.key === key ? previous.data : null, error: null, isLoading: true }));
      try {
        const data = await load();
        if (!cancelled) setState({ key, data, error: null, isLoading: false });
      } catch (error) {
        // Financial actions must not remain enabled on an unverified, stale snapshot.
        if (!cancelled) setState({ key, data: null, error: error instanceof Error ? error.message : 'Unable to refresh data.', isLoading: false });
      } finally {
        pending = false;
      }
    };
    void refresh();
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    const timer = pollIntervalMs && pollIntervalMs >= 2_000 ? window.setInterval(onVisible, pollIntervalMs) : null;
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [key, load, pollIntervalMs, revision]);
  return key && key === state.key ? { ...state, revalidate } : {
    data: null, error: null, isLoading: Boolean(key), revalidate,
  };
}
