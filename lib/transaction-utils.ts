import type { MySoJsonRpcClient } from '@socialproof/myso/jsonRpc';
import type { MySoTransactionBlockResponse } from '@socialproof/myso/jsonRpc';
import type { Ed25519Keypair } from '@socialproof/myso/keypairs/ed25519';
import { Transaction } from '@socialproof/myso/transactions';

import { executeSponsoredTransaction, reserveGas } from '@/lib/gas-pool';
import type { ExecuteTransactionResponse } from '@/lib/gas-pool';
import type { NetworkType } from '@/lib/network-utils';
import { isSponsoredGasAllowed } from '@/lib/network-utils';

/** Native MySo gas token (same as mysocial-frontend smart-gas check). */
export const MYSO_GAS_COIN_TYPE = '0x2::myso::MYSO';

/** Minimum balance (base units) treated as "has any gas money" — 0.001 MySo. */
export const DEFAULT_MINIMAL_GAS_BUDGET = BigInt(1_000_000);

/**
 * User-facing copy when the wallet cannot pay gas and sponsorship is not allowed (e.g. localnet).
 * Reuse in UI toasts for consistent messaging.
 */
export const INSUFFICIENT_MYSO_FOR_GAS_MESSAGE =
  'Insufficient MySo for gas. Add MySo to this wallet or switch off localnet to use sponsored gas.';

export async function checkUserCanAffordGas(
  client: MySoJsonRpcClient,
  sender: string,
  minimalBudget: bigint = DEFAULT_MINIMAL_GAS_BUDGET
): Promise<boolean> {
  const balance = await client.getBalance({
    owner: sender,
    coinType: MYSO_GAS_COIN_TYPE,
  });
  const total = BigInt(balance.totalBalance);
  return total >= minimalBudget;
}

/**
 * `coinObjectCount` from balance; use with PTBs that split `tx.gas` — user-paid gas may be impossible with ≤1 coin.
 */
export async function getMySoGasCoinObjectCount(
  client: MySoJsonRpcClient,
  owner: string
): Promise<number> {
  const balance = await client.getBalance({
    owner,
    coinType: MYSO_GAS_COIN_TYPE,
  });
  return balance.coinObjectCount;
}

function shouldForceSponsoredForGasCoinSplit(params: {
  treatAsGasCoinSplit: boolean;
  coinObjectCount: number;
}): boolean {
  if (!params.treatAsGasCoinSplit) return false;
  return params.coinObjectCount <= 1;
}

type ExecutePayload = ExecuteTransactionResponse & {
  /** Some gas-pool deployments return MySox-style effects at the top level. */
  effects?: {
    transactionDigest?: string;
    status?: unknown;
  };
};

/** Map gas pool execute JSON into RPC-style block response for shared asserts / wait helpers. */
export function normalizeSponsoredExecuteToBlockResponse(
  data: ExecuteTransactionResponse
): MySoTransactionBlockResponse {
  const d = data as ExecutePayload;
  const result = d.result;
  const topEffects = d.effects;
  const nestedEffects = result?.effects as
    | (typeof topEffects & { transactionDigest?: string })
    | undefined;

  const effectsRaw =
    nestedEffects ??
    (topEffects as typeof nestedEffects);

  const digest =
    (typeof result?.digest === 'string' ? result.digest : undefined) ??
    (typeof topEffects?.transactionDigest === 'string'
      ? topEffects.transactionDigest
      : undefined) ??
    (typeof nestedEffects?.transactionDigest === 'string'
      ? nestedEffects.transactionDigest
      : undefined);

  if (!digest) {
    throw new Error('Sponsored transaction: missing digest in gas pool response.');
  }
  if (!effectsRaw) {
    throw new Error('Sponsored transaction: missing effects in gas pool response.');
  }

  return {
    digest,
    effects: effectsRaw as MySoTransactionBlockResponse['effects'],
    events: result?.events ?? undefined,
  };
}

