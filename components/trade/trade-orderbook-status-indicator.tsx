'use client';

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { Button } from '@/components/ui/button';
import { useNetwork } from '@/lib/network-provider';
import {
  fetchOrderbookStatus,
  getOrderbookStatusUrl,
  orderbookIndexerHealth,
  type OrderbookStatusResponse,
} from '@/lib/orderbook-status';
import { cn } from '@/lib/utils';
import { useEffect, useMemo, useState } from 'react';

const POLL_MS = 20_000;

type DisplayHealth = ReturnType<typeof orderbookIndexerHealth> | 'pending';

function orderbookStatusBadgeLabel(
  data: OrderbookStatusResponse | null,
  loadError: boolean,
  pending: boolean
): string {
  if (pending) return 'Loading';
  if (loadError) return 'Error';
  if (!data) return '—';
  return String(data.status).toUpperCase() === 'OK' ? 'Online' : data.status;
}

const bar = {
  triggerBg: 'bg-[#1a1a1a]',
  triggerHover: 'hover:bg-[#252525]',
  muted: 'text-[#a0a0a0]',
  mutedHover: 'hover:text-[#c8c8c8]',
  body: 'text-[#e0e0e0]',
  cardBg: 'bg-[#141414]',
  cardBorder: 'border-trade-shell',
} as const;

