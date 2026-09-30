'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Coins, FileText, UserRound } from 'lucide-react';

import { useMySocialAuth } from '@/hooks/useMySocialAuth';
import { useOwnedSptPositions } from '@/hooks/useSptPortfolio';
import { useNetwork } from '@/lib/network-provider';
import { findPositionForSubject, type SptOwnedPosition } from '@/lib/spt/owned-positions';
import { cn } from '@/lib/utils';

/**
 * Token-page reminder of the Social Proof Tokens this wallet holds.
 *
 * The page only ever describes one subject, so without this strip a holder has no way
 * to see (or reach) the rest of their positions from `/trade/spt/:address`.
 */

function StripThumb({ position }: { position: SptOwnedPosition }) {
  return (
    <span
      className={cn(
        'relative grid size-6 shrink-0 place-items-center overflow-hidden bg-primary/10 text-primary',
        position.avatarShape === 'circle' ? 'rounded-full' : 'rounded-[3px]'
      )}
    >
      {position.thumbUrl ? (
        <Image src={position.thumbUrl} alt="" fill className="object-cover" unoptimized sizes="24px" />
      ) : position.tokenType === 2 ? (
        <FileText className="size-3" aria-hidden />
      ) : (
        <UserRound className="size-3" aria-hidden />
      )}
    </span>
  );
}

function PositionChip({ position, current }: { position: SptOwnedPosition; current: boolean }) {
  const body = (
    <>
      <StripThumb position={position} />
      <span className="text-xs font-semibold text-foreground">{position.symbol}</span>
      <span className="text-xs tabular-nums text-muted-foreground">{position.amountDisplay}</span>
      {current ? (
        <span className="text-[10px] font-medium uppercase tracking-wide text-primary">this token</span>
      ) : (
        <ArrowRight className="size-3 text-muted-foreground" aria-hidden />
      )}
    </>
  );

  if (current) {
    return (
      <span
        className="flex shrink-0 items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1"
        aria-label={`${position.symbol} held: ${position.amountDisplay}`}
      >
        {body}
      </span>
    );
  }

  return (
    <Link
      href={position.href}
      className="flex shrink-0 items-center gap-2 rounded-full border border-trade-shell bg-muted/40 px-2.5 py-1 transition-colors hover:bg-muted/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
      aria-label={`Trade ${position.symbol}: ${position.amountDisplay} held`}
    >
      {body}
    </Link>
  );
}

export function SptOwnedPositionsStrip({
  profileAddress = null,
  postId = null,
  className,
}: {
  profileAddress?: string | null;
  postId?: string | null;
  className?: string;
}) {
  const { currentNetwork } = useNetwork();
  const { displayAddress, isAuthenticated } = useMySocialAuth();
  const { positions, isLoading, error } = useOwnedSptPositions({
    network: currentNetwork,
    owner: displayAddress,
    enabled: isAuthenticated,
  });

  const current = findPositionForSubject(positions, { profileAddress, postId });
  if (!isAuthenticated || error || isLoading || positions.length === 0) return null;

  const currentPoolId = current?.poolId ?? null;
  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-3 overflow-x-auto border-b border-trade-shell bg-muted/20 px-4 py-2 sm:px-6',
        className
      )}
      aria-label="Your Social Proof Token positions"
    >
      <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Coins className="size-3.5" aria-hidden />
        Your SPT
      </span>
      <div className="flex min-w-0 items-center gap-2">
        {positions.map((position) => (
          <PositionChip key={position.poolId} position={position} current={position.poolId === currentPoolId} />
        ))}
      </div>
      <Link
        href="/trade/spt"
        className="ml-auto shrink-0 whitespace-nowrap text-xs text-muted-foreground hover:text-foreground"
      >
        All tokens →
      </Link>
    </div>
  );
}
