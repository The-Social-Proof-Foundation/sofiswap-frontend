'use client';

import { ChevronDown } from 'lucide-react';
import Image from 'next/image';
import { useMemo, type KeyboardEvent, type MouseEvent } from 'react';

import { ProfileMenuWalletCopyRow } from '@/components/trade/trade-nav-profile-menu';
import { usePoolOnchainMeta } from '@/hooks/usePoolOnchainMeta';
import { orderbookRuntimeNetwork } from '@/lib/orderbook/config';
import { useNetwork } from '@/lib/network-provider';
import {
  pairLabelForPoolKey,
  poolOnChainAddressForKey,
  poolTickerForKey,
  spotAssetSymbolDisplay,
} from '@/lib/trade/trade-pool-catalog';
import { cn } from '@/lib/utils';

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
          'relative z-[2] h-9 w-9 overflow-hidden rounded-full',
          'shadow-[0_0_0_2px_color-mix(in_srgb,var(--trade-shell-border)_75%,transparent)]'
        )}
      >
        <Image
          src="/MySo-icon-green.png"
          alt=""
          width={36}
          height={36}
          className="h-full w-full rounded-full object-cover"
        />
      </div>
      <div
        className="relative z-[1] flex h-9 w-9 items-center justify-center rounded-full border-[0.5px] border-sky-900/25 bg-sky-700 text-[11px] font-bold uppercase tracking-tight text-white shadow-sm dark:border-sky-950/35 dark:bg-sky-800"
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

function poolHeaderOpenSpotlightKeyDown(
  e: KeyboardEvent<HTMLDivElement>,
  onOpen: (() => void) | undefined
) {
  if (!onOpen) return;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    onOpen();
  }
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
  const { currentNetwork } = useNetwork();
  const obNet = orderbookRuntimeNetwork(currentNetwork);
  const poolOnchainMeta = usePoolOnchainMeta({
    poolName,
    obNet,
    enabled: Boolean(poolName.trim() && obNet),
  });

  const { base, quote, pairLabel, poolAddress } = useMemo(() => {
    const tick = poolTickerForKey(currentNetwork, poolName);
    return {
      base: spotAssetSymbolDisplay(tick.base),
      quote: spotAssetSymbolDisplay(tick.quote),
      pairLabel: pairLabelForPoolKey(currentNetwork, poolName),
      poolAddress: poolOnChainAddressForKey(currentNetwork, poolName),
    };
  }, [currentNetwork, poolName]);

  return (
    <div
      className={cn(
        'border-b border-trade-shell bg-background px-4 py-4 transition-colors',
        className
      )}
    >
      <span className="sr-only">{`${base} and ${quote} pool`}</span>

      <div
        role={onPoolPickerOpen ? 'button' : undefined}
        tabIndex={onPoolPickerOpen ? 0 : undefined}
        onClick={onPoolPickerOpen ? () => onPoolPickerOpen() : undefined}
        onKeyDown={
          onPoolPickerOpen
            ? (e) => poolHeaderOpenSpotlightKeyDown(e, onPoolPickerOpen)
            : undefined
        }
        aria-label={
          onPoolPickerOpen
            ? `Open pool search. Current pool: ${pairLabel}.`
            : undefined
        }
        className={cn(
          'flex w-full min-w-0 items-center gap-2 rounded-lg px-4 py-1.5 text-left -mx-2',
          'transition-colors',
          onPoolPickerOpen && [
            'cursor-pointer',
            'hover:bg-muted/60 dark:hover:bg-muted/35',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          ]
        )}
      >
        <OverlappingPairArt quoteSymbol={quote} className="pointer-events-none shrink-0" />

        <div className="flex min-w-0 flex-1 items-center gap-4">
          <div className="min-w-0 shrink overflow-hidden text-left">
            <div className="truncate text-base font-semibold leading-tight tracking-tight text-foreground">
              {pairLabel}
            </div>
            <div
              className="-mt-px pl-px"
              onClick={stopPoolRowActivation}
              onPointerDown={stopPoolRowActivation}
            >
              {poolAddress ? (
                <ProfileMenuWalletCopyRow
                  address={poolAddress}
                  addressHead={10}
                  addressTail={10}
                />
              ) : (
                <p className="text-xs text-[var(--muted-foreground)]">Pool address unavailable</p>
              )}
            </div>
            {poolOnchainMeta.data && !poolOnchainMeta.error ? (
              <p
                className="mt-0.5 truncate text-[10px] tabular-nums text-[var(--muted-foreground)]"
                title="On-chain pool book/trade params (simulated read)"
              >
                Tick {poolOnchainMeta.data.bookParams.tickSize.toPrecision(4)} · Min{' '}
                {poolOnchainMeta.data.bookParams.minSize.toPrecision(4)} · Taker{' '}
                {(poolOnchainMeta.data.tradeParams.takerFee * 100).toFixed(3)}% / maker{' '}
                {(poolOnchainMeta.data.tradeParams.makerFee * 100).toFixed(3)}%
              </p>
            ) : null}
          </div>

          <ChevronDown
            className={cn(
              'h-5 w-6 shrink-0 text-[var(--muted-foreground)] opacity-90',
              !onPoolPickerOpen && 'opacity-40'
            )}
            strokeWidth={2.5}
            aria-hidden
          />
        </div>
      </div>
    </div>
  );
}
