/** How the trade UI loads L2 depth. Auto prefers the REST indexer and falls back to gRPC. */

import { orderbookIndexerNotConfiguredMessage } from '@/lib/orderbook-indexer/ohlcv';
import type { NetworkType } from '@/lib/network-utils';

export type OrderbookDepthSource = 'auto' | 'sdk' | 'indexer';

export function getOrderbookDepthSource(): OrderbookDepthSource {
  const raw = process.env.NEXT_PUBLIC_ORDERBOOK_DEPTH_SOURCE?.trim().toLowerCase();
  if (raw === 'sdk' || raw === 'indexer') return raw;
  return 'auto';
}

export function formatIndexerDepthError(message: string, network: NetworkType): string {
  const localnetMiss =
    network === 'localnet' && /\b500\b/.test(message) && /Record not found/i.test(message);
  if (localnetMiss) {
    return (
      `${message} For local dev, use SDK depth (unset NEXT_PUBLIC_ORDERBOOK_DEPTH_SOURCE or set sdk) or backfill the indexer.`
    );
  }
  return message;
}

export { orderbookIndexerNotConfiguredMessage };
