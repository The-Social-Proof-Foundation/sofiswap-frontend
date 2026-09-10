/**
 * Orderbook indexer HTTP status (localnet / testnet / mainnet).
 * Hosted tiers: https://orderbook.{tier}.mysocial.network/status
 * Localnet: `{NEXT_PUBLIC_ORDERBOOK_INDEXER_LOCALNET_URL}/status` unless STATUS_URL_LOCALNET is set.
 */

import type { NetworkType } from '@/lib/network-utils';

export type OrderbookIndexerHealth = 'healthy' | 'degraded' | 'unhealthy';

export interface OrderbookStatusPipelineRow {
  pipeline: string;
  indexed_checkpoint: number;
  indexed_epoch: number;
  indexed_timestamp_ms: number;
  checkpoint_lag: number;
  time_lag_seconds: number;
  latest_onchain_checkpoint: number;
}

export interface OrderbookStatusResponse {
  status: string;
  latest_onchain_checkpoint: number;
  current_time_ms: number;
  earliest_checkpoint: number;
  max_lag_pipeline: string;
  pipelines: OrderbookStatusPipelineRow[];
  max_checkpoint_lag: number;
  max_time_lag_seconds: number;
}

function trimEnv(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function getOrderbookStatusUrl(network: NetworkType): string | null {
  if (network === 'localnet') {
    const override = trimEnv(process.env.NEXT_PUBLIC_ORDERBOOK_STATUS_URL_LOCALNET);
    if (override) return override.replace(/\/$/, '');
    const indexer =
      trimEnv(process.env.NEXT_PUBLIC_ORDERBOOK_INDEXER_LOCALNET_URL) ||
      trimEnv(process.env.NEXT_PUBLIC_ORDERBOOK_INDEXER_URL);
    if (!indexer) return null;
    return `${indexer.replace(/\/$/, '')}/status`;
  }
  const override =
    network === 'testnet'
      ? trimEnv(process.env.NEXT_PUBLIC_ORDERBOOK_STATUS_URL_TESTNET)
      : trimEnv(process.env.NEXT_PUBLIC_ORDERBOOK_STATUS_URL_MAINNET);
  if (override) return override.replace(/\/$/, '');
  return `https://orderbook.${network}.mysocial.network/status`;
}

export function orderbookIndexerHealth(
  data: OrderbookStatusResponse | null,
  fetchFailed: boolean
): OrderbookIndexerHealth {
  if (fetchFailed || !data) return 'unhealthy';
  const ok = String(data.status).toUpperCase() === 'OK';
  if (!ok) return 'unhealthy';

  const lag = data.max_checkpoint_lag ?? 0;
  const timeLag = data.max_time_lag_seconds ?? 0;

  // Healthy: typical catch-up (see public /status samples).
  if (lag <= 20 && timeLag <= 45) return 'healthy';
  // Elevated lag but still OK.
  if (lag <= 200 && timeLag <= 600) return 'degraded';
  return 'unhealthy';
}

export async function fetchOrderbookStatus(
  url: string,
  signal?: AbortSignal
): Promise<OrderbookStatusResponse> {
  const res = await fetch(url, {
    signal,
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Orderbook status ${res.status}`);
  }
  return res.json() as Promise<OrderbookStatusResponse>;
}
