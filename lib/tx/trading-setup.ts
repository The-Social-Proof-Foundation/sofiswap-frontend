import type { MySoTransactionBlockResponse } from '@socialproof/myso/jsonRpc';
import type { Ed25519Keypair } from '@socialproof/myso/keypairs/ed25519';

import { augmentRegisterBalanceManagerError } from '@/lib/orderbook/balance-manager-register-errors';
import { resolveCreatedBalanceManagerObjectId } from '@/lib/orderbook/balance-manager-effects';
import { getResolvedOrderbookDeployment, orderbookTradingNetwork } from '@/lib/orderbook/config';
import {
  appendCreateAndShareBalanceManagerMoves,
  appendRegisterBalanceManagerMove,
  fetchRegisteredBalanceManagerIds,
} from '@/lib/orderbook/runtime';
import { getMySoJsonRpcClient } from '@/lib/myso-client';
import type { NetworkType } from '@/lib/network-utils';
import {
  clearPendingBalanceManagerRegister,
  readPendingBalanceManagerRegister,
  writePendingBalanceManagerRegister,
} from '@/lib/trading-setup-pending-storage';
import { executeTransactionWithSmartGas } from '@/lib/transaction-utils';

const EXECUTE_OPTIONS = {
  showEffects: true,
  showObjectChanges: true,
} as const;

/** Serialize trading-setup attempts per (network, sender) to avoid overlapping PTBs. */
const setupQueues = new Map<string, Promise<unknown>>();

function runTradingSetupExclusive<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = setupQueues.get(key) ?? Promise.resolve();
  const run = prev.then(() => fn());
  const tail = run.then(() => undefined, () => undefined);
  setupQueues.set(key, tail);
  void run.finally(() => {
    if (setupQueues.get(key) === tail) setupQueues.delete(key);
  });
  return run;
}

function setupMutexKey(network: NetworkType, senderAddress: string): string {
  return `${network}:${senderAddress.toLowerCase()}`;
}

function assertSuccess(response: MySoTransactionBlockResponse) {
  const exec = response.effects?.status;
  if (!exec) {
    throw new Error('Trading setup: could not read execution effects from the network response.');
  }
  if (exec.status !== 'success') {
    throw new Error(exec.error || 'Trading setup transaction failed.');
  }
}

async function waitCommitted(
  client: ReturnType<typeof getMySoJsonRpcClient>,
  digest: string
): Promise<void> {
  await client.waitForTransaction({
    digest,
    options: { showEffects: true },
    timeout: 120_000,
    pollInterval: 1_500,
  });
}

/**
 * Create + share, then register BalanceManager on the orderbook registry (two PTBs; mainnet/testnet only).
 *
 * Returns `null` when the registry already lists at least one balance manager for this sender (no new object).
 */
export async function signAndExecuteTradingSetup(input: {
  network: NetworkType;
  senderAddress: string;
  signer: Ed25519Keypair;
}): Promise<MySoTransactionBlockResponse | null> {
  return runTradingSetupExclusive(setupMutexKey(input.network, input.senderAddress), () =>
    signAndExecuteTradingSetupImpl(input)
  );
}

async function signAndExecuteTradingSetupImpl(input: {
  network: NetworkType;
  senderAddress: string;
  signer: Ed25519Keypair;
}): Promise<MySoTransactionBlockResponse | null> {
  const ob = orderbookTradingNetwork(input.network);
  if (!ob) {
    throw new Error('Trading setup is not available on localnet.');
  }
  const client = getMySoJsonRpcClient(input.network);
  const { orderbookPackageId, registryId } = getResolvedOrderbookDeployment(ob);
  const registerErrCtx = {
    network: input.network,
    orderbookPackageId,
    registryId,
  } as const;

  const fresh = await fetchRegisteredBalanceManagerIds(client, input.senderAddress);
  if (!fresh.error && fresh.ids.length > 0) {
    clearPendingBalanceManagerRegister(input.network, input.senderAddress);
    return null;
  }

  const pending = readPendingBalanceManagerRegister(input.network, input.senderAddress);
  if (pending) {
    const pendingRecheck = await fetchRegisteredBalanceManagerIds(client, input.senderAddress);
    if (!pendingRecheck.error && pendingRecheck.ids.length > 0) {
      clearPendingBalanceManagerRegister(input.network, input.senderAddress);
      return null;
    }
    let registered: MySoTransactionBlockResponse;
    try {
      registered = await executeTransactionWithSmartGas({
        network: input.network,
        client,
        signer: input.signer,
        sender: input.senderAddress,
        build: (tx) => {
          appendRegisterBalanceManagerMove(tx, ob, pending.managerObjectId);
        },
        executeOptions: EXECUTE_OPTIONS,
      });
    } catch (e) {
      throw augmentRegisterBalanceManagerError(e, registerErrCtx);
    }
    assertSuccess(registered);
    await waitCommitted(client, registered.digest);
    clearPendingBalanceManagerRegister(input.network, input.senderAddress);
    return registered;
  }

  const created = await executeTransactionWithSmartGas({
    network: input.network,
    client,
    signer: input.signer,
    sender: input.senderAddress,
    build: (tx) => {
      appendCreateAndShareBalanceManagerMoves(tx, ob, input.senderAddress);
    },
    executeOptions: EXECUTE_OPTIONS,
  });
  assertSuccess(created);
  await waitCommitted(client, created.digest);

  const managerId = await resolveCreatedBalanceManagerObjectId(
    client,
    created.digest,
    orderbookPackageId,
    created.effects
  );

  writePendingBalanceManagerRegister(input.network, input.senderAddress, {
    managerObjectId: managerId,
    createDigest: created.digest,
  });

  let registered: MySoTransactionBlockResponse;
  try {
    registered = await executeTransactionWithSmartGas({
      network: input.network,
      client,
      signer: input.signer,
      sender: input.senderAddress,
      build: (tx) => {
        appendRegisterBalanceManagerMove(tx, ob, managerId);
      },
      executeOptions: EXECUTE_OPTIONS,
    });
  } catch (e) {
    throw augmentRegisterBalanceManagerError(e, registerErrCtx);
  }
  assertSuccess(registered);
  await waitCommitted(client, registered.digest);
  clearPendingBalanceManagerRegister(input.network, input.senderAddress);
  return registered;
}