export function TradeOrderbookStatusIndicator() {
  const { currentNetwork } = useNetwork();
  const statusUrl = getOrderbookStatusUrl(currentNetwork);
  const obNet = statusUrl ? currentNetwork : null;

  const [data, setData] = useState<OrderbookStatusResponse | null>(null);
  const [loadError, setLoadError] = useState(false);

  /** No payload yet and no error — still fetching or waiting for first response. */
  const pending = Boolean(statusUrl && !data && !loadError);

  useEffect(() => {
    if (!statusUrl) {
      setData(null);
      setLoadError(false);
      return;
    }

    setData(null);
    setLoadError(false);

    const url = statusUrl;
    let cancelled = false;
    let intervalId: number | null = null;

    async function load() {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      try {
        const next = await fetchOrderbookStatus(url);
        if (cancelled) return;
        setData(next);
        setLoadError(false);
      } catch (e) {
        if (cancelled || (e as Error)?.name === 'AbortError') return;
        setLoadError(true);
        setData((prev) => prev);
      }
    }

    function armInterval() {
      if (intervalId != null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      void load();
      intervalId = window.setInterval(() => {
        void load();
      }, POLL_MS);
    }

    function onVisibilityChange() {
      if (typeof document === 'undefined') return;
      if (document.visibilityState === 'visible') {
        armInterval();
      } else if (intervalId != null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    }

    armInterval();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (intervalId != null) window.clearInterval(intervalId);
    };
  }, [statusUrl]);

  const displayHealth: DisplayHealth = useMemo(() => {
    if (pending) return 'pending';
    return orderbookIndexerHealth(data, loadError && !data);
  }, [pending, data, loadError]);

  const dotClass =
    obNet == null
      ? 'bg-[#505050] shadow-[0_0_6px_rgba(120,120,120,0.35)]'
      : displayHealth === 'pending'
        ? 'bg-[#6b7280] shadow-[0_0_8px_rgba(156,163,175,0.45)] animate-pulse'
        : displayHealth === 'healthy'
          ? 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.85)]'
          : displayHealth === 'degraded'
            ? 'bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.85)]'
            : 'bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.9)]';

  const label =
    obNet == null
      ? 'Indexer'
      : displayHealth === 'pending'
        ? 'Status'
        : displayHealth === 'healthy'
          ? 'Online'
          : displayHealth === 'degraded'
            ? 'Degraded'
            : 'Issue';

  if (!obNet) {
    return (
      <HoverCard openDelay={120}>
        <HoverCardTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className={cn(
              'h-full min-h-10 gap-1.5 rounded-none px-4 text-[13px] font-normal shadow-none md:px-6',
              bar.triggerBg,
              bar.muted,
              bar.triggerHover,
              bar.mutedHover
            )}
            aria-label="Orderbook status unavailable"
          >
            <span
              className={cn(
                'inline-flex h-2 w-2 shrink-0 rounded-full',
                dotClass
              )}
              aria-hidden
            />
            {label}
          </Button>
        </HoverCardTrigger>
        <HoverCardContent
          side="top"
          align="end"
          className={cn('w-72 border p-3 text-[11px]', bar.cardBg, bar.cardBorder, bar.body)}
        >
          <p className="font-medium text-[#e8e8e8]">Orderbook status</p>
          <p className="mt-2 leading-relaxed text-[#a8a8a8]">
            Set NEXT_PUBLIC_ORDERBOOK_INDEXER_LOCALNET_URL (or
            NEXT_PUBLIC_ORDERBOOK_STATUS_URL_LOCALNET) to report live
            indexer health on this network.
          </p>
        </HoverCardContent>
      </HoverCard>
    );
  }

  return (
    <HoverCard openDelay={120}>
      <HoverCardTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className={cn(
            'h-full min-h-10 gap-1.5 rounded-none px-4 text-[13px] font-normal shadow-none md:px-6',
            bar.triggerBg,
            bar.muted,
            bar.triggerHover,
            bar.mutedHover,
            displayHealth === 'healthy' &&
              data &&
              'hover:[&_.ob-status-dot]:shadow-[0_0_14px_rgba(52,211,153,0.95)]',
            displayHealth === 'degraded' &&
              data &&
              'hover:[&_.ob-status-dot]:shadow-[0_0_14px_rgba(251,191,36,0.95)]',
            displayHealth === 'unhealthy' &&
              (data || loadError) &&
              'hover:[&_.ob-status-dot]:shadow-[0_0_14px_rgba(239,68,68,0.95)]'
          )}
          aria-label={`Orderbook indexer: ${label}. Hover for details.`}
        >
          <span
            className={cn(
              'ob-status-dot inline-flex h-2 w-2 shrink-0 rounded-full transition-shadow duration-300',
              dotClass
            )}
            aria-hidden
          />
          <span className="tabular-nums">{label}</span>
        </Button>
      </HoverCardTrigger>
      <HoverCardContent
        side="top"
        align="end"
        className={cn(
          'w-72 space-y-3 border p-3 text-[11px]',
          bar.cardBg,
          bar.cardBorder,
          bar.body
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-[#e8e8e8]">Orderbook status</span>
          <span
            className={cn(
              'rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
              displayHealth === 'pending' && 'bg-white/10 text-[#a0a0a0]',
              displayHealth === 'healthy' && 'bg-emerald-500/15 text-emerald-400',
              displayHealth === 'degraded' && 'bg-amber-500/15 text-amber-300',
              displayHealth === 'unhealthy' && 'bg-red-500/15 text-red-400'
            )}
          >
            {orderbookStatusBadgeLabel(data, loadError, pending)}
          </span>
        </div>

        {loadError && !data ? (
          <p className="leading-relaxed text-[#c4c4c4]">
            Could not reach the indexer. Check your connection or try again
            shortly.
          </p>
        ) : data ? (
          <>
            {loadError ? (
              <p className="rounded-sm bg-amber-500/10 px-2 py-1.5 text-[10px] leading-snug text-amber-200/90">
                Could not refresh; showing last known status.
              </p>
            ) : null}
            <dl className="space-y-2 text-[#b0b0b0]">
              <div className="flex justify-between gap-3 gap-y-1">
                <dt className="shrink-0 text-[#888]">On-chain head</dt>
                <dd className="text-right font-mono tabular-nums text-[#e4e4e4]">
                  {data.latest_onchain_checkpoint.toLocaleString()}
                </dd>
              </div>
              <div className="flex justify-between gap-3 gap-y-1">
                <dt className="shrink-0 text-[#888]">Synced checkpoint</dt>
                <dd className="text-right font-mono tabular-nums text-[#e4e4e4]">
                  {data.earliest_checkpoint.toLocaleString()}
                </dd>
              </div>
              <div className="flex justify-between gap-3 gap-y-1">
                <dt className="shrink-0 text-[#888]">Lag (checkpoints)</dt>
                <dd className="text-right font-mono tabular-nums text-[#e4e4e4]">
                  {data.max_checkpoint_lag}
                </dd>
              </div>
            </dl>
          </>
        ) : (
          <p className="text-[#a8a8a8]">Loading…</p>
        )}

        <p className="border-t border-white/10 pt-2 text-[10px] text-[#666]">
          {obNet === 'testnet' ? 'Testnet' : obNet === 'localnet' ? 'Localnet' : 'Mainnet'} · Refreshes every{' '}
          {POLL_MS / 1000}s
        </p>
      </HoverCardContent>
    </HoverCard>
  );
}
