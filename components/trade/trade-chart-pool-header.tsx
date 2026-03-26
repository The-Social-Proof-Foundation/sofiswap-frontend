'use client';

import { ChevronDown } from 'lucide-react';
import Image from 'next/image';
import { useMemo, type MouseEvent } from 'react';

import { ProfileMenuWalletCopyRow } from '@/components/trade/trade-nav-profile-menu';
import { cn } from '@/lib/utils';

/** Placeholder pool object ID until metadata is loaded from chain / indexer */
const TRADE_CHART_POOL_OBJECT_ID =
  '0xc9f2e8a14d7b063451ac28f91e60d3b88a1f6e70432b9c0d8e5a7f13b2d4c6e8';

function OverlappingPairArt({
  quoteSymbol,
  className,
}: {
  quoteSymbol: string;
  className?: string;
}) {
  return (
    <div className={cn('flex shrink-0 items-center -space-x-2.5', className)} aria-hidden>
      <div
        className={cn(
          'relative z-[2] flex h-10 w-10 items-center justify-center overflow-hidden rounded-full p-0.5 shadow-sm',
          'bg-[var(--secondary)] dark:bg-[var(--secondary)]'
        )}
      >
        <Image
          src="/MySo-logo-green-m.png"
          alt=""
          width={40}
          height={40}
          className="h-full w-full rounded-full object-cover"
        />
      </div>
      <div
        className="relative z-[1] flex h-10 w-10 items-center justify-center rounded-full bg-sky-700 text-[11px] font-bold uppercase tracking-tight text-white shadow-sm dark:bg-sky-800"
        title={quoteSymbol}
      >
        {quoteSymbol.slice(0, 3)}
      </div>
    </div>
  );
}

function stopPoolRowActivation(e: MouseEvent) {
  e.stopPropagation();
}

export function TradeChartPoolHeader({
  poolName,
  className,
  onPoolPickerOpen,
}: {
  poolName: string;
  className?: string;
  onPoolPickerOpen?: () => void;
}) {
  const { base, quote, pairLabel } = useMemo(() => {
    const parts = poolName.split('_').filter(Boolean);
    const b = parts[0] ?? poolName;
    const q = parts[1] ?? '';
    return {
      base: b,
      quote: q || '—',
      pairLabel: q ? `${b} / ${q}` : b,
    };
  }, [poolName]);

  return (
    <div
      className={cn(
        'border-b border-trade-shell bg-background px-4 py-4 transition-colors',
        className
      )}
    >
      <span className="sr-only">{`${base} and ${quote} pool`}</span>

      <div
        className={cn(
          'flex w-full min-w-0 items-center gap-3 rounded-lg px-2 py-1.5 text-left -mx-2'
        )}
      >
        <div className="inline-flex min-w-0 max-w-full flex-1 items-center gap-3">
          <OverlappingPairArt quoteSymbol={quote} className="pointer-events-none shrink-0" />

          <div className="min-w-0 shrink">
            <div className="truncate text-base font-semibold leading-tight tracking-tight text-foreground">
              {pairLabel}
            </div>
            <div
              className="-mt-px pl-px"
              onClick={stopPoolRowActivation}
              onPointerDown={stopPoolRowActivation}
            >
              <ProfileMenuWalletCopyRow
                address={TRADE_CHART_POOL_OBJECT_ID}
                addressHead={10}
                addressTail={10}
              />
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onPoolPickerOpen?.()}
          disabled={!onPoolPickerOpen}
          aria-label={`Search pools. Current pool: ${pairLabel}.`}
          className={cn(
            'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
            'border border-trade-shell bg-muted/70 dark:bg-muted/45',
            'text-muted-foreground transition-colors',
            'hover:bg-muted/90 dark:hover:bg-muted/55',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            'disabled:pointer-events-none disabled:opacity-50'
          )}
        >
          <ChevronDown className="h-4 w-4 opacity-90" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
