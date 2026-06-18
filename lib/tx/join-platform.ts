import type {
  DryRunTransactionBlockResponse,
  MySoJsonRpcClient,
  MySoTransactionBlockResponse,
} from '@socialproof/myso/jsonRpc';
import type { Ed25519Keypair } from '@socialproof/myso/keypairs/ed25519';
import { Transaction } from '@socialproof/myso/transactions';

import { augmentRegisterBalanceManagerError } from '@/lib/orderbook/balance-manager-register-errors';
import { resolveCreatedBalanceManagerObjectId } from '@/lib/orderbook/balance-manager-effects';
import {
  getResolvedOrderbookDeployment,
  orderbookTradingNetwork,
  tradingSetupBundledWithJoin,
} from '@/lib/orderbook/config';
import {
  appendCreateAndShareBalanceManagerMoves,
  appendRegisterBalanceManagerMove,
  fetchRegisteredBalanceManagerIds,
} from '@/lib/orderbook/runtime';
import { getMySoJsonRpcClient } from '@/lib/myso-client';
import type { NetworkType } from '@/lib/network-utils';
import {
  getJoinPlatformMoveTarget,
  type SofiSwapPlatformConfig,
} from '@/lib/platform-config';
import {
  clearPendingBalanceManagerRegister,
  writePendingBalanceManagerRegister,
} from '@/lib/trading-setup-pending-storage';
import { executeTransactionWithSmartGas } from '@/lib/transaction-utils';

/**
 * `platform::join_platform` abort when the sender is already in the platform membership set.
 * Keep in sync with the published Move package (see module `platform`).
 */
const JOIN_PLATFORM_ABORT_ALREADY_MEMBER = 3;

type JoinPlatformEffects = NonNullable<DryRunTransactionBlockResponse['effects']> & {
  abortError?: { function?: string; error_code?: number };
};

function dryRunIndicatesJoinAlreadyComplete(dry: DryRunTransactionBlockResponse): boolean {
  const effects = dry.effects as JoinPlatformEffects | undefined;
  if (!effects || effects.status?.status === 'success') return false;

  const ae = effects.abortError;
  if (
    ae?.function === 'join_platform' &&
    ae.error_code === JOIN_PLATFORM_ABORT_ALREADY_MEMBER
  ) {
    return true;
  }

  const status = effects.status as { status?: string; error?: string } | undefined;
  const err = `${status?.error ?? ''} ${dry.executionErrorSource ?? ''}`;
  if (!/join_platform/i.test(err)) return false;
  return (
    /\),\s*3\)\s+in\s+command/i.test(err) ||
    /abort code:\s*[, ]?\s*3\b/i.test(err) ||
    /error_code['"]?\s*:\s*3\b/.test(err)
  );
}

/**
 * Dry-run `join_platform` alone. Returns whether the real PTB should include that move.
 * When the wallet is already a member (GraphQL can still lag behind), the chain aborts with code 3;
 * omitting the call avoids failing the bundled BalanceManager setup in the same transaction.
 */
async function shouldIncludeJoinPlatformMove(
  client: MySoJsonRpcClient,
  senderAddress: string,
  config: SofiSwapPlatformConfig
): Promise<boolean> {
  const tx = new Transaction();
  tx.setSender(senderAddress);
  appendJoinPlatformMoves(tx, config);
  const bytes = await tx.build({ client });
  const dry = await client.dryRunTransactionBlock({ transactionBlock: bytes });
  if (dry.effects?.status?.status === 'success') return true;
  if (dryRunIndicatesJoinAlreadyComplete(dry)) return false;
  const st = dry.effects?.status as { status?: string; error?: string } | undefined;
  throw new Error(
    st?.error ||
      dry.executionErrorSource ||
      'join_platform dry run failed — check platform env ids and access rules.'
  );
}

function noopJoinSuccessResponse(): MySoTransactionBlockResponse {
  return {
    digest: '',
    effects: { status: { status: 'success' } } as MySoTransactionBlockResponse['effects'],
  };
}

/** Append `join_platform` Move calls only — caller sets `setSender`. */
export function appendJoinPlatformMoves(
  tx: Transaction,
  config: SofiSwapPlatformConfig
): void {
  const target = getJoinPlatformMoveTarget(config.platformPackageId);
  tx.moveCall({
    target,
    arguments: [
      tx.object(config.platformRegistryObjectId),
      tx.object(config.blockListRegistryObjectId),
      tx.object(config.platformGraphqlId),
    ],
  });
}

