import type { GraphqlProfileOverviewData } from '@/hooks/useGraphqlProfileOverviewSWR';
import { MYSO_GAS_COIN_TYPE } from '@/lib/transaction-utils';

const MYSO_DECIMALS = 9;

function normalizeCoinRepr(repr: string): string {
  return repr.trim().toLowerCase();
}

/**
 * Wallet MYSO balance (human units) from portfolio overview balances, or null if missing.
 */
export function primaryMysoBalanceFromProfileOverview(
  data: GraphqlProfileOverviewData | null | undefined
): number | null {
  const nodes = data?.address?.balances?.nodes;
  if (!nodes?.length) return null;
  const needle = normalizeCoinRepr(MYSO_GAS_COIN_TYPE);
  for (const n of nodes) {
    const repr = n.coinType?.repr ? normalizeCoinRepr(n.coinType.repr) : '';
    if (!repr) continue;
    if (repr === needle || repr.endsWith('::myso::myso')) {
      try {
        const raw = BigInt(n.totalBalance || '0');
        return Number(raw) / 10 ** MYSO_DECIMALS;
      } catch {
        return null;
      }
    }
  }
  return null;
}
