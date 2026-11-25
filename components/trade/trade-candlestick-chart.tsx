'use client';

import {
  CandlestickSeries,
  CrosshairMode,
  HistogramSeries,
  LineStyle,
  createChart,
  type CandlestickData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
} from 'lightweight-charts';
import { useTheme } from 'next-themes';
import { useEffect, useRef } from 'react';

import { tradeChartWellClass } from '@/lib/trade-shell-styles';
import { cn } from '@/lib/utils';
import type { TradeCandle } from '@/lib/orderbook-indexer/ohlcv';

function readCssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** Tokens are bare HSL triplets so Tailwind can add alpha. Canvas APIs need a real color. */
function canvasColor(token: string, fallback: string): string {
  const v = token.trim();
  if (!v) return fallback;
  if (v.startsWith('#') || v.startsWith('rgb') || v.startsWith('hsl') || v.startsWith('oklch')) {
    return v;
  }
  return `hsl(${v})`;
}

function priceFormatForCandles(data: CandlestickData[] | null): {
  type: 'price';
  precision: number;
  minMove: number;
} {
  const prices = (data ?? []).flatMap((c) => [c.open, c.high, c.low, c.close]);
  const min = Math.min(...prices.filter((n) => Number.isFinite(n) && n > 0));
  const precision = !Number.isFinite(min) ? 4 : min >= 100 ? 2 : min >= 1 ? 4 : min >= 0.01 ? 5 : 6;
  return { type: 'price', precision, minMove: 10 ** -precision };
}

function candleVolume(candle: CandlestickData): number {
  const volume = (candle as TradeCandle).volume;
  return volume != null && Number.isFinite(volume) && volume > 0 ? volume : 0;
}

export type ChartLegendCandle = {
  open: number;
  high: number;
  low: number;
  close: number;
};

export function TradeCandlestickChart({
  data,
  className,
  status,
  errorMessage,
  onLegendChange,
  'aria-label': ariaLabel = 'Spot price candlestick chart',
}: {
  data: CandlestickData[] | null;
  className?: string;
  status?: 'loading' | 'error' | 'empty' | null;
  errorMessage?: string | null;
  /** Last hovered candle; null when the crosshair leaves the plot. */
  onLegendChange?: (candle: ChartLegendCandle | null) => void;
  'aria-label'?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const priceLineRef = useRef<IPriceLine | null>(null);
  const colorsRef = useRef({ up: '#9AE19D', down: '#f07167' });
  const dataRef = useRef(data);
  const legendRef = useRef(onLegendChange);
  dataRef.current = data;
  legendRef.current = onLegendChange;
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const isDark = resolvedTheme !== 'light';
    const bg = isDark ? '#1a1d1c' : '#d5dbd8';
    const fg = canvasColor(readCssVar('--muted-foreground', ''), isDark ? '#939793' : '#5c6560');
    const grid = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(28,36,32,0.08)';
    const up = isDark ? '#9AE19D' : '#1f7a45';
    const down = isDark ? '#f07167' : '#DC2626';
    colorsRef.current = { up, down };

    const chart = createChart(el, {
      layout: {
        background: { color: bg },
        textColor: fg,
        fontFamily: 'inherit',
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: grid, style: LineStyle.Solid, visible: true },
        horzLines: { color: grid, style: LineStyle.Solid, visible: true },
      },
      rightPriceScale: {
        borderColor: grid,
        scaleMargins: { top: 0.08, bottom: 0.22 },
      },
      timeScale: {
        borderColor: grid,
        barSpacing: 9,
        minBarSpacing: 4,
        rightOffset: 8,
        fixLeftEdge: false,
        fixRightEdge: false,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: fg, width: 1, style: LineStyle.Dashed, labelBackgroundColor: isDark ? '#1a1c1b' : '#2c302e' },
        horzLine: { color: fg, width: 1, style: LineStyle.Dashed, labelBackgroundColor: isDark ? '#1a1c1b' : '#2c302e' },
      },
      autoSize: true,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: up,
      downColor: down,
      borderVisible: false,
      wickUpColor: up,
      wickDownColor: down,
      priceFormat: priceFormatForCandles(dataRef.current),
    });

    const volume = chart.addSeries(HistogramSeries, {
      priceScaleId: 'volume',
      priceFormat: { type: 'volume' },
      color: up,
      lastValueVisible: false,
      priceLineVisible: false,
    });
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
      visible: false,
    });

    const onMove = (param: MouseEventParams<Time>) => {
      const bar = param.seriesData.get(series);
      if (!bar || !('open' in bar)) {
        legendRef.current?.(null);
        return;
      }
      legendRef.current?.({
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      });
    };
    chart.subscribeCrosshairMove(onMove);

    seriesRef.current = series;
    volumeRef.current = volume;
    chartRef.current = chart;
    paintSeries(chart, series, volume, dataRef.current, colorsRef.current, priceLineRef);

    return () => {
      chart.unsubscribeCrosshairMove(onMove);
      chart.remove();
      seriesRef.current = null;
      volumeRef.current = null;
      chartRef.current = null;
      priceLineRef.current = null;
    };
  }, [resolvedTheme]);

  useEffect(() => {
    const series = seriesRef.current;
    const volume = volumeRef.current;
    const chart = chartRef.current;
    if (!series || !volume || !chart) return;
    if (data?.length) {
      series.applyOptions({ priceFormat: priceFormatForCandles(data) });
    }
    paintSeries(chart, series, volume, data, colorsRef.current, priceLineRef);
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
        No candle data yet for this market.
      </div>
    ) : null;

  return (
    <div
      className={cn('relative min-h-0 min-w-0 flex-1', tradeChartWellClass, className)}
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

function paintSeries(
  chart: IChartApi,
  series: ISeriesApi<'Candlestick'>,
  volume: ISeriesApi<'Histogram'>,
  data: CandlestickData[] | null,
  colors: { up: string; down: string },
  priceLineRef: { current: IPriceLine | null }
) {
  if (priceLineRef.current) {
    series.removePriceLine(priceLineRef.current);
    priceLineRef.current = null;
  }

  if (!data?.length) {
    series.setData([]);
    volume.setData([]);
    return;
  }

  series.setData(data);
  const upVol = hexAlpha(colors.up, 0.45);
  const downVol = hexAlpha(colors.down, 0.4);
  const bars = data
    .map((candle) => {
      const value = candleVolume(candle);
      if (value <= 0) return null;
      return {
        time: candle.time,
        value,
        color: candle.close >= candle.open ? upVol : downVol,
      };
    })
    .filter((bar): bar is NonNullable<typeof bar> => bar != null);
  volume.setData(bars);

  const last = data[data.length - 1]!;
  priceLineRef.current = series.createPriceLine({
    price: last.close,
    color: last.close >= last.open ? colors.up : colors.down,
    lineWidth: 1,
    lineStyle: LineStyle.Dashed,
    axisLabelVisible: true,
    title: '',
  });

  // A handful of prints stretched edge-to-edge read as solid blocks. Keep a
  // normal candle width and park the latest print on the right.
  if (data.length >= 48) {
    chart.timeScale().fitContent();
  } else {
    chart.timeScale().applyOptions({ barSpacing: 10, rightOffset: 6 });
    chart.timeScale().scrollToRealTime();
  }
}

function hexAlpha(hex: string, alpha: number): string {
  const raw = hex.replace('#', '');
  if (raw.length !== 6) return hex;
  const r = Number.parseInt(raw.slice(0, 2), 16);
  const g = Number.parseInt(raw.slice(2, 4), 16);
  const b = Number.parseInt(raw.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