export interface ExecuteTransactionWithSmartGasParams {
  network: NetworkType;
  client: MySoJsonRpcClient;
  signer: Ed25519Keypair;
  sender: string;
  /** Mutates a fresh `Transaction` with `setSender` already applied. */
  build: (tx: Transaction, context: { sponsored: boolean }) => void;
  executeOptions?: NonNullable<
    Parameters<MySoJsonRpcClient['signAndExecuteTransaction']>[0]
  >['options'];
  /**
   * When true, if the PTB splits or spends the gas coin (e.g. `splitCoins(tx.gas, …)`),
   * sponsorship is used when allowed and `coinObjectCount <= 1`.
   */
  treatAsGasCoinSplit?: boolean;
  /** Force sponsorship when user-owned payment objects would otherwise also be needed for gas. */
  forceSponsored?: boolean;
  minimalGasBudget?: bigint;
}

export async function executeTransactionWithSmartGas(
  params: ExecuteTransactionWithSmartGasParams
): Promise<MySoTransactionBlockResponse> {
  const {
    network,
    client,
    signer,
    sender,
    build,
    executeOptions,
    treatAsGasCoinSplit = false,
    forceSponsored = false,
    minimalGasBudget = DEFAULT_MINIMAL_GAS_BUDGET,
  } = params;

  if (signer.toMySoAddress().toLowerCase() !== sender.toLowerCase()) {
    throw new Error('The signing wallet does not match the connected account.');
  }

  const balance = await client.getBalance({
    owner: sender,
    coinType: MYSO_GAS_COIN_TYPE,
  });
  const total = BigInt(balance.totalBalance);
  const canAfford = total >= minimalGasBudget;
  const coinObjectCount = balance.coinObjectCount;

  const sponsoredAllowed = isSponsoredGasAllowed(network);
  const forceSponsoredForGasCoin = shouldForceSponsoredForGasCoinSplit({
    treatAsGasCoinSplit,
    coinObjectCount,
  });

  if (!sponsoredAllowed) {
    if (!canAfford) {
      console.error('❌ Smart gas: insufficient MySo on localnet for', sender);
      throw new Error(INSUFFICIENT_MYSO_FOR_GAS_MESSAGE);
    }
  }

  const needSponsored =
    sponsoredAllowed && (forceSponsored || forceSponsoredForGasCoin || !canAfford);

  const tx = new Transaction();
  tx.setSender(sender);
  build(tx, { sponsored: needSponsored });

  if (!needSponsored) {
    console.log('✅ Smart gas: user-paid path', { network, sender });
    const response = await client.signAndExecuteTransaction({
      signer,
      transaction: tx,
      options: { ...executeOptions, showEffects: true },
    });
    assertTransactionSucceeded(response);
    return response;
  }

  console.log('🛢️ Smart gas: sponsored path', {
    network,
    sender,
    forceSponsored: forceSponsored || forceSponsoredForGasCoin,
    canAfford,
    coinObjectCount,
  });

  const reservation = await reserveGas(undefined, undefined, network);
  const { sponsor_address, reservation_id, gas_coins } = reservation.result;

  tx.setGasOwner(sponsor_address);
  tx.setGasPayment(
    gas_coins.map((c) => ({
      objectId: c.objectId,
      version: c.version,
      digest: c.digest,
    }))
  );

  const transactionBytes = await tx.build({ client });
  const { signature, bytes: txBytesB64 } =
    await signer.signTransaction(transactionBytes);

  const sponsored = await executeSponsoredTransaction(
    reservation_id,
    txBytesB64,
    signature,
    network
  );

  const response = normalizeSponsoredExecuteToBlockResponse(sponsored);
  assertTransactionSucceeded(response);
  return response;
}

/** A submitted transaction can still abort; never clear a form or show success without effects. */
function assertTransactionSucceeded(response: MySoTransactionBlockResponse): void {
  const status = response.effects?.status;
  if (!status) throw new Error(`Execution status unavailable${response.digest ? ` for ${response.digest}` : ''}. Check transaction history before retrying.`);
  if (status.status !== 'success') throw new Error(status.error || 'The transaction failed on chain.');
}
