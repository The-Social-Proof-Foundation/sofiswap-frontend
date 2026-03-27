'use client';

import { useEffect, useState } from 'react';

/**
 * Slightly slower polling on small viewports and save-data connections.
 */
export function useAdaptiveTradePollMs(fastMs: number): number {
  const [ms, setMs] = useState(fastMs);

  useEffect(() => {
    const mq =
      typeof window !== 'undefined'
        ? window.matchMedia('(max-width: 767px)')
        : null;
    const update = () => {
      let v = fastMs;
      const conn =
        typeof navigator !== 'undefined'
          ? (navigator as Navigator & { connection?: NetworkInformation }).connection
          : undefined;
      if (mq?.matches) {
        v = Math.max(v, Math.round(fastMs * 1.6));
      }
      if (conn && 'saveData' in conn && conn.saveData) {
        v = Math.max(v, Math.round(fastMs * 3));
      }
      setMs(v);
    };
    update();
    mq?.addEventListener('change', update);
    return () => mq?.removeEventListener('change', update);
  }, [fastMs]);

  return ms;
}

type NetworkInformation = { saveData?: boolean };
