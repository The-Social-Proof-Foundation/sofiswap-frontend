'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo } from 'react';
import { ArrowRight, Coins, FileText, UserRound, Wallet } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { WalletTokenBalance } from '@/lib/graphql/wallet-token-balances';
import { baseUnitsToDisplay } from '@/lib/spt/amounts';
import type { SptOwnedPosition } from '@/lib/spt/owned-positions';
import { tradeSptRoundedPanelClass } from '@/lib/trade-shell-styles';
import { cn } from '@/lib/utils';

/**
 * The connected wallet's tokens: Social Proof Tokens it can sell, plus the native
 * coins it can trade with. Rendered on the Social Proof Token directory, and fed by
 * `useSptPortfolio` so the directory and this panel share one set of reads.
 */

function PositionThumb({ position }: { position: SptOwnedPosition }) {
  const shape = position.avatarShape === 'circle' ? 'rounded-full' : 'rounded-[3.75px]';
  return (
    <span
      className={cn(
        'relative grid size-9 shrink-0 place-items-center overflow-hidden bg-primary/10 text-primary',
        shape
      )}
    >
      {position.thumbUrl ? (
        <Image src={position.thumbUrl} alt="" fill className="object-cover" unoptimized sizes="36px" />
      ) : position.tokenType === 2 ? (
        <FileText className="size-4" aria-hidden />
      ) : (
        <UserRound className="size-4" aria-hidden />
      )}
    </span>
  );
}

function OwnedPositionRow({ position }: { position: SptOwnedPosition }) {
  return (
    <li className="flex min-w-0 items-center gap-3 py-3">
      <PositionThumb position={position} />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold text-foreground">{position.title}</span>
          <span
            className={cn(
              'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
              position.live ? 'bg-primary/15 text-primary' : 'bg-muted/50 text-muted-foreground'
            )}
          >
            {position.live ? 'Live' : 'Reserved'}
          </span>
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {position.tokenType === 2 ? 'Post SPT' : 'Profile SPT'} {position.detail}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-sm font-semibold tabular-nums text-foreground">
          {position.amountDisplay} {position.symbol}
        </span>
        <span className="mt-0.5 block text-xs tabular-nums text-muted-foreground">
          {position.redeemableMysoBaseUnits > BigInt(0)
            ? `≈ ${position.redeemableMysoDisplay} MySo`
            : 'Curve value unavailable'}
        </span>
      </span>
      <Button asChild variant="outline" size="sm" className="shrink-0 rounded-full">
        <Link href={position.href} aria-label={`Trade ${position.symbol}`}>
          Trade
          <ArrowRight className="ml-1.5 size-3.5" aria-hidden />
        </Link>
      </Button>
    </li>
  );
}

function WalletTokenRow({ token }: { token: WalletTokenBalance }) {
  return (
    <li className="flex min-w-0 items-baseline justify-between gap-3 py-2">
      <span className="min-w-0 truncate text-sm font-medium text-foreground" title={token.coinType}>
        {token.symbol}
        {token.isMyso ? <span className="ml-2 text-[11px] font-normal text-muted-foreground">swap gas + payment</span> : null}
      </span>
      <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{token.amountDisplay}</span>
    </li>
  );
}

export function SptPortfolioPanel({
  positions,
  walletTokens,
  isLoading,
  error,
  onRefresh,
  className,
}: {
  positions: ReadonlyArray<SptOwnedPosition>;
  walletTokens: ReadonlyArray<WalletTokenBalance>;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  className?: string;
}) {
  const ownedValueMyso = useMemo(
    () => positions.reduce((total, position) => total + position.redeemableMysoBaseUnits, BigInt(0)),
    [positions]
  );
  const ownedValueDisplay = useMemo(() => baseUnitsToDisplay(ownedValueMyso, 4), [ownedValueMyso]);
  const summary = useMemo(() => {
    if (isLoading && positions.length === 0) return 'Reading your wallet…';
    if (positions.length === 0) return 'Trading tokens held by the wallet you are signed in with';
    const live = positions.filter((position) => position.live).length;
    const held = `${positions.length} Social Proof Token${positions.length === 1 ? '' : 's'} held`;
    const tradable = live === positions.length ? '' : `, ${live} live`;
    return `${held}${tradable}, about ${ownedValueDisplay} MySo on the curve`;
  }, [isLoading, positions, ownedValueDisplay]);

  return (
    <section className={cn(tradeSptRoundedPanelClass, 'space-y-4', className)} aria-label="Your tokens">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
            <Wallet className="size-3.5" aria-hidden />
            Your tokens
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">{summary}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={isLoading}
          className="shrink-0 rounded-full"
        >
          {isLoading ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-foreground"
        >
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Coins className="size-3.5" aria-hidden />
            Social Proof Tokens you own
          </p>
          {positions.length === 0 ? (
            <p className="mt-3 text-sm leading-6 text-muted-foreground" role="status">
              {isLoading
                ? 'Checking your wallet for Social Proof Tokens…'
                : 'No Social Proof Tokens in this wallet yet. Reserve before launch or buy a live token below, and it will show up here.'}
            </p>
          ) : (
            <ul className="mt-1 divide-y divide-trade-shell border-y border-trade-shell">
              {positions.map((position) => (
                <OwnedPositionRow key={position.poolId} position={position} />
              ))}
            </ul>
          )}
        </div>

        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Wallet tokens</p>
          {walletTokens.length === 0 ? (
            <p className="mt-3 text-sm leading-6 text-muted-foreground" role="status">
              {isLoading ? 'Reading wallet balances…' : 'No spendable balances found in this wallet.'}
            </p>
          ) : (
            <ul className="mt-1 divide-y divide-trade-shell/70 border-y border-trade-shell">
              {walletTokens.map((token) => (
                <WalletTokenRow key={token.coinType} token={token} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
