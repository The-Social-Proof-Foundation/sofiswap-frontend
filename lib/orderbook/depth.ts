/**
 * How the trade UI loads L2 depth: SDK (gRPC) by default, optional HTTP indexer.
 */

import { orderbookIndexerNotConfiguredMessage } from '@/lib/orderbook-indexer/ohlcv';
import type { NetworkType } from '@/lib/network-utils';

export type OrderbookDepthSource = 'sdk' | 'indexer';

export function getOrderbookDepthSource(): OrderbookDepthSource {
  const raw = process.env.NEXT_PUBLIC_ORDERBOOK_DEPTH_SOURCE?.trim().toLowerCase();
  return raw === 'indexer' ? 'indexer' : 'sdk';
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
