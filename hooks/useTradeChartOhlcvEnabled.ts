'use client';

import { useCallback, useEffect, useState, type RefCallback } from 'react';

/**
 * OHLCV should load only when the chart panel is likely visible: document is visible
 * and the chart container intersects the viewport.
 */
export function useTradeChartOhlcvEnabled(workspaceActive: boolean): {
  enabled: boolean;
  setChartContainerRef: RefCallback<HTMLDivElement>;
} {
  const [docVisible, setDocVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState === 'visible'
  );
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [intersects, setIntersects] = useState(false);

  const setChartContainerRef = useCallback((el: HTMLDivElement | null) => {
    setNode(el);
  }, []);

  useEffect(() => {
    const onVis = () => setDocVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  useEffect(() => {
    if (!workspaceActive || !node) {
      setIntersects(false);
      return;
    }
    if (typeof IntersectionObserver === 'undefined') {
      setIntersects(true);
      return;
    }
    const obs = new IntersectionObserver(
      ([e]) => {
        setIntersects(Boolean(e?.isIntersecting));
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [workspaceActive, node]);

  const enabled = workspaceActive && docVisible && intersects;

  return { enabled, setChartContainerRef };
}