export function buildJoinPlatformTransaction(
  senderAddress: string,
  config: SofiSwapPlatformConfig
): Transaction {
  const tx = new Transaction();
  tx.setSender(senderAddress);
  appendJoinPlatformMoves(tx, config);
  return tx;
}

function assertJoinTransactionSucceeded(response: MySoTransactionBlockResponse) {
  const exec = response.effects?.status;
  if (!exec) {
    throw new Error('Join platform: could not read execution effects from the network response.');
  }
  if (exec.status !== 'success') {
    throw new Error(exec.error || 'Join platform transaction failed.');
  }
}

/**
 * Signs and executes the join PTB, verifies success from effects, then waits until the transaction is
 * readable via the RPC API (helps downstream GraphQL/indexer polling).
 */
export async function signAndExecuteJoinPlatform(input: {
  network: NetworkType;
  config: SofiSwapPlatformConfig;
  senderAddress: string;
  signer: Ed25519Keypair;
}): Promise<MySoTransactionBlockResponse> {
  const { network, signer, senderAddress, config } = input;
  const client = getMySoJsonRpcClient(network);
  const obNet = orderbookTradingNetwork(network);
  const executeOpts = { showEffects: true, showObjectChanges: true } as const;

  let shouldAttachBalanceManagerCreate =
    tradingSetupBundledWithJoin() && obNet !== null;
  let skipBalanceManagerRegister = false;

  if (shouldAttachBalanceManagerCreate && obNet) {
    const fresh = await fetchRegisteredBalanceManagerIds(client, senderAddress);
    if (!fresh.error && fresh.ids.length > 0) {
      clearPendingBalanceManagerRegister(network, senderAddress);
      shouldAttachBalanceManagerCreate = false;
      skipBalanceManagerRegister = true;
    }
  }

  const includeJoin = await shouldIncludeJoinPlatformMove(client, senderAddress, config);
  const willAttachBalanceManager = Boolean(shouldAttachBalanceManagerCreate && obNet);

  if (!includeJoin && !willAttachBalanceManager) {
    const response = noopJoinSuccessResponse();
    assertJoinTransactionSucceeded(response);
    return response;
  }

  const response = await executeTransactionWithSmartGas({
    network,
    client,
    signer,
    sender: senderAddress,
    build: (tx) => {
      if (includeJoin) {
        appendJoinPlatformMoves(tx, config);
      }
      if (shouldAttachBalanceManagerCreate && obNet) {
        appendCreateAndShareBalanceManagerMoves(tx, obNet, senderAddress);
      }
    },
    executeOptions: executeOpts,
  });
  assertJoinTransactionSucceeded(response);
  if (response.digest) {
    await client.waitForTransaction({
      digest: response.digest,
      options: { showEffects: true },
      timeout: 120_000,
      pollInterval: 1_500,
    });
  }

  if (tradingSetupBundledWithJoin() && obNet && skipBalanceManagerRegister) {
    return response;
  }

  if (shouldAttachBalanceManagerCreate && obNet) {
    const { orderbookPackageId, registryId } = getResolvedOrderbookDeployment(obNet);
    const registerErrCtx = { network, orderbookPackageId, registryId } as const;
    const managerId = await resolveCreatedBalanceManagerObjectId(
      client,
      response.digest,
      orderbookPackageId,
      response.effects
    );
    writePendingBalanceManagerRegister(network, senderAddress, {
      managerObjectId: managerId,
      createDigest: response.digest,
    });
    let registered: MySoTransactionBlockResponse;
    try {
      registered = await executeTransactionWithSmartGas({
        network,
        client,
        signer,
        sender: senderAddress,
        build: (tx) => {
          appendRegisterBalanceManagerMove(tx, obNet, managerId);
        },
        executeOptions: executeOpts,
      });
    } catch (e) {
      throw augmentRegisterBalanceManagerError(e, registerErrCtx);
    }
    assertJoinTransactionSucceeded(registered);
    await client.waitForTransaction({
      digest: registered.digest,
      options: { showEffects: true },
      timeout: 120_000,
      pollInterval: 1_500,
    });
    clearPendingBalanceManagerRegister(network, senderAddress);
    return registered;
  }

  return response;
}
