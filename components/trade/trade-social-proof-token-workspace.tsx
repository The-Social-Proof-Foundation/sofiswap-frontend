'use client';

/**
 * Layout-only Social Proof Token detail view (chart + stats + bio + history + swap rail).
 * Data is mock/local state until GraphQL is wired.
 */

import { Button } from '@/components/ui/button';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { SlidingSegmentTabs, type SlidingSegmentItem } from '@/components/ui/sliding-segment-tabs';
import { Tabs, type UnderlineTabItem } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowDown,
  BarChart3,
  ChevronDown,
  Copy,
  Globe,
  LineChart,
  Settings,
} from 'lucide-react';
import { useMemo, useState } from 'react';

const railShell = cn(
  'grid gap-0 rounded-[10px] border border-trade-shell bg-muted/70 p-[3px] shadow-inner',
  'dark:bg-muted/40 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
);

const MOCK_TOKEN = {
  name: 'Rivermint Index',
  symbol: 'RVMX',
  address: '0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  about:
    'Rivermint Index tracks curated creator-economy flows on-chain with a volatility cap and daily rebalance. Holders earn fee share from routed social-volume swaps while governance sets the inclusion set and guardrails.',
} as const;

const MOCK_STATS = [
  { label: 'TVL', value: '$231.8M' },
  { label: 'Market cap', value: '$78.4B' },
  { label: 'FDV', value: '$1.004' },
  { label: '1 day volume', value: '$18.2M' },
  { label: '52W High', value: '$1.018' },
  { label: '52W Low', value: '0.982' },
] as const;

type Timeframe = '1H' | '1D' | '1W' | '1M' | '1Y' | 'ALL';

type TradeHistoryRow = {
  id: string;
  time: Date;
  side: 'buy' | 'sell';
  price: string;
  amount: string;
  total: string;
};

const MOCK_TRADES: TradeHistoryRow[] = [
  {
    id: '1',
    side: 'buy',
    time: new Date(Date.now() - 3 * 60_000),
    price: '1.0004',
    amount: '12,400',
    total: '12,405',
  },
  {
    id: '2',
    side: 'sell',
    time: new Date(Date.now() - 14 * 60_000),
    price: '0.9998',
    amount: '3,820',
    total: '3,819',
  },
  {
    id: '3',
    side: 'buy',
    time: new Date(Date.now() - 47 * 60_000),
    price: '1.0001',
    amount: '88,100',
    total: '88,119',
  },
  {
    id: '4',
    side: 'sell',
    time: new Date(Date.now() - 2 * 3_600_000),
    price: '0.9995',
    amount: '1,204',
    total: '1,203',
  },
  {
    id: '5',
    side: 'buy',
    time: new Date(Date.now() - 6 * 3_600_000),
    price: '1.0007',
    amount: '42,055',
    total: '42,084',
  },
  {
    id: '6',
    side: 'sell',
    time: new Date(Date.now() - 14 * 3_600_000),
    price: '0.9992',
    amount: '6,710',
    total: '6,705',
  },
];

type ReservationHistoryRow = {
  id: string;
  time: Date;
  holder: string;
  reservationId: string;
  allocated: string;
  received: string;
  status: 'filled' | 'partial' | 'pending';
};

const MOCK_RESERVATIONS: ReservationHistoryRow[] = [
  {
    id: 'r1',
    time: new Date(Date.now() - 22 * 60_000),
    holder: '0x8f3a291c9e21b18f4c8d2b7e04a92f1c5d6e7b88',
    reservationId: 'RSV-4182',
    allocated: '24,600 RVMX',
    received: '24,587.4 RVMX',
    status: 'filled',
  },
  {
    id: 'r2',
    time: new Date(Date.now() - 105 * 60_000),
    holder: '0x41c8d0e12f0a9b3c74e5f6228d1a7e9b0456c3d2',
    reservationId: 'RSV-4177',
    allocated: '5,000 RVMX',
    received: '2,840 RVMX',
    status: 'partial',
  },
  {
    id: 'r3',
    time: new Date(Date.now() - 9 * 3_600_000),
    holder: '0x92e7bb4f1d08a65c9e3d0a2f8b1c4e7a6d5e9043',
    reservationId: 'RSV-4161',
    allocated: '110,000 RVMX',
    received: '109,942 RVMX',
    status: 'filled',
  },
  {
    id: 'r4',
    time: new Date(Date.now() - 26 * 3_600_000),
    holder: '0x0a1b2c3d4e5f678901234567890abcdefabcd12',
    reservationId: 'RSV-4155',
    allocated: '3,200 RVMX',
    received: '—',
    status: 'pending',
  },
];

