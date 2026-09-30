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

/**
 * Epochs are ~60s on localnet. Protocol 112 signs `ValidDuring` (min/max epoch + chain + nonce).
 * The SDK default is only `currentEpoch … currentEpoch+1`, so a create+register that crosses an
 * epoch — or a retry of the same digest — is rejected as `Transaction Expired { k#… }`.
 * A wider window plus a fresh nonce keeps Enable trading and reviewed quotes executable.
 */
export const TX_EXPIRATION_EPOCHS = 10;

/** How many times a submission is rebuilt after the chain rejects it as stale. */
export const MAX_SUBMISSION_ATTEMPTS = 2;

/**
 * Rejections a rebuilt transaction can survive, because they only mean the read endpoint
 * served a version the chain has already moved past. On-chain aborts never match these.
 */
const TRANSIENT_SUBMISSION_ERROR =
  /transaction expired|not available for consumption|is not available|already (?:used|consumed)|object .*version/i;

export function isTransientSubmissionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return TRANSIENT_SUBMISSION_ERROR.test(message);
}

/**
 * Pins a `ValidDuring` window that outlives a quote review and makes each rebuild a new digest.
 * Best effort: without a readable system state the SDK default still applies rather than blocking.
 */
export async function applyTransactionExpiration(tx: Transaction, client: MySoJsonRpcClient): Promise<void> {
  try {
    const [{ epoch }, chainIdentifier] = await Promise.all([
      client.getLatestMySoSystemState(),
      client.getChainIdentifier(),
    ]);
    const current = Number(epoch);
    if (!Number.isSafeInteger(current) || current < 0) return;
    if (typeof chainIdentifier !== 'string' || !chainIdentifier.trim()) return;
    tx.setExpiration({
      ValidDuring: {
        minEpoch: String(current),
        maxEpoch: String(current + TX_EXPIRATION_EPOCHS),
        minTimestamp: null,
        maxTimestamp: null,
        chain: chainIdentifier,
        nonce: (Math.random() * 0x100000000) >>> 0,
      },
    });
  } catch (error) {
    console.warn('[SofiSwap] Could not widen the transaction expiration window.', error);
  }
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

  /** A fresh PTB per attempt, so a retry resolves current object versions instead of reusing stale ones. */
  const submit = async (): Promise<MySoTransactionBlockResponse> => {
    const tx = new Transaction();
    tx.setSender(sender);
    build(tx, { sponsored: needSponsored });

    if (!needSponsored) {
      console.log('✅ Smart gas: user-paid path', { network, sender });
      await applyTransactionExpiration(tx, client);
      return client.signAndExecuteTransaction({
        signer,
        transaction: tx,
        options: { ...executeOptions, showEffects: true },
      });
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

    await applyTransactionExpiration(tx, client);
    const transactionBytes = await tx.build({ client });
    const { signature, bytes: txBytesB64 } =
      await signer.signTransaction(transactionBytes);

    const sponsored = await executeSponsoredTransaction(
      reservation_id,
      txBytesB64,
      signature,
      network
    );

    return normalizeSponsoredExecuteToBlockResponse(sponsored);
  };

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_SUBMISSION_ATTEMPTS; attempt += 1) {
    try {
      const response = await submit();
      assertTransactionSucceeded(response);
      return response;
    } catch (error) {
      lastError = error;
      // A transaction the chain rejected as stale never moved funds, so rebuilding it
      // with re-read versions is safe. On-chain aborts are final and never retried.
      if (attempt >= MAX_SUBMISSION_ATTEMPTS || !isTransientSubmissionError(error)) throw error;
      console.warn(
        '[SofiSwap] Transaction rejected as stale by the network; rebuilding with fresh object versions.',
        error instanceof Error ? error.message : error
      );
    }
  }
  throw lastError;
}

/** A submitted transaction can still abort; never clear a form or show success without effects. */
function assertTransactionSucceeded(response: MySoTransactionBlockResponse): void {
  const status = response.effects?.status;
  if (!status) throw new Error(`Execution status unavailable${response.digest ? ` for ${response.digest}` : ''}. Check transaction history before retrying.`);
  if (status.status !== 'success') throw new Error(status.error || 'The transaction failed on chain.');
}
