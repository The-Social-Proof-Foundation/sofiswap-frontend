/**
 * Orderbook / BalanceManager helpers using resolved package IDs (env or SDK defaults).
 */

import { bcs } from '@socialproof/myso/bcs';
import type { MySoJsonRpcClient } from '@socialproof/myso/jsonRpc';
import { Transaction } from '@socialproof/myso/transactions';
import { normalizeMySoAddress } from '@socialproof/myso/utils';
import { orderbookCoinsForSdkNetwork } from '@/lib/orderbook/sdk-surface';

import {
  augmentOrderbookRegistryInspectError,
  getResolvedOrderbookDeployment,
  isBalanceManagerLookupMissingAbort,
  ORDERBOOK_DEPLOYMENT_ENV_HINT,
  type OrderbookRuntimeNetwork,
} from '@/lib/orderbook/config';
import { isUsableOnchainObjectId } from '@/lib/platform-config';

export interface BalanceManagerIdsResult {
  ids: string[];
  /** Present when RPC/serialization failed — do not treat as "no managers". */
  error: string | null;
}

export async function fetchRegisteredBalanceManagerIds(
  jsonRpcClient: MySoJsonRpcClient,
  ownerAddress: string
): Promise<BalanceManagerIdsResult> {
  const net = jsonRpcClient.network;
  if (net !== 'mainnet' && net !== 'testnet' && net !== 'localnet') {
    return { ids: [], error: 'Unsupported orderbook network.' };
  }
  const obNet = net as OrderbookRuntimeNetwork;
  try {
    const { orderbookPackageId, registryId } = getResolvedOrderbookDeployment(obNet);
    if (!isUsableOnchainObjectId(registryId) || !isUsableOnchainObjectId(orderbookPackageId)) {
      return {
        ids: [],
        error: `Orderbook registry/package is missing or 0x0. ${ORDERBOOK_DEPLOYMENT_ENV_HINT}`,
      };
    }
    const sender = normalizeMySoAddress(ownerAddress);
    const tx = new Transaction();
    tx.setSender(sender);
    tx.moveCall({
      target: `${orderbookPackageId}::registry::get_balance_manager_ids`,
      arguments: [tx.object(registryId), tx.pure.address(sender)],
    });
    // Use dev-inspect instead of `core.simulateTransaction`: the latter builds from
    // `TransactionDataBuilder` after only `prepareForSerialization`, skipping
    // `Transaction#build`'s `resolveTransactionPlugin` — which can leave inputs in a
    // non-BCS-serializable shape and throw
    // "Expected object with one key, but found 0 for type CallArg".
    const inspect = await jsonRpcClient.devInspectTransactionBlock({
      sender,
      transactionBlock: tx,
    });
    if (inspect.error) {
      throw new Error(inspect.error);
    }
    const rawTuple = inspect.results?.[0]?.returnValues?.[0];
    if (!rawTuple) {
      throw new Error('devInspectTransactionBlock: missing return value for get_balance_manager_ids');
    }
    const raw = new Uint8Array(rawTuple[0]);
    const ids = bcs
      .vector(bcs.Address)
      .parse(raw)
      .map((id) => normalizeMySoAddress(id));
    return { ids, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isBalanceManagerLookupMissingAbort(msg)) {
      return { ids: [], error: null };
    }
    return { ids: [], error: augmentOrderbookRegistryInspectError(msg) };
  }
}

/** First id when multiple — stable enough for primary `balanceManagers` config key. */
export function pickPrimaryBalanceManagerId(ids: string[]): string | null {
  return ids.length > 0 ? ids[0]! : null;
}

/**
 * Reads a single coin balance inside a BalanceManager via dev-inspect. Works for any
 * coin key in the SDK coin map (MYSO, MYUSD, USDC, etc.). Returns the human-adjusted
 * balance (raw u64 divided by the coin scalar), or null when the coin is unknown.
 *
 * `simulationSender` is any valid address used as the inspect sender — the
 * `balance_manager::balance` view function does not authenticate the caller.
 */
