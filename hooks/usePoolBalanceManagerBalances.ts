'use client';

import { fetchBalanceManagerCoinBalance } from '@/lib/orderbook/runtime';
import type { OrderbookRuntimeNetwork } from '@/lib/orderbook/config';
import { getMySoJsonRpcClient } from '@/lib/myso-client';
import { poolExistsOnOrderbookNetwork, poolTickerForKey } from '@/lib/trade/trade-pool-catalog';
import type { NetworkType } from '@/lib/network-utils';
import { useCallback, useEffect, useState } from 'react';

export type UsePoolBalanceManagerBalancesArgs = {
  network: NetworkType;
  obNet: OrderbookRuntimeNetwork | null;
  poolName: string;
  primaryBalanceManagerId: string | null;
  displayAddress: string | null;
  pollIntervalMs?: number;
  enabled?: boolean;
};

export type PoolBalanceManagerBalances = {
  baseBalance: number | null;
  quoteBalance: number | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
};

/**
 * Reads the BalanceManager's base and quote coin balances for the active pool via
 * dev-inspect. Replaces mock balances in the swap panel. Polls at the same cadence
 * as open orders and refreshes after deposits/trades/withdrawals.
 */
export function usePoolBalanceManagerBalances({
  network,
  obNet,
  poolName,
  primaryBalanceManagerId,
  displayAddress,
  pollIntervalMs = 12_000,
  enabled = true,
}: UsePoolBalanceManagerBalancesArgs): PoolBalanceManagerBalances {
  const [baseBalance, setBaseBalance] = useState<number | null>(null);
  const [quoteBalance, setQuoteBalance] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const refresh = useCallback(() => {
    setRefreshNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    if (
      !enabled ||
      !obNet ||
      !poolName.trim() ||
      !primaryBalanceManagerId ||
      !displayAddress
    ) {
      setBaseBalance(null);
      setQuoteBalance(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    const poolKey = poolName.trim();
    if (!poolExistsOnOrderbookNetwork(poolKey, obNet)) {
      setBaseBalance(null);
      setQuoteBalance(null);
      setError('This market is not deployed on the selected network.');
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    let inFlight = false;
    const { base, quote } = poolTickerForKey(network, poolKey);
    const client = getMySoJsonRpcClient(network);

    const run = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      setIsLoading(true);
      setError(null);
      try {
        const [baseRes, quoteRes] = await Promise.all([
          fetchBalanceManagerCoinBalance({
            jsonRpcClient: client,
            simulationSender: displayAddress,
            balanceManagerObjectId: primaryBalanceManagerId,
            coinKey: base,
            network: obNet,
          }),
          fetchBalanceManagerCoinBalance({
            jsonRpcClient: client,
            simulationSender: displayAddress,
            balanceManagerObjectId: primaryBalanceManagerId,
            coinKey: quote,
            network: obNet,
          }),
        ]);
        if (cancelled) return;
        setBaseBalance(baseRes.ok ? baseRes.balance : null);
        setQuoteBalance(quoteRes.ok ? quoteRes.balance : null);
        const firstError = !baseRes.ok
          ? baseRes.error
          : !quoteRes.ok
            ? quoteRes.error
            : null;
        setError(firstError);
      } catch (e) {
        if (cancelled) return;
        setBaseBalance(null);
        setQuoteBalance(null);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        inFlight = false;
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void run();

    const useInterval = pollIntervalMs != null && pollIntervalMs > 0;
    const interval = useInterval
      ? window.setInterval(() => {
          void run();
        }, pollIntervalMs)
      : null;

    return () => {
      cancelled = true;
      if (interval != null) window.clearInterval(interval);
    };
  }, [
    enabled,
    network,
    obNet,
    poolName,
    primaryBalanceManagerId,
    displayAddress,
    pollIntervalMs,
    refreshNonce,
  ]);

  return { baseBalance, quoteBalance, isLoading, error, refresh };
}
