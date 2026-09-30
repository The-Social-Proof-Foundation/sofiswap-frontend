import type { MySoTransactionBlockResponse } from '@socialproof/myso/jsonRpc';
import type { Ed25519Keypair } from '@socialproof/myso/keypairs/ed25519';

import { augmentRegisterBalanceManagerError } from '@/lib/orderbook/balance-manager-register-errors';
import {
  findCreatedBalanceManagerObjectId,
  objectIsOrderbookBalanceManager,
  resolveCreatedBalanceManagerObjectId,
} from '@/lib/orderbook/balance-manager-effects';
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
  type PendingBalanceManagerRegisterPayload,
} from '@/lib/trading-setup-pending-storage';
import { writeTradingSetupCache } from '@/lib/trading-setup-cache';
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
  const cleanup = () => {
    if (setupQueues.get(key) === tail) setupQueues.delete(key);
  };
  void run.then(cleanup, cleanup);
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

function compactHexId(value: string): string {
  return value.replace(/^0x/i, '').replace(/^0+/, '').toLowerCase();
}

function errorMentionsObjectId(message: string, objectId: string): boolean {
  const compact = compactHexId(objectId);
  if (!compact) return false;
  const lower = message.toLowerCase();
  if (lower.includes(objectId.toLowerCase())) return true;
  return lower.includes(`0x${compact.padStart(64, '0')}`) || lower.includes(compact);
}

function isMissingOnchainObjectError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /does not exist|input objects are invalid/i.test(msg);
}

function isMissingManagerObjectError(err: unknown, managerId: string): boolean {
  if (!isMissingOnchainObjectError(err)) return false;
  if (!managerId) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return errorMentionsObjectId(msg, managerId);
}

function isUnrecoverablePendingLookupError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    isMissingOnchainObjectError(err) ||
    /could not find a created BalanceManager/i.test(msg)
  );
}