export async function fetchBalanceManagerCoinBalance(input: {
  jsonRpcClient: MySoJsonRpcClient;
  simulationSender: string;
  balanceManagerObjectId: string;
  coinKey: string;
  network: OrderbookRuntimeNetwork;
}): Promise<{ ok: true; balance: number } | { ok: false; error: string }> {
  const { jsonRpcClient, simulationSender, balanceManagerObjectId, coinKey, network } = input;
  const coinMap = orderbookCoinsForSdkNetwork(network);
  const coin = coinMap[coinKey as keyof typeof coinMap];
  if (!coin) {
    return { ok: false, error: `Unknown coin key "${coinKey}" on ${network}.` };
  }

  try {
    const { orderbookPackageId } = getResolvedOrderbookDeployment(network);
    const sender = normalizeMySoAddress(simulationSender);
    const tx = new Transaction();
    tx.setSender(sender);
    tx.moveCall({
      target: `${orderbookPackageId}::balance_manager::balance`,
      arguments: [tx.object(balanceManagerObjectId)],
      typeArguments: [coin.type],
    });
    const inspect = await jsonRpcClient.devInspectTransactionBlock({
      sender,
      transactionBlock: tx,
    });
    if (inspect.error) {
      throw new Error(inspect.error);
    }
    const rawTuple = inspect.results?.[0]?.returnValues?.[0];
    if (!rawTuple) {
      throw new Error('devInspectTransactionBlock: missing balance return value');
    }
    const raw = new Uint8Array(rawTuple[0]);
    const parsedBalance = bcs.U64.parse(raw);
    const adjusted = Number(parsedBalance) / coin.scalar;
    return { ok: true, balance: Number(adjusted.toFixed(9)) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Coin keys to sample for dev console logging (both networks define these in the SDK). */
export const BALANCE_MANAGER_SAMPLE_COIN_KEYS = ['MYSO', 'MYUSD'] as const;

export type BalanceManagerSampleCoinKey = (typeof BALANCE_MANAGER_SAMPLE_COIN_KEYS)[number];

export type BalanceManagerSampleCoinEntry =
  | { ok: true; coinType: string; humanBalance: number }
  | { ok: false; error: string };

export interface BalanceManagerSampleBalancesResult {
  network: OrderbookRuntimeNetwork;
  orderbookPackageId: string;
  balanceManagerAddress: string;
  byCoin: Partial<Record<BalanceManagerSampleCoinKey, BalanceManagerSampleCoinEntry>>;
}

const balanceSampleInflight = new Map<string, Promise<BalanceManagerSampleBalancesResult>>();

function balanceSampleCacheKey(
  rpcNetwork: string,
  sender: string,
  balanceManagerObjectId: string
): string {
  return `${rpcNetwork}:${sender}:${balanceManagerObjectId}`;
}

/**
 * Reads MYSO / MYUSD vault balances on the BalanceManager via dev-inspect (same path as console logging).
 * Concurrent calls share one in-flight promise per (RPC network, sender, manager id).
 */
export function fetchBalanceManagerSampleBalances(input: {
  jsonRpcClient: MySoJsonRpcClient;
  simulationSender: string;
  balanceManagerObjectId: string;
  network: OrderbookRuntimeNetwork;
}): Promise<BalanceManagerSampleBalancesResult> {
  const sender = normalizeMySoAddress(input.simulationSender);
  const key = balanceSampleCacheKey(
    input.jsonRpcClient.network,
    sender,
    input.balanceManagerObjectId
  );
  const existing = balanceSampleInflight.get(key);
  if (existing) return existing;

  const promise = fetchBalanceManagerSampleBalancesImpl({ ...input, simulationSender: sender }).finally(
    () => {
      balanceSampleInflight.delete(key);
    }
  );
  balanceSampleInflight.set(key, promise);
  return promise;
}

async function fetchBalanceManagerSampleBalancesImpl(input: {
  jsonRpcClient: MySoJsonRpcClient;
  simulationSender: string;
  balanceManagerObjectId: string;
  network: OrderbookRuntimeNetwork;
}): Promise<BalanceManagerSampleBalancesResult> {
  const { jsonRpcClient, simulationSender, balanceManagerObjectId, network } = input;
  const { orderbookPackageId } = getResolvedOrderbookDeployment(network);
  const coinMap = orderbookCoinsForSdkNetwork(network);
  const byCoin: Partial<Record<BalanceManagerSampleCoinKey, BalanceManagerSampleCoinEntry>> = {};

  for (const coinKey of BALANCE_MANAGER_SAMPLE_COIN_KEYS) {
    if (!Object.hasOwn(coinMap, coinKey)) continue;
    const coin = coinMap[coinKey as keyof typeof coinMap];
    try {
      const tx = new Transaction();
      tx.setSender(simulationSender);
      tx.moveCall({
        target: `${orderbookPackageId}::balance_manager::balance`,
        arguments: [tx.object(balanceManagerObjectId)],
        typeArguments: [coin.type],
      });
      const inspect = await jsonRpcClient.devInspectTransactionBlock({
        sender: simulationSender,
        transactionBlock: tx,
      });
      if (inspect.error) {
        throw new Error(inspect.error);
      }
      const rawTuple = inspect.results?.[0]?.returnValues?.[0];
      if (!rawTuple) {
        throw new Error('devInspectTransactionBlock: missing balance return value');
      }
      const raw = new Uint8Array(rawTuple[0]);
      const parsedBalance = bcs.U64.parse(raw);
      const adjusted = Number(parsedBalance) / coin.scalar;
      byCoin[coinKey] = {
        ok: true,
        coinType: coin.type,
        humanBalance: Number(adjusted.toFixed(9)),
      };
    } catch (e) {
      byCoin[coinKey] = {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  return {
    network,
    orderbookPackageId,
    balanceManagerAddress: balanceManagerObjectId,
    byCoin,
  };
}

/** Console payload compatible with historical `[SofiSwap] BalanceManager` object shape. */
function sampleBalancesToLegacyLogBalances(
  result: BalanceManagerSampleBalancesResult
): Record<string, { coinType: string; balance: number } | { error: string }> {
  const balances: Record<string, { coinType: string; balance: number } | { error: string }> = {};
  for (const key of BALANCE_MANAGER_SAMPLE_COIN_KEYS) {
    const entry = result.byCoin[key];
    if (!entry) continue;
    if (entry.ok) {
      balances[key] = { coinType: entry.coinType, balance: entry.humanBalance };
    } else {
      balances[key] = { error: entry.error };
    }
  }
  return balances;
}

function formatSampleBalanceForSummary(entry: BalanceManagerSampleCoinEntry | undefined): string {
  if (!entry) return '—';
  if (entry.ok) return String(entry.humanBalance);
  return 'error';
}

const balanceSampleLogCooldownMs = 1500;
const balanceSampleLogLastAt = new Map<string, number>();

function logDedupeKeyForSample(result: BalanceManagerSampleBalancesResult): string {
  return `${result.network}:${result.balanceManagerAddress}`;
}

export function logBalanceManagerSampleBalancesToConsole(result: BalanceManagerSampleBalancesResult): void {
  const key = logDedupeKeyForSample(result);
  const now = Date.now();
  const prev = balanceSampleLogLastAt.get(key);
  if (prev !== undefined && now - prev < balanceSampleLogCooldownMs) {
    return;
  }
  balanceSampleLogLastAt.set(key, now);

  const balances = sampleBalancesToLegacyLogBalances(result);
  console.info('[SofiSwap] BalanceManager', {
    network: result.network,
    orderbookPackageId: result.orderbookPackageId,
    balanceManagerAddress: result.balanceManagerAddress,
    balances,
  });
  console.info('[SofiSwap] BalanceManager spot balances', {
    balanceManagerAddress: result.balanceManagerAddress,
    MYSO: formatSampleBalanceForSummary(result.byCoin.MYSO),
    MYUSD: formatSampleBalanceForSummary(result.byCoin.MYUSD),
  });
}

/**
 * Dev-friendly log of the primary balance manager object id and sampled on-chain balances.
 * Per-coin reads may fail (e.g. abort) — failures are still recorded in the logged object.
 */
export async function logBalanceManagerSnapshotToConsole(input: {
  jsonRpcClient: MySoJsonRpcClient;
  /** Sender for dev-inspect / PTB simulation (MySo RPC). */
  simulationSender: string;
  balanceManagerObjectId: string;
  network: OrderbookRuntimeNetwork;
}): Promise<void> {
  const result = await fetchBalanceManagerSampleBalances(input);
  logBalanceManagerSampleBalancesToConsole(result);
}

/**
 * Tx 1: `balance_manager::new_with_custom_owner` → mint Trade/Deposit/Withdraw caps (while owned) →
 * `public_share_object` → transfer caps to `ownerAddress` (parallels SDK `createBalanceManagerWithOwner` +
 * share + capability setup).
 *
 * `register_balance_manager` must be a separate transaction using `tx.object(createdId)` — the shared
 * manager id comes from tx 1 effects; it cannot be combined with register in the same PTB as today.
 *
 * `ownerAddress` must match `tx` sender: `register_balance_manager` and cap mints require
 * `ctx.sender() == balance_manager.owner()`.
 */
export function appendCreateAndShareBalanceManagerMoves(
  tx: Transaction,
  network: OrderbookRuntimeNetwork,
  ownerAddress: string
): void {
  const { orderbookPackageId } = getResolvedOrderbookDeployment(network);
  const bmType = `${orderbookPackageId}::balance_manager::BalanceManager`;
  const owner = normalizeMySoAddress(ownerAddress);

  const manager = tx.moveCall({
    target: `${orderbookPackageId}::balance_manager::new_with_custom_owner`,
    arguments: [tx.pure.address(owner)],
  });

  const tradeCap = tx.moveCall({
    target: `${orderbookPackageId}::balance_manager::mint_trade_cap`,
    arguments: [manager],
  });
  const depositCap = tx.moveCall({
    target: `${orderbookPackageId}::balance_manager::mint_deposit_cap`,
    arguments: [manager],
  });
  const withdrawCap = tx.moveCall({
    target: `${orderbookPackageId}::balance_manager::mint_withdraw_cap`,
    arguments: [manager],
  });

  tx.moveCall({
    target: '0x2::transfer::public_share_object',
    arguments: [manager],
    typeArguments: [bmType],
  });

  tx.transferObjects([tradeCap, depositCap, withdrawCap], owner);
}

/** Tx 2: register an already-shared BalanceManager on the registry (use object id from tx 1 effects). */
export function appendRegisterBalanceManagerMove(
  tx: Transaction,
  network: OrderbookRuntimeNetwork,
  balanceManagerObjectId: string
): void {
  const { orderbookPackageId, registryId } = getResolvedOrderbookDeployment(network);
  tx.moveCall({
    target: `${orderbookPackageId}::balance_manager::register_balance_manager`,
    arguments: [tx.object(balanceManagerObjectId), tx.object(registryId)],
  });
}
