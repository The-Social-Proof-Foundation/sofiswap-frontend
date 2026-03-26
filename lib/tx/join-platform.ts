import type { MySoTransactionBlockResponse } from '@socialproof/myso/jsonRpc';
import type { Ed25519Keypair } from '@socialproof/myso/keypairs/ed25519';
import { Transaction } from '@socialproof/myso/transactions';

import { getMySoJsonRpcClient } from '@/lib/myso-client';
import type { NetworkType } from '@/lib/network-utils';
import { executeTransactionWithSmartGas } from '@/lib/transaction-utils';
import {
  getJoinPlatformMoveTarget,
  type SofiSwapPlatformConfig,
} from '@/lib/platform-config';

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
  const response = await executeTransactionWithSmartGas({
    network,
    client,
    signer,
    sender: senderAddress,
    build: (tx) => {
      appendJoinPlatformMoves(tx, config);
    },
    executeOptions: {
      showEffects: true,
    },
  });
  assertJoinTransactionSucceeded(response);
  await client.waitForTransaction({
    digest: response.digest,
    options: { showEffects: true },
    timeout: 120_000,
    pollInterval: 1_500,
  });
  return response;
}