/**
 * Create + share, then register BalanceManager on the orderbook registry (two PTBs; all supported networks).
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

async function createAndPersistPending(input: {
  network: NetworkType;
  senderAddress: string;
  signer: Ed25519Keypair;
  client: ReturnType<typeof getMySoJsonRpcClient>;
  orderbookPackageId: string;
  ob: NonNullable<ReturnType<typeof orderbookTradingNetwork>>;
}): Promise<PendingBalanceManagerRegisterPayload> {
  const created = await executeTransactionWithSmartGas({
    network: input.network,
    client: input.client,
    signer: input.signer,
    sender: input.senderAddress,
    build: (tx) => appendCreateAndShareBalanceManagerMoves(tx, input.ob, input.senderAddress),
    executeOptions: EXECUTE_OPTIONS,
  });
  assertSuccess(created);
  const pending: PendingBalanceManagerRegisterPayload = {
    managerObjectId: findCreatedBalanceManagerObjectId(input.orderbookPackageId, created) ?? '',
    createDigest: created.digest,
    savedAt: Date.now(),
  };
  // Persist the successful creation BEFORE any read or wait can fail.
  writePendingBalanceManagerRegister(input.network, input.senderAddress, pending);
  return pending;
}

async function recoverLivePendingOrNull(input: {
  network: NetworkType;
  senderAddress: string;
  client: ReturnType<typeof getMySoJsonRpcClient>;
  orderbookPackageId: string;
  pending: PendingBalanceManagerRegisterPayload | null;
}): Promise<PendingBalanceManagerRegisterPayload | null> {
  const { pending } = input;
  if (!pending) return null;

  if (pending.managerObjectId) {
    if (await objectIsOrderbookBalanceManager(input.client, pending.managerObjectId, input.orderbookPackageId)) {
      return pending;
    }
    clearPendingBalanceManagerRegister(input.network, input.senderAddress);
    return null;
  }

  try {
    const managerId = await resolveCreatedBalanceManagerObjectId(
      input.client,
      pending.createDigest,
      input.orderbookPackageId
    );
    const resolved = { ...pending, managerObjectId: managerId };
    writePendingBalanceManagerRegister(input.network, input.senderAddress, resolved);
    return resolved;
  } catch (e) {
    if (!isUnrecoverablePendingLookupError(e)) throw e;
  }

  clearPendingBalanceManagerRegister(input.network, input.senderAddress);
  return null;
}

async function resolvePendingManagerId(input: {
  network: NetworkType;
  senderAddress: string;
  client: ReturnType<typeof getMySoJsonRpcClient>;
  orderbookPackageId: string;
  pending: PendingBalanceManagerRegisterPayload;
}): Promise<{ pending: PendingBalanceManagerRegisterPayload; managerId: string }> {
  const managerId =
    input.pending.managerObjectId ||
    (await resolveCreatedBalanceManagerObjectId(
      input.client,
      input.pending.createDigest,
      input.orderbookPackageId
    ));
  const pending = { ...input.pending, managerObjectId: managerId };
  writePendingBalanceManagerRegister(input.network, input.senderAddress, pending);
  return { pending, managerId };
}

async function signAndExecuteTradingSetupImpl(input: {
  network: NetworkType;
  senderAddress: string;
  signer: Ed25519Keypair;
}): Promise<MySoTransactionBlockResponse | null> {
  const ob = orderbookTradingNetwork(input.network);
  const client = getMySoJsonRpcClient(input.network);
  const { orderbookPackageId, registryId } = getResolvedOrderbookDeployment(ob);
  const registerErrCtx = {
    network: input.network,
    orderbookPackageId,
    registryId,
  } as const;
  const createInput = {
    network: input.network,
    senderAddress: input.senderAddress,
    signer: input.signer,
    client,
    orderbookPackageId,
    ob,
  };

  const fresh = await fetchRegisteredBalanceManagerIds(client, input.senderAddress);
  if (fresh.error) throw new Error(fresh.error);
  if (!fresh.error && fresh.ids.length > 0) {
    clearPendingBalanceManagerRegister(input.network, input.senderAddress);
    return null;
  }

  let pending = readPendingBalanceManagerRegister(input.network, input.senderAddress);
  // Registration already succeeded. Do not submit another transaction while a
  // lagging registry read catches up; the caller continues its normal polling.
  if (pending?.registerDigest) return null;

  pending = await recoverLivePendingOrNull({
    network: input.network,
    senderAddress: input.senderAddress,
    client,
    orderbookPackageId,
    pending,
  });

  if (!pending) {
    pending = await createAndPersistPending(createInput);
  }

  let { pending: resolved, managerId } = await resolvePendingManagerId({
    network: input.network,
    senderAddress: input.senderAddress,
    client,
    orderbookPackageId,
    pending,
  });

  const register = async (id: string) => {
    try {
      return await executeTransactionWithSmartGas({
        network: input.network,
        client,
        signer: input.signer,
        sender: input.senderAddress,
        build: (tx) => appendRegisterBalanceManagerMove(tx, ob, id),
        executeOptions: EXECUTE_OPTIONS,
      });
    } catch (e) {
      throw augmentRegisterBalanceManagerError(e, registerErrCtx);
    }
  };

  let registered: MySoTransactionBlockResponse;
  try {
    registered = await register(managerId);
  } catch (e) {
    if (!isMissingManagerObjectError(e, managerId)) throw e;
    clearPendingBalanceManagerRegister(input.network, input.senderAddress);
    pending = await createAndPersistPending(createInput);
    ({ pending: resolved, managerId } = await resolvePendingManagerId({
      network: input.network,
      senderAddress: input.senderAddress,
      client,
      orderbookPackageId,
      pending,
    }));
    registered = await register(managerId);
  }
  assertSuccess(registered);
  writePendingBalanceManagerRegister(input.network, input.senderAddress, {
    ...resolved,
    registerDigest: registered.digest,
  });
  writeTradingSetupCache(input.network, input.senderAddress, {
    ids: [managerId],
    error: null,
  });
  // Do not block the caller on indexer/read lag — localnet waitForTransaction can hang
  // well past its timeout and left Enable trading on "Working…".
  void waitCommitted(client, registered.digest).catch(() => {
    console.warn('Balance manager registered; registry read availability is delayed.', registered.digest);
  });
  return registered;
}
