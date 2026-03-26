'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { orderbookRuntimeNetwork, type OrderbookRuntimeNetwork } from '@/lib/orderbook-config';
import {
  fetchRegisteredBalanceManagerIds,
  logBalanceManagerSnapshotToConsole,
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
}

export interface TradingSetupStatus {
  balanceManagerIds: string[];
  primaryBalanceManagerId: string | null;
  isLoading: boolean;
  error: string | null;
  /** mainnet/testnet orderbook path; localnet skips registry checks. */
  orderbookSkipped: boolean;
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
}: UseTradingSetupStatusArgs): TradingSetupStatus {
  const [balanceManagerIds, setBalanceManagerIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const obNet = orderbookRuntimeNetwork(network);
  const orderbookSkipped = obNet === null;
  const inFlight = useRef(false);
  const lastBalanceLogKey = useRef<string | null>(null);

  useEffect(() => {
    lastBalanceLogKey.current = null;
  }, [displayAddress, network]);

  const refresh = useCallback(
    async (opts?: { force?: boolean }) => {
      if (!displayAddress || !isAuthenticated || authLoading) {
        setBalanceManagerIds([]);
        setError(null);
        setIsLoading(false);
        return;
      }
      if (orderbookSkipped) {
        setBalanceManagerIds([]);
        setError(null);
        setIsLoading(false);
        return;
      }

      if (!opts?.force) {
        const cached = readTradingSetupCache(network, displayAddress);
        if (cached && cached.error == null) {
          setBalanceManagerIds(cached.ids);
          setError(null);
          setIsLoading(false);
          return;
        }
      }

      if (inFlight.current) return;
      inFlight.current = true;
      setIsLoading(true);
      setError(null);

      try {
        const client = getMySoJsonRpcClient(network);
        const res = await fetchRegisteredBalanceManagerIds(client, displayAddress);
        setBalanceManagerIds(res.ids);
        setError(res.error);
        writeTradingSetupCache(network, displayAddress, {
          ids: res.ids,
          error: res.error,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setBalanceManagerIds([]);
      } finally {
        setIsLoading(false);
        inFlight.current = false;
      }
    },
    [displayAddress, isAuthenticated, authLoading, network, orderbookSkipped]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const primaryBalanceManagerId = pickPrimaryBalanceManagerId(balanceManagerIds);

  useEffect(() => {
    if (orderbookSkipped || !displayAddress || !primaryBalanceManagerId || error) {
      return;
    }
    const net = obNet as OrderbookRuntimeNetwork;
    const dedupeKey = `${net}:${displayAddress}:${primaryBalanceManagerId}`;
    if (lastBalanceLogKey.current === dedupeKey) {
      return;
    }
    lastBalanceLogKey.current = dedupeKey;

    let cancelled = false;
    void (async () => {
      try {
        const rpc = getMySoJsonRpcClient(network);
        await logBalanceManagerSnapshotToConsole({
          jsonRpcClient: rpc,
          simulationSender: displayAddress,
          balanceManagerObjectId: primaryBalanceManagerId,
          network: net,
        });
      } catch (e) {
        if (!cancelled) {
          console.warn('[SofiSwap] BalanceManager snapshot log failed', e);
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
    obNet,
    orderbookSkipped,
    primaryBalanceManagerId,
  ]);

  return {
    balanceManagerIds,
    primaryBalanceManagerId,
    isLoading,
    error,
    orderbookSkipped,
    refresh: async (opts) => {
      if (displayAddress) {
        clearTradingSetupCacheForAddress(network, displayAddress);
      }
      await refresh({ ...opts, force: true });
    },
  };
}
