'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  orderbookRuntimeNetwork,
  orderbookTradingNetwork,
  type OrderbookRuntimeNetwork,
} from '@/lib/orderbook/config';
import {
  type BalanceManagerSampleBalancesResult,
  fetchBalanceManagerSampleBalances,
  fetchRegisteredBalanceManagerIds,
  logBalanceManagerSampleBalancesToConsole,
  pickPrimaryBalanceManagerId,
} from '@/lib/orderbook/runtime';
import { getMySoJsonRpcClient } from '@/lib/myso-client';
import type { NetworkType } from '@/lib/network-utils';
import {
  clearTradingSetupCacheForAddress,
  readTradingSetupCache,
  writeTradingSetupCache,
} from '@/lib/trading-setup-cache';

export interface UseTradingSetupStatusArgs {
  isAuthenticated: boolean;
  displayAddress: string | null;
  authLoading: boolean;
  network: NetworkType;
  /** When false, skips registry fetch (e.g. inactive trade tabs). */
  enabled?: boolean;
}

export interface TradingSetupStatus {
  balanceManagerIds: string[];
  primaryBalanceManagerId: string | null;
  isLoading: boolean;
  error: string | null;
  /** mainnet/testnet orderbook path; localnet skips registry checks. */
  orderbookSkipped: boolean;
  /** Sampled MYSO/MYUSD BalanceManager balances after registry id resolve; null when not applicable. */
  balanceManagerBalances: BalanceManagerSampleBalancesResult | null;
  balanceManagerBalancesLoading: boolean;
  balanceManagerBalancesError: string | null;
  refresh: (opts?: { force?: boolean }) => Promise<void>;
}

/**
 * Resolves registry-linked BalanceManager IDs after login (mainnet/testnet).
 * Uses short-lived sessionStorage to smooth navigation; invalidated on network switch via {@link clearAllTradingSetupCache}.
 */
export function useTradingSetupStatus({
  isAuthenticated,
  displayAddress,
  authLoading,
  network,
  enabled = true,
}: UseTradingSetupStatusArgs): TradingSetupStatus {
  const [balanceManagerIds, setBalanceManagerIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balanceManagerBalances, setBalanceManagerBalances] =
    useState<BalanceManagerSampleBalancesResult | null>(null);
  const [balanceManagerBalancesLoading, setBalanceManagerBalancesLoading] = useState(false);
  const [balanceManagerBalancesError, setBalanceManagerBalancesError] = useState<string | null>(null);
  const readNet = orderbookRuntimeNetwork(network);
  const tradeNet = orderbookTradingNetwork(network);
  const orderbookSkipped = tradeNet === null;
  const inFlight = useRef(new Set<string>());
  const contextKey = `${network}:${displayAddress}:${isAuthenticated}:${enabled}`;
  const activeContext = useRef(contextKey);
  activeContext.current = contextKey;
  const [resolvedContext, setResolvedContext] = useState<string | null>(null);

  useEffect(() => {
    setBalanceManagerBalances(null);
    setBalanceManagerBalancesError(null);
    setBalanceManagerBalancesLoading(false);
  }, [displayAddress, network]);

  const refresh = useCallback(
    async (opts?: { force?: boolean }) => {
      if (!enabled) {
        setBalanceManagerIds([]);
        setError(null);
        setIsLoading(false);
        setBalanceManagerBalances(null);
        setBalanceManagerBalancesError(null);
        setBalanceManagerBalancesLoading(false);
        return;
      }
      if (!displayAddress || !isAuthenticated || authLoading) {
        setBalanceManagerIds([]);
        setError(null);
        setIsLoading(false);
        setBalanceManagerBalances(null);
        setBalanceManagerBalancesError(null);
        setBalanceManagerBalancesLoading(false);
        return;
      }
      if (orderbookSkipped) {
        setBalanceManagerIds([]);
        setError(null);
        setIsLoading(false);
        setBalanceManagerBalances(null);
        setBalanceManagerBalancesError(null);
        setBalanceManagerBalancesLoading(false);
        return;
      }

      if (!opts?.force) {
        const cached = readTradingSetupCache(network, displayAddress);
        if (cached && cached.error == null) {
          setResolvedContext(contextKey);
          setBalanceManagerIds(cached.ids);
          setError(null);
          setIsLoading(false);
          return;
        }
      }

      if (inFlight.current.has(contextKey)) return;
      inFlight.current.add(contextKey);
      setIsLoading(true);
      setError(null);

      try {
        const client = getMySoJsonRpcClient(network);
        const res = await fetchRegisteredBalanceManagerIds(client, displayAddress);
        if (activeContext.current !== contextKey) return;
        setResolvedContext(contextKey);
        setBalanceManagerIds(res.ids);
        setError(res.error);
        writeTradingSetupCache(network, displayAddress, {
          ids: res.ids,
          error: res.error,
        });
      } catch (e) {
        if (activeContext.current !== contextKey) return;
        setResolvedContext(contextKey);
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setBalanceManagerIds([]);
      } finally {
        if (activeContext.current === contextKey) setIsLoading(false);
        inFlight.current.delete(contextKey);
      }
    },
    [displayAddress, isAuthenticated, authLoading, network, orderbookSkipped, enabled, contextKey]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const scopedIds = resolvedContext === contextKey ? balanceManagerIds : [];
  const primaryBalanceManagerId = pickPrimaryBalanceManagerId(scopedIds);

  useEffect(() => {
    if (
      !enabled ||
      orderbookSkipped ||
      !displayAddress ||
      !primaryBalanceManagerId ||
      error
    ) {
      setBalanceManagerBalances(null);
      setBalanceManagerBalancesError(null);
      setBalanceManagerBalancesLoading(false);
      return;
    }
    const net: OrderbookRuntimeNetwork = readNet;

    let cancelled = false;
    setBalanceManagerBalancesLoading(true);
    setBalanceManagerBalancesError(null);
    void (async () => {
      try {
        const rpc = getMySoJsonRpcClient(network);
        const snapshot = await fetchBalanceManagerSampleBalances({
          jsonRpcClient: rpc,
          simulationSender: displayAddress,
          balanceManagerObjectId: primaryBalanceManagerId,
          network: net,
        });
        if (!cancelled) {
          setBalanceManagerBalances(snapshot);
          logBalanceManagerSampleBalancesToConsole(snapshot);
        }
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e);
          setBalanceManagerBalances(null);
          setBalanceManagerBalancesError(msg);
          console.warn('[SofiSwap] BalanceManager snapshot failed', e);
        }
      } finally {
        if (!cancelled) {
          setBalanceManagerBalancesLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    displayAddress,
    error,
    network,
    readNet,
    enabled,
    orderbookSkipped,
    primaryBalanceManagerId,
  ]);

  return {
    balanceManagerIds: scopedIds,
    primaryBalanceManagerId,
    isLoading: isLoading || Boolean(enabled && isAuthenticated && displayAddress && resolvedContext !== contextKey),
    error: resolvedContext === contextKey ? error : null,
    orderbookSkipped,
    balanceManagerBalances,
    balanceManagerBalancesLoading,
    balanceManagerBalancesError,
    refresh: async (opts) => {
      if (displayAddress) {
        clearTradingSetupCacheForAddress(network, displayAddress);
      }
      await refresh({ ...opts, force: true });
    },
  };
}
