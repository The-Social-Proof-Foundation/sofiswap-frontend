'use client';

import { useCallback } from 'react';

import { usePolledResource } from '@/hooks/usePolledResource';
import { fetchWalletTokenBalances, type WalletTokenBalance } from '@/lib/graphql/wallet-token-balances';
import type { NetworkType } from '@/lib/network-utils';
import { fetchOwnedSptPositions, type SptOwnedPosition } from '@/lib/spt/owned-positions';

/** Chain reads, so this stays slower than the indexer-backed market polls. */
const POSITION_POLL_MS = 30_000;
const BALANCE_POLL_MS = 30_000;

export interface SptPortfolioInput {
  network: NetworkType;
  owner: string | null | undefined;
  enabled?: boolean;
}

function ownerKey(owner: string | null | undefined): string | null {
  return owner?.trim().toLowerCase() || null;
}

/** Social Proof Tokens the connected wallet can sell right now. */
export function useOwnedSptPositions({ network, owner, enabled = true }: SptPortfolioInput) {
  const viewer = ownerKey(owner);
  const load = useCallback(
    () => (viewer ? fetchOwnedSptPositions({ network, owner: viewer }) : Promise.resolve([])),
    [network, viewer]
  );
  const result = usePolledResource<SptOwnedPosition[]>(
    enabled && viewer ? `spt-positions:${network}:${viewer}` : null,
    load,
    POSITION_POLL_MS
  );
  return { positions: result.data ?? [], isLoading: result.isLoading, error: result.error, revalidate: result.revalidate };
}

/** Native wallet tokens — including the MYSO that pays for SPT swaps. */
export function useWalletTokenBalances({ network, owner, enabled = true }: SptPortfolioInput) {
  const viewer = ownerKey(owner);
  const load = useCallback(
    () => (viewer ? fetchWalletTokenBalances({ network, owner: viewer }) : Promise.resolve([])),
    [network, viewer]
  );
  const result = usePolledResource<WalletTokenBalance[]>(
    enabled && viewer ? `wallet-tokens:${network}:${viewer}` : null,
    load,
    BALANCE_POLL_MS
  );
  return { tokens: result.data ?? [], isLoading: result.isLoading, error: result.error, revalidate: result.revalidate };
}

/** Positions plus native balances, refreshed together from one caller. */
export function useSptPortfolio(input: SptPortfolioInput) {
  const positions = useOwnedSptPositions(input);
  const wallet = useWalletTokenBalances(input);
  const { revalidate: revalidatePositions } = positions;
  const { revalidate: revalidateWallet } = wallet;
  const revalidate = useCallback(() => {
    revalidatePositions();
    revalidateWallet();
  }, [revalidatePositions, revalidateWallet]);

  return {
    positions: positions.positions,
    walletTokens: wallet.tokens,
    isLoading: positions.isLoading || wallet.isLoading,
    error: positions.error ?? wallet.error ?? null,
    revalidate,
  };
}
