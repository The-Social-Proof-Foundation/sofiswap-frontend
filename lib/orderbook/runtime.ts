/**
 * Orderbook / BalanceManager helpers using resolved package IDs (env or SDK defaults).
 */

import { bcs } from '@socialproof/myso/bcs';
import type { MySoJsonRpcClient } from '@socialproof/myso/jsonRpc';
import { Transaction } from '@socialproof/myso/transactions';
import { normalizeMySoAddress } from '@socialproof/myso/utils';
import { mainnetCoins, testnetCoins } from '@socialproof/orderbook';

import {
  getResolvedOrderbookDeployment,
  type OrderbookRuntimeNetwork,
} from '@/lib/orderbook-config';

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
  if (net !== 'mainnet' && net !== 'testnet') {
    return { ids: [], error: null };
  }
  const obNet = net as OrderbookRuntimeNetwork;
  try {
    const { orderbookPackageId, registryId } = getResolvedOrderbookDeployment(obNet);
    const sender = normalizeMySoAddress(ownerAddress);
    const tx = new Transaction();
    tx.setSender(sender);
    tx.moveCall({
      target: `${orderbookPackageId}::registry::get_balance_manager_ids`,
      arguments: [tx.object(registryId), tx.pure.address(sender)],
    });
    const res = await jsonRpcClient.core.simulateTransaction({
      transaction: tx,
      include: { commandResults: true, effects: true },
    });
    const raw = res.commandResults?.[0]?.returnValues?.[0]?.bcs;
    if (!raw) {
      throw new Error('simulateTransaction: missing return value for get_balance_manager_ids');
    }
    const ids = bcs
      .vector(bcs.Address)
      .parse(raw)
      .map((id) => normalizeMySoAddress(id));
    return { ids, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ids: [], error: msg };
  }
}

/** First id when multiple — stable enough for primary `balanceManagers` config key. */
export function pickPrimaryBalanceManagerId(ids: string[]): string | null {
  return ids.length > 0 ? ids[0]! : null;
}

/** Coin keys to sample for dev console logging (both networks define these in the SDK). */
const BALANCE_LOG_COIN_KEYS = ['MYSO', 'DEEP'] as const;

/**
 * Dev-friendly log of the primary balance manager object id and sampled on-chain balances.
 * Per-coin reads may fail (e.g. abort) — failures are still recorded in the logged object.
 */
export async function logBalanceManagerSnapshotToConsole(input: {
  jsonRpcClient: MySoJsonRpcClient;
  /** Required for `simulateTransaction` (MySo RPC expects a transaction sender). */
  simulationSender: string;
  balanceManagerObjectId: string;
  network: OrderbookRuntimeNetwork;
}): Promise<void> {
  const { jsonRpcClient, simulationSender, balanceManagerObjectId, network } = input;
  const sender = normalizeMySoAddress(simulationSender);
  const { orderbookPackageId } = getResolvedOrderbookDeployment(network);
  const coinMap = network === 'mainnet' ? mainnetCoins : testnetCoins;
  const balances: Record<string, { coinType: string; balance: number } | { error: string }> = {};

  for (const coinKey of BALANCE_LOG_COIN_KEYS) {
    if (!Object.hasOwn(coinMap, coinKey)) continue;
    const coin = coinMap[coinKey as keyof typeof coinMap];
    try {
      const tx = new Transaction();
      tx.setSender(sender);
      tx.moveCall({
        target: `${orderbookPackageId}::balance_manager::balance`,
        arguments: [tx.object(balanceManagerObjectId)],
        typeArguments: [coin.type],
      });
      const res = await jsonRpcClient.core.simulateTransaction({
        transaction: tx,
        include: { commandResults: true, effects: true },
      });
      const raw = res.commandResults?.[0]?.returnValues?.[0]?.bcs;
      if (!raw) {
        throw new Error('simulateTransaction: missing balance return value');
      }
      const parsedBalance = bcs.U64.parse(raw);
      const adjusted = Number(parsedBalance) / coin.scalar;
      balances[coinKey] = {
        coinType: coin.type,
        balance: Number(adjusted.toFixed(9)),
      };
    } catch (e) {
      balances[coinKey] = { error: e instanceof Error ? e.message : String(e) };
    }
  }

  console.info('[SofiSwap] BalanceManager', {
    network,
    orderbookPackageId,
    balanceManagerAddress: balanceManagerObjectId,
    balances,
  });
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
