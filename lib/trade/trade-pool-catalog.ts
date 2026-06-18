import type { SpotlightItem } from '@sehaj23/react-spotlight-search';

import {
  orderbookRuntimeNetwork,
  type OrderbookRuntimeNetwork,
} from '@/lib/orderbook/config';
import { orderbookPoolsForSdkNetwork } from '@/lib/orderbook/sdk-surface';
import type { NetworkType } from '@/lib/network-utils';

type PoolRow = { baseCoin: string; quoteCoin: string; address: string };

/**
 * SofiSwap trade UI only lists spots where **both** legs are in this set (MYSO / MYUSD / USDC).
 * Excludes DEEP, WAL, DBUSDC, DBTC, and all other SDK pools.
 */
export const SOFI_SPOT_COINS = new Set(['MYSO', 'MYUSD', 'USDC']);

/** Human-facing ticker (canonical keys stay uppercase for SDK / APIs). */
export function spotAssetSymbolDisplay(symbol: string): string {
  const s = symbol.trim();
  if (!s || s === '—') return s;
  const u = s.toUpperCase();
  if (u === 'MYSO') return 'MySo';
  if (u === 'MYUSD') return 'MyUSD';
  if (u === 'USDC') return 'USDC';
  return s;
}

function poolInSofiCatalog(row: PoolRow | undefined): boolean {
  if (!row) return false;
  return SOFI_SPOT_COINS.has(row.baseCoin) && SOFI_SPOT_COINS.has(row.quoteCoin);
}

function poolsByNetwork(network: NetworkType): Record<string, PoolRow> {
  const ob = orderbookRuntimeNetwork(network);
  return orderbookPoolsForSdkNetwork(ob) as Record<string, PoolRow>;
}

/** Raw SDK pool map for gRPC (includes localnet = testnet defaults + optional env patch). */
export function orderbookPoolsForRuntime(obNet: OrderbookRuntimeNetwork): Record<string, PoolRow> {
  return orderbookPoolsForSdkNetwork(obNet) as Record<string, PoolRow>;
}

export function poolExistsOnOrderbookNetwork(
  poolKey: string,
  obNet: OrderbookRuntimeNetwork
): boolean {
  const pools = orderbookPoolsForRuntime(obNet);
  return Boolean(pools[poolKey.trim()]);
}

function sortPoolKeys(network: NetworkType, keys: string[]): string[] {
  const map = poolsByNetwork(network);
  const score = (k: string) => {
    if (k === 'MYSO_MYUSD') return 0;
    if (k === 'MYSO_USDC') return 1;
    if (k === 'MYUSD_USDC') return 2;
    const m = map[k];
    if (!m) return 99;
    if (m.baseCoin === 'MYSO') return 10;
    return 50;
  };
  return [...keys].sort((a, b) => {
    const d = score(a) - score(b);
    if (d !== 0) return d;
    return a.localeCompare(b);
  });
}

/**
 * Pool keys shown in SofiSwap (MYSO / MYUSD / USDC only). Localnet uses the testnet map for UI.
 */
export function tradePoolKeysForNetwork(network: NetworkType): string[] {
  const map = poolsByNetwork(network);
  const keys = Object.keys(map).filter((k) => poolInSofiCatalog(map[k]));
  return sortPoolKeys(network, keys);
}

/** `base` / `quote` from on-chain pool metadata when the key exists in the SDK map. */
export function poolTickerForKey(network: NetworkType, poolKey: string): {
  base: string;
  quote: string;
} {
  const row = poolsByNetwork(network)[poolKey];
  if (row) return { base: row.baseCoin, quote: row.quoteCoin };
  const parts = poolKey.split('_').filter(Boolean);
  return { base: parts[0] ?? poolKey, quote: parts[1] ?? '—' };
}

export function pairLabelForPoolKey(network: NetworkType, poolKey: string): string {
  const { base, quote } = poolTickerForKey(network, poolKey);
  const b = spotAssetSymbolDisplay(base);
  const q = spotAssetSymbolDisplay(quote);
  return quote && quote !== '—' ? `${b} / ${q}` : b;
}

/** Pool object id from the SDK map, when this key exists on the network. */
export function poolOnChainAddressForKey(
  network: NetworkType,
  poolKey: string
): string | null {
  const row = poolsByNetwork(network)[poolKey] as PoolRow | undefined;
  const a = row?.address?.trim();
  return a && a.length > 0 ? a : null;
}

const DEFAULT_PREFERRED_KEYS = ['MYSO_MYUSD', 'MYSO_USDC', 'MYUSD_USDC'] as const;

export function getDefaultTradePoolKey(network: NetworkType): string {
  const keys = tradePoolKeysForNetwork(network);
  if (keys.length === 0) return 'MYSO_MYUSD';
  for (const p of DEFAULT_PREFERRED_KEYS) {
    if (keys.includes(p)) return p;
  }
  return keys[0]!;
}

export function buildTradePoolSpotlightItems(network: NetworkType): SpotlightItem[] {
  return tradePoolKeysForNetwork(network).map((id) => {
    const { base, quote } = poolTickerForKey(network, id);
    const dispB = spotAssetSymbolDisplay(base);
    const dispQ = spotAssetSymbolDisplay(quote);
    return {
      id,
      name: pairLabelForPoolKey(network, id),
      url: '/trade',
      tags: Array.from(new Set([base, quote, dispB, dispQ, 'pool', id.toLowerCase()])).filter(Boolean),
    };
  });
}
