'use client';

import {
  getOrderbookUserClient,
  TRADE_BALANCE_MANAGER_KEY,
} from '@/lib/orderbook/orderbook-read-client';
import type { OrderbookRuntimeNetwork } from '@/lib/orderbook/config';
import { marketLabelFromPool, type OpenOrderRow } from '@/lib/trade/activity-tables';
import { poolExistsOnOrderbookNetwork } from '@/lib/trade/trade-pool-catalog';
import {
  FLOAT_SCALAR,
  mainnetCoins,
  mainnetPools,
  testnetCoins,
  testnetPools,
} from '@socialproof/orderbook';
import { useCallback, useEffect, useState } from 'react';

/** Keep batches small to stay under RPC limits and reduce tx size. */
const GET_ORDERS_CHUNK = 40;

function toOrderIdString(id: unknown): string {
  if (typeof id === 'bigint') return id.toString(10);
  if (typeof id === 'number' && Number.isFinite(id)) return String(Math.trunc(id));
  if (typeof id === 'string') return id.trim();
  return String(id ?? '').trim();
}

function scalarsForPool(poolKey: string, obNet: OrderbookRuntimeNetwork): {
  baseScalar: number;
  quoteScalar: number;
} {
  const pools = obNet === 'mainnet' ? mainnetPools : testnetPools;
  const coins = obNet === 'mainnet' ? mainnetCoins : testnetCoins;
  const pool = pools[poolKey as keyof typeof pools] as
    | (typeof pools)[keyof typeof pools]
    | undefined;
  if (!pool) {
    throw new Error(`Unknown pool key: ${poolKey}`);
  }
  const base = coins[pool.baseCoin as keyof typeof coins] as { scalar: number };
  const quote = coins[pool.quoteCoin as keyof typeof coins] as { scalar: number };
  return { baseScalar: base.scalar, quoteScalar: quote.scalar };
}

export type UseAccountOpenOrdersArgs = {
  poolName: string;
  obNet: OrderbookRuntimeNetwork | null;
  primaryBalanceManagerId: string | null;
  pollIntervalMs?: number;
  enabled?: boolean;
};

export function useAccountOpenOrders({
  poolName,
  obNet,
  primaryBalanceManagerId,
  pollIntervalMs = 12_000,
  enabled = true,
}: UseAccountOpenOrdersArgs): {
  rows: OpenOrderRow[];
  error: string | null;
  isLoading: boolean;
  refresh: () => void;
} {
  const [rows, setRows] = useState<OpenOrderRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const refresh = useCallback(() => {
    setRefreshNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    if (
      !enabled ||
      !poolName.trim() ||
      !obNet ||
      !primaryBalanceManagerId
    ) {
      setRows([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    const poolKey = poolName.trim();
    const managerId = primaryBalanceManagerId;
    let cancelled = false;
    let inFlight = false;

    const run = async () => {
      if (cancelled || inFlight) return;
      if (!poolExistsOnOrderbookNetwork(poolKey, obNet)) {
        setRows([]);
        setError('This market is not deployed on the selected network.');
        setIsLoading(false);
        return;
      }
      inFlight = true;
      setIsLoading(true);
      setError(null);
      try {
        const client = getOrderbookUserClient(obNet, managerId);
        const { baseScalar, quoteScalar } = scalarsForPool(poolKey, obNet);
        const market = marketLabelFromPool(poolKey, obNet);

        let allOrders: NonNullable<
          Awaited<ReturnType<typeof client.orderbook.getOrders>>
        > = [];

        try {
          const details = await client.orderbook.getAccountOrderDetails(
            poolKey,
            TRADE_BALANCE_MANAGER_KEY
          );
          if (cancelled) return;
          allOrders = details ?? [];
        } catch {
          const orderIds = await client.orderbook.accountOpenOrders(
            poolKey,
            TRADE_BALANCE_MANAGER_KEY
          );
          if (cancelled) return;

          const idStrings = orderIds
            .map(toOrderIdString)
            .filter((s) => s.length > 0);

          if (idStrings.length === 0) {
            setRows([]);
            setError(null);
            return;
          }

          for (let i = 0; i < idStrings.length; i += GET_ORDERS_CHUNK) {
            const chunk = idStrings.slice(i, i + GET_ORDERS_CHUNK);
            const batch = await client.orderbook.getOrders(poolKey, chunk);
            if (cancelled) return;
            if (!batch) {
              throw new Error('Could not load order details (getOrders returned null).');
            }
            allOrders.push(...batch);
          }
        }

        if (allOrders.length === 0) {
          setRows([]);
          setError(null);
          return;
        }

        const nextRows: OpenOrderRow[] = [];
        for (const orderInfo of allOrders) {
          const oid = BigInt(orderInfo.order_id);
          const { isBid, price: rawPrice } = client.orderbook.decodeOrderId(oid);
          const normalizedPrice = (rawPrice * baseScalar) / quoteScalar / FLOAT_SCALAR;
          nextRows.push({
            id: String(orderInfo.order_id),
            market,
            side: isBid ? 'buy' : 'sell',
            price: normalizedPrice.toFixed(9),
            quantity: String((Number(orderInfo.quantity) / baseScalar).toFixed(9)),
            filled: String((Number(orderInfo.filled_quantity) / baseScalar).toFixed(9)),
          });
        }

        setRows(nextRows);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setRows([]);
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
    poolName,
    obNet,
    primaryBalanceManagerId,
    pollIntervalMs,
    refreshNonce,
  ]);

  return { rows, error, isLoading, refresh };
}
