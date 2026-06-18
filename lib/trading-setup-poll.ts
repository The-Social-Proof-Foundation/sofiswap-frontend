import { orderbookTradingNetwork } from '@/lib/orderbook/config';
import { fetchRegisteredBalanceManagerIds } from '@/lib/orderbook/runtime';
import { getMySoJsonRpcClient } from '@/lib/myso-client';
import type { NetworkType } from '@/lib/network-utils';
import { writeTradingSetupCache } from '@/lib/trading-setup-cache';

/**
 * Poll until registry lists at least one Balance Manager or timeout (mainnet/testnet only).
 */
export async function pollRegisteredBalanceManagerIdsAfterTx(
  network: NetworkType,
  ownerAddress: string,
  maxWaitMs = 90_000
): Promise<{ timedOut: boolean; ids: string[]; pollError: string | null }> {
  const ob = orderbookTradingNetwork(network);
  if (!ob) {
    return { timedOut: false, ids: [], pollError: null };
  }
  const client = getMySoJsonRpcClient(network);
  const started = Date.now();
  let delayMs = 750;
  let lastError: string | null = null;

  while (Date.now() - started < maxWaitMs) {
    const res = await fetchRegisteredBalanceManagerIds(client, ownerAddress);
    lastError = res.error;
    if (res.ids.length > 0) {
      writeTradingSetupCache(network, ownerAddress, { ids: res.ids, error: null });
      return { timedOut: false, ids: res.ids, pollError: null };
    }
    if (res.error) {
      return { timedOut: false, ids: [], pollError: res.error };
    }
    await new Promise((r) => setTimeout(r, delayMs));
    delayMs = Math.min(Math.floor(delayMs * 1.45), 8_000);
  }

  return { timedOut: true, ids: [], pollError: lastError };
}
