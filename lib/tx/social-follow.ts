import type { MySoTransactionBlockResponse } from '@socialproof/myso/jsonRpc';
import type { Ed25519Keypair } from '@socialproof/myso/keypairs/ed25519';
import { Transaction } from '@socialproof/myso/transactions';

import { getMySoJsonRpcClient } from '@/lib/myso-client';
import {
  MYSOCIAL_SOCIAL_GRAPH_OBJECT_ID,
  MYSOCIAL_SOCIAL_PACKAGE_ID,
} from '@/lib/mysocial-chain-constants';
import type { NetworkType } from '@/lib/network-utils';
import { executeTransactionWithSmartGas } from '@/lib/transaction-utils';

function socialGraphFollowTarget(): `${string}::social_graph::follow` {
  return `${MYSOCIAL_SOCIAL_PACKAGE_ID}::social_graph::follow`;
}

function socialGraphUnfollowTarget(): `${string}::social_graph::unfollow` {
  return `${MYSOCIAL_SOCIAL_PACKAGE_ID}::social_graph::unfollow`;
}

export function appendSocialGraphFollowMove(tx: Transaction, followingAddress: string): void {
  const addr = followingAddress.trim();
  if (!addr) throw new Error('Following address is required');
  tx.moveCall({
    target: socialGraphFollowTarget(),
    arguments: [tx.object(MYSOCIAL_SOCIAL_GRAPH_OBJECT_ID), tx.pure.address(addr)],
  });
}

export function appendSocialGraphUnfollowMove(tx: Transaction, followingAddress: string): void {
  const addr = followingAddress.trim();
  if (!addr) throw new Error('Following address is required');
  tx.moveCall({
    target: socialGraphUnfollowTarget(),
    arguments: [tx.object(MYSOCIAL_SOCIAL_GRAPH_OBJECT_ID), tx.pure.address(addr)],
  });
}

function assertSocialTxSucceeded(response: MySoTransactionBlockResponse, label: string): void {
  const exec = response.effects?.status;
  if (!exec) {
    throw new Error(`${label}: could not read execution effects from the network response.`);
  }
  if (exec.status !== 'success') {
    throw new Error(exec.error || `${label} failed.`);
  }
}

export async function signAndExecuteFollowUser(input: {
  network: NetworkType;
  signer: Ed25519Keypair;
  followerAddress: string;
  followingAddress: string;
}): Promise<MySoTransactionBlockResponse> {
  const { network, signer, followerAddress, followingAddress } = input;
  const client = getMySoJsonRpcClient(network);
  const response = await executeTransactionWithSmartGas({
    network,
    client,
    signer,
    sender: followerAddress.trim(),
    build: (tx) => {
      appendSocialGraphFollowMove(tx, followingAddress);
    },
    executeOptions: { showEffects: true },
  });
  assertSocialTxSucceeded(response, 'Follow');
  return response;
}

export async function signAndExecuteUnfollowUser(input: {
  network: NetworkType;
  signer: Ed25519Keypair;
  followerAddress: string;
  followingAddress: string;
}): Promise<MySoTransactionBlockResponse> {
  const { network, signer, followerAddress, followingAddress } = input;
  const client = getMySoJsonRpcClient(network);
  const response = await executeTransactionWithSmartGas({
    network,
    client,
    signer,
    sender: followerAddress.trim(),
    build: (tx) => {
      appendSocialGraphUnfollowMove(tx, followingAddress);
    },
    executeOptions: { showEffects: true },
  });
  assertSocialTxSucceeded(response, 'Unfollow');
  return response;
}
