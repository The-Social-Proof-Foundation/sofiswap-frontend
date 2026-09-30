import { getMySoGraphQLClient } from '@/lib/myso-graphql-client';
import type { NetworkType } from '@/lib/network-utils';
import { MYSO_GAS_COIN_TYPE } from '@/lib/transaction-utils';

/**
 * Native tokens in the connected wallet.
 *
 * SPT swaps are paid in MYSO, so the wallet's own coin balances are the other half of
 * "what can I trade with". They come from `address.balances` plus `coinMetadata`, which
 * the indexer serves even when its SPT tables lag.
 */

export const WALLET_TOKEN_BALANCES_QUERY = /* GraphQL */ `
  query SofiSwapWalletTokenBalances($owner: MySoAddress!, $first: Int!) {
    address(address: $owner) {
      balances(first: $first) {
        nodes {
          coinType { repr }
          totalBalance
        }
      }
    }
  }
`;

export const WALLET_COIN_METADATA_QUERY = /* GraphQL */ `
  query SofiSwapWalletCoinMetadata($type: String!) {
    coinMetadata(coinType: $type) {
      symbol
      decimals
      name
    }
  }
`;

export interface WalletTokenBalance {
  /** Full coin type, e.g. `0x2::myso::MYSO`. */
  coinType: string;
  symbol: string;
  name: string | null;
  decimals: number;
  amountBaseUnits: bigint;
  amountDisplay: string;
  /** True for the coin that pays for SPT swaps. */
  isMyso: boolean;
}

/** Order matches the trading pair catalog: MySo, then MyUSD, then the rest. */
const SYMBOL_ORDER = ['MYSO', 'MYUSD', 'USDC'];

/** `0x000…002::myso::MYSO` and `0x2::myso::MYSO` are the same coin. */
function canonicalCoinType(coinType: string): string {
  return coinType
    .trim()
    .replace(/^0x0+/, '0x')
    .toLowerCase();
}

function coinTypeSymbolGuess(coinType: string): string {
  const segments = coinType.split('::');
  return (segments[segments.length - 1] || 'TOKEN').trim().toUpperCase();
}

function pow10(exponent: number): bigint {
  let scale = BigInt(1);
  for (let i = 0; i < Math.max(0, exponent); i += 1) scale *= BigInt(10);
  return scale;
}

/** Generic base-unit formatter that does not assume the 9-decimal SPT scale. */
export function formatBaseUnits(value: bigint, decimals: number, maxFractionDigits = 4): string {
  const negative = value < BigInt(0);
  const absolute = negative ? -value : value;
  const scale = pow10(decimals);
  const whole = absolute / scale;
  const fraction = absolute % scale;
  const sign = negative ? '-' : '';
  if (decimals <= 0 || fraction === BigInt(0) || maxFractionDigits <= 0) return `${sign}${whole}`;
  const digits = fraction
    .toString()
    .padStart(decimals, '0')
    .slice(0, Math.min(decimals, maxFractionDigits))
    .replace(/0+$/, '');
  return digits ? `${sign}${whole}.${digits}` : `${sign}${whole}`;
}

function balanceSortScore(row: WalletTokenBalance): number {
  const index = SYMBOL_ORDER.indexOf(row.symbol.toUpperCase());
  if (index >= 0) return index;
  if (row.isMyso) return 0;
  return SYMBOL_ORDER.length;
}

/** Coins with a positive balance, MySo and MyUSD first, then largest balances. */
export async function fetchWalletTokenBalances(input: {
  network: NetworkType;
  owner: string;
  /** Caps metadata lookups; wallets rarely hold more tradable coins. */
  limit?: number;
}): Promise<WalletTokenBalance[]> {
  const owner = input.owner.trim();
  if (!owner) return [];
  const limit = Math.max(1, Math.min(input.limit ?? 20, 50));
  const client = getMySoGraphQLClient(input.network);
  const response = await client.query<{
    address: { balances: { nodes: Array<{ coinType: { repr: string } | null; totalBalance: string }> } } | null;
  }>({ query: WALLET_TOKEN_BALANCES_QUERY, variables: { owner, first: limit } });
  if (response.errors?.length && !response.data) {
    throw new Error(response.errors.map((error) => error.message).join('; '));
  }

  const raw = (response.data?.address?.balances.nodes ?? [])
    .map((node) => {
      const coinType = node.coinType?.repr?.trim() ?? '';
      const amount = /^\d+$/.test(node.totalBalance?.trim() ?? '') ? BigInt(node.totalBalance.trim()) : BigInt(0);
      return { coinType, amount };
    })
    .filter((row) => row.coinType && row.amount > BigInt(0));

  const seen = new Set<string>();
  const unique = raw.filter((row) => {
    const key = canonicalCoinType(row.coinType);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (unique.length === 0) return [];

  const metadata = await Promise.all(unique.map(async (row) => {
    try {
      const result = await client.query<{ coinMetadata: { symbol: string | null; decimals: number | null; name: string | null } | null }>({
        query: WALLET_COIN_METADATA_QUERY,
        variables: { type: row.coinType },
      });
      return result.data?.coinMetadata ?? null;
    } catch {
      return null;
    }
  }));

  const rows: WalletTokenBalance[] = unique.map((row, index) => {
    const meta = metadata[index];
    const decimals = typeof meta?.decimals === 'number' && meta.decimals >= 0 && meta.decimals <= 18 ? meta.decimals : 9;
    const symbol = meta?.symbol?.trim() || coinTypeSymbolGuess(row.coinType);
    return {
      coinType: row.coinType,
      symbol,
      name: meta?.name?.trim() || null,
      decimals,
      amountBaseUnits: row.amount,
      amountDisplay: formatBaseUnits(row.amount, decimals),
      isMyso: canonicalCoinType(row.coinType) === canonicalCoinType(MYSO_GAS_COIN_TYPE),
    };
  });

  return rows.sort((a, b) => {
    const order = balanceSortScore(a) - balanceSortScore(b);
    if (order !== 0) return order;
    if (a.amountBaseUnits !== b.amountBaseUnits) return a.amountBaseUnits > b.amountBaseUnits ? -1 : 1;
    return a.symbol.localeCompare(b.symbol);
  });
}
