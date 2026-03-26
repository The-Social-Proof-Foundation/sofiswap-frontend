'use client';

import {
  CandlestickSeries,
  CrosshairMode,
  createChart,
  type CandlestickData,
  type ISeriesApi,
} from 'lightweight-charts';
import { useTheme } from 'next-themes';
import { useEffect, useRef } from 'react';

import { cn } from '@/lib/utils';

function readCssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function readCssVarOnElement(el: HTMLElement, name: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

export function TradeCandlestickChart({
  data,
  className,
  status,
  errorMessage,
  'aria-label': ariaLabel = 'Spot price candlestick chart',
}: {
  data: CandlestickData[] | null;
  className?: string;
  status?: 'loading' | 'error' | 'empty' | null;
  errorMessage?: string | null;
  'aria-label'?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const isDark = resolvedTheme !== 'light';
    const bg = readCssVar('--background', isDark ? '#2c302e' : '#9AE19D');
    const fg = readCssVar('--foreground', isDark ? '#9AE19D' : '#2C302E');
    const border = readCssVarOnElement(
      el,
      '--trade-shell-border',
      readCssVar('--border', isDark ? '#474A48' : '#909590')
    );
    const up = readCssVar('--chart-1', isDark ? '#9AE19D' : '#537A5A');
    const down = readCssVar('--destructive', isDark ? '#B91C1C' : '#DC2626');

    const chart = createChart(el, {
      layout: {
        background: { color: bg },
        textColor: fg,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: border, style: 1, visible: true },
        horzLines: { color: border, style: 1, visible: true },
      },
      rightPriceScale: { borderColor: border },
      timeScale: { borderColor: border, fixLeftEdge: true, fixRightEdge: false },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { color: fg, width: 1, style: 2, labelBackgroundColor: border },
        horzLine: { color: fg, width: 1, style: 2, labelBackgroundColor: border },
      },
      autoSize: true,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: up,
      downColor: down,
      borderVisible: true,
      wickUpColor: up,
      wickDownColor: down,
    });

    seriesRef.current = series;
    const initial = dataRef.current;
    if (initial?.length) series.setData(initial);
    else series.setData([]);

    return () => {
      chart.remove();
      seriesRef.current = null;
    };
  }, [resolvedTheme]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    if (data?.length) series.setData(data);
    else series.setData([]);
  }, [data]);

  const overlay =
    status === 'loading' ? (
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/50 text-sm text-muted-foreground">
        Loading chart…
      </div>
    ) : status === 'error' ? (
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/60 px-4 text-center text-sm text-destructive">
        {errorMessage ?? 'Could not load candles.'}
      </div>
    ) : status === 'empty' ? (
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/50 text-sm text-muted-foreground">
        No candle data for this range.
      </div>
    ) : null;

  return (
    <div
      className={cn('relative min-h-0 min-w-0 flex-1', className)}
      aria-label={ariaLabel}
    >
      <span className="sr-only">{ariaLabel}</span>
      <div
        ref={containerRef}
        className="h-full min-h-[200px] w-full [&_a[href*='tradingview']]:hidden"
      />
      {overlay}
    </div>
  );
}
