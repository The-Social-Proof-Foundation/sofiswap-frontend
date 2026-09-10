import type {
  DryRunTransactionBlockResponse,
  MySoJsonRpcClient,
  MySoTransactionBlockResponse,
} from '@socialproof/myso/jsonRpc';
import type { Ed25519Keypair } from '@socialproof/myso/keypairs/ed25519';
import { Transaction } from '@socialproof/myso/transactions';

import { findCreatedBalanceManagerObjectId } from '@/lib/orderbook/balance-manager-effects';
import { signAndExecuteTradingSetup } from '@/lib/tx/trading-setup';
import {
  getResolvedOrderbookDeployment,
  orderbookTradingNetwork,
  tradingSetupBundledWithJoin,
} from '@/lib/orderbook/config';
import {
  appendCreateAndShareBalanceManagerMoves,
  fetchRegisteredBalanceManagerIds,
} from '@/lib/orderbook/runtime';
import { getMySoJsonRpcClient } from '@/lib/myso-client';
import type { NetworkType } from '@/lib/network-utils';
import {
  assertJoinPlatformObjectIds,
  getJoinPlatformMoveTarget,
  type SofiSwapPlatformConfig,
} from '@/lib/platform-config';
import { MYSO_CLOCK_OBJECT_ID } from '@/lib/spt/chain-config';
import {
  clearPendingBalanceManagerRegister,
  readPendingBalanceManagerRegister,
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

/**
 * `social_contracts::platform::join_platform`:
 * registry, block_list_registry, platform, clock (`0x6`). `TxContext` is implicit.
 */
export function appendJoinPlatformMoves(
  tx: Transaction,
  config: SofiSwapPlatformConfig
): void {
  assertJoinPlatformObjectIds(config);
  const target = getJoinPlatformMoveTarget(config.platformPackageId);
  tx.moveCall({
    target,
    arguments: [
      tx.object(config.platformRegistryObjectId),
      tx.object(config.blockListRegistryObjectId),
      tx.object(config.platformGraphqlId),
      tx.object(MYSO_CLOCK_OBJECT_ID),
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
type JoinPlatformInput = {
  network: NetworkType;
  config: SofiSwapPlatformConfig;
  senderAddress: string;
  signer: Ed25519Keypair;
};
const joining = new Map<string, Promise<MySoTransactionBlockResponse>>();

export async function signAndExecuteJoinPlatform(input: JoinPlatformInput): Promise<MySoTransactionBlockResponse> {
  const key = `${input.network}:${input.senderAddress.toLowerCase()}:${input.config.platformGraphqlId}`;
  const existing = joining.get(key);
  if (existing) return existing;
  const run = signAndExecuteJoinPlatformImpl(input);
  joining.set(key, run);
  try { return await run; }
  finally { if (joining.get(key) === run) joining.delete(key); }
}

async function signAndExecuteJoinPlatformImpl(input: JoinPlatformInput): Promise<MySoTransactionBlockResponse> {
  const { network, signer, senderAddress, config } = input;
  const client = getMySoJsonRpcClient(network);
  const obNet = orderbookTradingNetwork(network);
  const executeOpts = { showEffects: true, showObjectChanges: true } as const;

  let shouldAttachBalanceManagerCreate =
    tradingSetupBundledWithJoin() && obNet !== null;
  const pending = readPendingBalanceManagerRegister(network, senderAddress);

  if (shouldAttachBalanceManagerCreate && obNet) {
    try {
      const fresh = await fetchRegisteredBalanceManagerIds(client, senderAddress);
      if (fresh.error) {
        console.warn(
          '[SofiSwap] Join: skipping bundled balance-manager create; registry view failed.',
          fresh.error
        );
        shouldAttachBalanceManagerCreate = false;
      } else if (fresh.ids.length > 0) {
        clearPendingBalanceManagerRegister(network, senderAddress);
        shouldAttachBalanceManagerCreate = false;
      }
    } catch (e) {
      console.warn('[SofiSwap] Join: skipping bundled balance-manager create; registry view threw.', e);
      shouldAttachBalanceManagerCreate = false;
    }
  }

  if (pending) shouldAttachBalanceManagerCreate = false;

  const includeJoin = await shouldIncludeJoinPlatformMove(client, senderAddress, config);
  const willAttachBalanceManager = Boolean(shouldAttachBalanceManagerCreate && obNet);

  if (!includeJoin && !willAttachBalanceManager) {
    if (tradingSetupBundledWithJoin()) await signAndExecuteTradingSetup({ network, senderAddress, signer });
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
  if (shouldAttachBalanceManagerCreate) {
    const { orderbookPackageId } = getResolvedOrderbookDeployment(obNet);
    // Save the execution result before querying its created object. A delayed
    // endpoint must never cause the next join attempt to create a second manager.
    writePendingBalanceManagerRegister(network, senderAddress, {
      managerObjectId: findCreatedBalanceManagerObjectId(orderbookPackageId, response) ?? '',
      createDigest: response.digest,
    });
  }
  if (tradingSetupBundledWithJoin()) {
    try {
      return (await signAndExecuteTradingSetup({ network, senderAddress, signer })) ?? response;
    } catch (e) {
      console.warn(
        '[SofiSwap] Join succeeded; trading setup will continue from Enable trading.',
        e
      );
      return response;
    }
  }
  return response;
}