const chartConfig = {
  price: {
    label: 'Price',
    color: 'var(--chart-1)',
  },
} satisfies ChartConfig;

function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 10)}...${addr.slice(-10)}`;
}

function buildSeries(base: number, points: number, wobble: number) {
  const now = Date.now();
  const step = (36e5 * 4) / points;
  return Array.from({ length: points }, (_, i) => {
    const t = now - (points - 1 - i) * step;
    const noise = Math.sin(i * 0.35) * wobble + (i / points - 0.5) * (wobble * 0.25);
    return {
      t,
      label: format(t, 'MMM d, h:mm a'),
      price: Number((base + noise).toFixed(4)),
      volume: Math.round(180_000 + Math.sin(i * 0.5) * 42_000 + i * 900),
    };
  });
}

function TokenAvatar({
  symbol,
  className,
}: {
  symbol: string;
  className?: string;
}) {
  const initials = symbol.slice(0, 2).toUpperCase();
  return (
    <div
      className={cn(
        'flex size-11 shrink-0 items-center justify-center rounded-2xl border border-white/10',
        'bg-gradient-to-br from-zinc-700/90 to-zinc-900 text-sm font-semibold tracking-tight text-white',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]',
        className
      )}
      aria-hidden
    >
      {initials}
    </div>
  );
}

function StatGrid() {
  return (
    <section className="space-y-3" aria-labelledby="spt-stats-heading">
      <h2 id="spt-stats-heading" className="text-sm font-semibold text-foreground">
        Stats
      </h2>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
        {MOCK_STATS.map((s) => (
          <div key={s.label} className="space-y-1">
            <div className="text-[11px] font-medium text-[var(--muted-foreground)]">{s.label}</div>
            <div className="font-mono text-sm font-semibold tabular-nums text-foreground">
              {s.value}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function AboutBlock() {
  const [expanded, setExpanded] = useState(false);
  return (
    <section className="space-y-3" aria-labelledby="spt-about-heading">
      <h2 id="spt-about-heading" className="text-sm font-semibold text-foreground">
        About
      </h2>
      <p
        className={cn(
          'text-sm leading-relaxed text-[var(--muted-foreground)]',
          !expanded && 'line-clamp-3'
        )}
      >
        {MOCK_TOKEN.about}
      </p>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
      >
        {expanded ? 'Show less' : 'Show more'}
      </button>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 gap-2 rounded-full border-trade-shell bg-muted/40 px-4 font-normal"
        >
          <span className="font-mono text-xs text-[var(--muted-foreground)]">
            {truncateAddress(MOCK_TOKEN.address)}
          </span>
          <Copy className="size-3.5 opacity-70" strokeWidth={1.75} />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 rounded-full border-trade-shell bg-muted/40 px-4 font-normal"
        >
          Explorer
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 gap-2 rounded-full border-trade-shell bg-muted/40 px-4 font-normal"
        >
          <Globe className="size-3.5 opacity-70" strokeWidth={1.75} />
          Website
        </Button>
      </div>
    </section>
  );
}

function TradeHistoryTable({ rows }: { rows: TradeHistoryRow[] }) {
  return (
    <div
      className="overflow-hidden rounded-xl border border-trade-shell bg-muted/20 dark:bg-muted/10"
      role="region"
      aria-label="Token transaction history"
    >
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-trade-shell text-[var(--muted-foreground)]">
            <th className="px-3 py-2.5 font-medium">Time</th>
            <th className="px-3 py-2.5 font-medium">Side</th>
            <th className="px-3 py-2.5 text-right font-medium">Price</th>
            <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">Amount</th>
            <th className="px-3 py-2.5 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody className="font-mono tabular-nums">
          {rows.map((r) => (
            <tr
              key={r.id}
              className="border-b border-trade-shell/80 last:border-b-0 hover:bg-muted/30"
            >
              <td className="max-w-[8rem] truncate px-3 py-2 text-[var(--muted-foreground)]">
                {format(r.time, 'MMM d, h:mm a')}
              </td>
              <td className="px-3 py-2">
                <span
                  className={cn(
                    'font-sans font-semibold uppercase',
                    r.side === 'buy'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-500 dark:text-rose-400'
                  )}
                >
                  {r.side}
                </span>
              </td>
              <td className="px-3 py-2 text-right">{r.price}</td>
              <td className="hidden px-3 py-2 text-right sm:table-cell">{r.amount}</td>
              <td className="px-3 py-2 text-right text-foreground/90">${r.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function reservationStatusLabel(status: ReservationHistoryRow['status']) {
  switch (status) {
    case 'filled':
      return 'Filled';
    case 'partial':
      return 'Partial';
    case 'pending':
      return 'Pending';
    default:
      return status;
  }
}

function ReservationsHistoryTable({ rows }: { rows: ReservationHistoryRow[] }) {
  return (
    <div
      className="overflow-hidden rounded-xl border border-border bg-muted/20 dark:bg-muted/10"
      role="region"
      aria-label="Reservation holder history"
    >
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-border text-[var(--muted-foreground)]">
            <th className="px-3 py-2.5 font-medium">Time</th>
            <th className="px-3 py-2.5 font-medium">Holder</th>
            <th className="hidden px-3 py-2.5 font-medium md:table-cell">Reservation</th>
            <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">Allocated</th>
            <th className="px-3 py-2.5 text-right font-medium">Received</th>
            <th className="px-3 py-2.5 text-right font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="font-mono tabular-nums">
          {rows.map((r) => (
            <tr
              key={r.id}
              className="border-b border-border last:border-b-0 hover:bg-muted/30"
            >
              <td className="max-w-[8rem] truncate px-3 py-2 text-[var(--muted-foreground)]">
                {format(r.time, 'MMM d, h:mm a')}
              </td>
              <td className="max-w-[7rem] truncate px-3 py-2 text-foreground/90" title={r.holder}>
                {truncateAddress(r.holder)}
              </td>
              <td className="hidden px-3 py-2 md:table-cell">{r.reservationId}</td>
              <td className="hidden px-3 py-2 text-right sm:table-cell">{r.allocated}</td>
              <td className="px-3 py-2 text-right">{r.received}</td>
              <td className="px-3 py-2 text-right">
                <span
                  className={cn(
                    'font-sans text-[11px] font-medium',
                    r.status === 'filled' && 'text-emerald-600 dark:text-emerald-400',
                    r.status === 'partial' && 'text-amber-600 dark:text-amber-400',
                    r.status === 'pending' && 'text-[var(--muted-foreground)]'
                  )}
                >
                  {reservationStatusLabel(r.status)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const swapModeItems: SlidingSegmentItem[] = [
  { value: 'swap', label: 'Swap', triggerClassName: 'px-2 py-0 text-[12px] leading-tight' },
  { value: 'limit', label: 'Limit', triggerClassName: 'px-2 py-0 text-[12px] leading-tight' },
  { value: 'buy', label: 'Buy', triggerClassName: 'px-2 py-0 text-[12px] leading-tight' },
  { value: 'sell', label: 'Sell', triggerClassName: 'px-2 py-0 text-[12px] leading-tight' },
];

function SocialProofSwapCard() {
  const [swapMode, setSwapMode] = useState('swap');

  return (
    <div
      data-swap-mode={swapMode}
      className={cn(
        'flex h-full min-h-0 flex-col gap-4 p-4 md:p-5',
        'rounded-2xl border border-trade-shell bg-card/80',
        'shadow-[0_20px_44px_-28px_rgba(0,0,0,0.55)]',
        'dark:border-white/[0.07] dark:bg-zinc-900/45 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
      )}
    >
      <div className="flex items-start gap-2">
        <SlidingSegmentTabs
          value={swapMode}
          onValueChange={setSwapMode}
          className="min-w-0 flex-1"
          listClassName={cn(railShell, 'grid h-10 w-full grid-cols-4')}
          aria-label="Swap mode"
          items={swapModeItems}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-10 shrink-0 rounded-xl border border-trade-shell bg-muted/30"
          aria-label="Swap settings"
        >
          <Settings className="size-4" strokeWidth={1.75} />
        </Button>
      </div>

      <div className="relative space-y-0">
        <div
          className={cn(
            'space-y-2 rounded-2xl border border-trade-shell bg-muted/50 px-3 py-3',
            'dark:bg-muted/25'
          )}
        >
          <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
            Sell
          </div>
          <div className="flex items-end justify-between gap-2">
            <span className="text-2xl font-semibold tabular-nums text-foreground">0</span>
            <button
              type="button"
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border border-trade-shell bg-background/80 px-2.5 py-1.5',
                'text-xs font-medium text-foreground',
                'transition-transform active:scale-[0.98]'
              )}
            >
              <TokenAvatar symbol={MOCK_TOKEN.symbol} className="size-7 rounded-full text-[10px]" />
              <span className="max-w-[5.5rem] truncate">{MOCK_TOKEN.symbol}</span>
              <ChevronDown className="size-3.5 opacity-60" strokeWidth={1.75} />
            </button>
          </div>
          <div className="text-[11px] text-[var(--muted-foreground)]">$0</div>
        </div>

        <div className="relative z-[1] -my-3 flex justify-center">
          <button
            type="button"
            className={cn(
              'inline-flex size-10 items-center justify-center rounded-full border-2 border-background',
              'bg-muted text-foreground shadow-md',
              'transition-transform active:scale-[0.96]'
            )}
            aria-label="Swap sell and buy tokens"
          >
            <ArrowDown className="size-4" strokeWidth={1.75} />
          </button>
        </div>

        <div
          className={cn(
            'space-y-2 rounded-2xl border border-trade-shell bg-muted/50 px-3 py-3',
            'dark:bg-muted/25'
          )}
        >
          <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
            Buy
          </div>
          <div className="flex items-end justify-between gap-2">
            <span className="text-2xl font-semibold tabular-nums text-foreground">0</span>
            <button
              type="button"
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border border-trade-shell bg-background/80 px-2.5 py-1.5',
                'text-xs font-medium text-foreground',
                'transition-transform active:scale-[0.98]'
              )}
            >
              <div
                className={cn(
                  'flex size-7 items-center justify-center rounded-full border border-trade-shell',
                  'bg-muted/80 text-[10px] font-bold text-foreground'
                )}
                aria-hidden
              >
                ETH
              </div>
              <span className="max-w-[5.5rem] truncate">ETH</span>
              <ChevronDown className="size-3.5 opacity-60" strokeWidth={1.75} />
            </button>
          </div>
          <div className="text-[11px] text-[var(--muted-foreground)]">$0</div>
        </div>
      </div>

      <Button
        type="button"
        disabled
        className="h-12 w-full rounded-2xl font-semibold opacity-80"
      >
        Enter an amount
      </Button>
    </div>
  );
}

function PriceChartBlock({
  timeframe,
  onTimeframeChange,
}: {
  timeframe: Timeframe;
  onTimeframeChange: (t: Timeframe) => void;
}) {
  const [chartKind, setChartKind] = useState<'area' | 'bar'>('area');

  const data = useMemo(() => {
    const pts =
      timeframe === '1H'
        ? 32
        : timeframe === '1D'
          ? 48
          : timeframe === '1W'
            ? 56
            : timeframe === '1M'
              ? 60
              : timeframe === '1Y'
                ? 64
                : 72;
    const wobble =
      timeframe === 'ALL' ? 0.022 : timeframe === '1Y' ? 0.018 : timeframe === '1M' ? 0.012 : 0.008;
    return buildSeries(1.0, pts, wobble);
  }, [timeframe]);

  const tfItems: SlidingSegmentItem[] = useMemo(
    () =>
      (['1H', '1D', '1W', '1M', '1Y', 'ALL'] as Timeframe[]).map((tf) => ({
        value: tf,
        label: tf,
        triggerClassName: 'px-1.5 py-0 text-[11px] leading-tight min-w-0',
      })),
    []
  );

  return (
    <div className="space-y-3">
      <ChartContainer
        config={chartConfig}
        className={cn(
          'h-[min(42vw,280px)] w-full max-h-[320px] min-h-[200px] justify-start [&_.recharts-surface]:overflow-visible',
          'aspect-auto'
        )}
      >
        {chartKind === 'area' ? (
          <AreaChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="sptFillPrimary" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-price)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--color-price)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted/40" />
            <XAxis
              dataKey="t"
              tickFormatter={(v) => format(Number(v), 'MMM d')}
              tickLine={false}
              axisLine={false}
              minTickGap={28}
              tickMargin={8}
            />
            <YAxis
              orientation="right"
              tickLine={false}
              axisLine={false}
              width={48}
              domain={['auto', 'auto']}
              tickFormatter={(v) => Number(v).toFixed(3)}
            />
            <ChartTooltip
              cursor={{ stroke: 'var(--border)', strokeWidth: 1, strokeDasharray: '4 4' }}
              content={
                <ChartTooltipContent
                  labelFormatter={(_, p) => {
                    const row = p?.[0]?.payload as { label?: string } | undefined;
                    return row?.label ?? '';
                  }}
                />
              }
            />
            <Area
              type="monotone"
              dataKey="price"
              stroke="var(--color-price)"
              strokeWidth={2}
              fill="url(#sptFillPrimary)"
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        ) : (
          <BarChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted/40" />
            <XAxis
              dataKey="t"
              tickFormatter={(v) => format(Number(v), 'MMM d')}
              tickLine={false}
              axisLine={false}
              minTickGap={28}
              tickMargin={8}
            />
            <YAxis
              orientation="right"
              tickLine={false}
              axisLine={false}
              width={48}
              domain={['auto', 'auto']}
              tickFormatter={(v) => Number(v).toFixed(3)}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(_, p) => {
                    const row = p?.[0]?.payload as { label?: string } | undefined;
                    return row?.label ?? '';
                  }}
                />
              }
            />
            <Bar
              dataKey="price"
              fill="var(--color-price)"
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        )}
      </ChartContainer>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SlidingSegmentTabs
          value={timeframe}
          onValueChange={(v) => onTimeframeChange(v as Timeframe)}
          className="min-w-0 sm:max-w-[420px]"
          listClassName={cn(railShell, 'grid h-9 w-full grid-cols-6 sm:w-auto')}
          aria-label="Chart timeframe"
          items={tfItems}
        />
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="flex rounded-[10px] border border-trade-shell bg-muted/50 p-[2px] dark:bg-muted/30">
            <Button
              type="button"
              variant={chartKind === 'area' ? 'secondary' : 'ghost'}
              size="icon"
              className="size-8 rounded-md"
              onClick={() => setChartKind('area')}
              aria-label="Line chart"
            >
              <LineChart className="size-4" strokeWidth={1.75} />
            </Button>
            <Button
              type="button"
              variant={chartKind === 'bar' ? 'secondary' : 'ghost'}
              size="icon"
              className="size-8 rounded-md"
              onClick={() => setChartKind('bar')}
              aria-label="Bar chart"
            >
              <BarChart3 className="size-4" strokeWidth={1.75} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TradeSocialProofTokenWorkspace() {
  const [timeframe, setTimeframe] = useState<Timeframe>('1D');
  const [bottomTab, setBottomTab] = useState('transactions');

  const bottomTabs = useMemo((): UnderlineTabItem[] => {
    return [
      { id: 'transactions', label: 'Transactions' },
      { id: 'reservations', label: 'Reservations' },
    ];
  }, []);

  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain bg-background font-satoshi text-foreground',
        'lg:flex-row lg:items-start'
      )}
      aria-label="Social proof token workspace"
    >
      <div className="min-w-0 flex-1">
        <div className="mx-auto max-w-5xl px-4 py-5 md:px-6 md:py-6 lg:max-w-none lg:pr-6 xl:max-w-6xl">
          <header className="pb-5">
            <div className="flex min-w-0 gap-3">
              <TokenAvatar symbol={MOCK_TOKEN.symbol} />
              <div className="min-w-0 space-y-0.5">
                <div className="flex flex-wrap items-baseline gap-2">
                  <h1 className="truncate text-xl font-semibold tracking-tight md:text-2xl">
                    {MOCK_TOKEN.name}
                  </h1>
                  <span className="text-sm font-medium text-[var(--muted-foreground)]">
                    {MOCK_TOKEN.symbol}
                  </span>
                </div>
                <p className="font-mono text-xs text-[var(--muted-foreground)]">
                  {truncateAddress(MOCK_TOKEN.address)}
                </p>
              </div>
            </div>
          </header>

          <div className="space-y-1 pb-4">
            <p className="font-mono text-3xl font-semibold tabular-nums tracking-tight md:text-4xl">
              $1.00
            </p>
            <p className="flex flex-wrap items-center gap-2 text-sm text-[var(--muted-foreground)]">
              <span className="font-medium text-emerald-500 dark:text-emerald-400">+ $0.00</span>
              <span>(0.08%)</span>
            </p>
          </div>

          <PriceChartBlock timeframe={timeframe} onTimeframeChange={setTimeframe} />

          <div className="mt-8 space-y-8 pb-8">
            <StatGrid />
            <AboutBlock />
            <section className="space-y-3" aria-label="Transactions and reservations">
              <Tabs
                tabs={bottomTabs}
                activeTab={bottomTab}
                onTabChange={setBottomTab}
                aria-label="Token activity"
                listClassName="gap-4 border-b border-border pb-0"
                triggerClassName="px-1 py-2 text-sm font-medium"
              />
              {bottomTab === 'transactions' ? (
                <TradeHistoryTable rows={MOCK_TRADES} />
              ) : (
                <ReservationsHistoryTable rows={MOCK_RESERVATIONS} />
              )}
            </section>
          </div>
        </div>
      </div>

      <aside
        className={cn(
          'w-full shrink-0 border-t border-trade-shell bg-muted/15 px-4 py-5 md:px-6',
          'lg:w-[min(100%,420px)] lg:border-t-0 lg:px-5 lg:py-6 xl:w-[440px]'
        )}
        aria-label="Swap"
      >
        <SocialProofSwapCard />
      </aside>
    </div>
  );
}
