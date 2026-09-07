import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { bcs } from '@socialproof/myso/bcs';
import { Ed25519Keypair } from '@socialproof/myso/keypairs/ed25519';
import { Transaction } from '@socialproof/myso/transactions';
import type { MySoTransactionBlockResponse } from '@socialproof/myso/jsonRpc';
import { getMySoJsonRpcClient } from '../lib/myso-client';
import { findCreatedBalanceManagerObjectId } from '../lib/orderbook/balance-manager-effects';
import { signAndExecuteTradingSetup } from '../lib/tx/trading-setup';
import { signAndExecuteJoinPlatform } from '../lib/tx/join-platform';
import { clearAllPendingBalanceManagerRegister, clearPendingBalanceManagerRegister, readPendingBalanceManagerRegister, writePendingBalanceManagerRegister } from '../lib/trading-setup-pending-storage';

const signer = Ed25519Keypair.fromSecretKey(new Uint8Array(32).fill(9));
const senderAddress = signer.toMySoAddress();
const network = 'localnet' as const;
const auth = { network, senderAddress, signer };
const id = (n: number) => `0x${n.toString(16).padStart(64, '0')}`;
const managerId = id(50);
const rpc = getMySoJsonRpcClient(network);
let executed: string[][];
let readable: boolean;
let registryIds: string[];
const createdBlock = (packageId = '0xb0c') => ({ digest: 'created', objectChanges: [{ type: 'created', objectType: `${packageId}::balance_manager::BalanceManager`, objectId: managerId }] }) as MySoTransactionBlockResponse;

beforeEach(() => {
  clearAllPendingBalanceManagerRegister();
  executed = []; readable = false; registryIds = [];
  mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected request: recovery tests are offline'); });
  mock.method(rpc, 'getBalance', async () => ({ totalBalance: '1000000000', coinObjectCount: 1 }));
  mock.method(rpc, 'devInspectTransactionBlock', async () => ({ results: [{ returnValues: [[Array.from(bcs.vector(bcs.Address).serialize(registryIds).toBytes()), 'vector<address>']] }] }));
  mock.method(rpc, 'signAndExecuteTransaction', async ({ transaction }: { transaction: Transaction }) => {
    const functions = transaction.getData().commands.flatMap((c) => c.$kind === 'MoveCall' ? [c.MoveCall.function] : []);
    executed.push(functions);
    return { digest: functions.includes('register_balance_manager') ? 'registered' : 'created', effects: { status: { status: 'success' } } };
  });
  mock.method(rpc, 'getTransactionBlock', async () => {
    if (!readable) throw new Error('Transaction read endpoint is behind');
    return createdBlock();
  });
  mock.method(rpc, 'waitForTransaction', async () => { throw new Error('Read availability timeout'); });
});
afterEach(() => { mock.restoreAll(); clearAllPendingBalanceManagerRegister(); });

test('successful creation survives a read failure and retry resumes the same manager', async () => {
  await assert.rejects(signAndExecuteTradingSetup(auth), /read endpoint is behind/);
  assert.equal(executed.length, 1);
  assert.equal(readPendingBalanceManagerRegister(network, senderAddress)?.createDigest, 'created');
  readable = true;
  const registered = await signAndExecuteTradingSetup(auth);
  assert.equal(registered?.digest, 'registered');
  assert.equal(executed.length, 2);
  assert.deepEqual(executed[1], ['register_balance_manager']);
  assert.equal(readPendingBalanceManagerRegister(network, senderAddress)?.managerObjectId, managerId);
  // A successful registration is not repeated even if the registry view is still behind.
  assert.equal(await signAndExecuteTradingSetup(auth), null);
  assert.equal(executed.length, 2);
  registryIds = [managerId];
  assert.equal(await signAndExecuteTradingSetup(auth), null);
  assert.equal(readPendingBalanceManagerRegister(network, senderAddress), null);
});

test('creation object changes are used directly without requiring another RPC read', async () => {
  const execute = rpc.signAndExecuteTransaction.bind(rpc);
  mock.method(rpc, 'signAndExecuteTransaction', async (input: Parameters<typeof rpc.signAndExecuteTransaction>[0]) => {
    const result = await execute(input);
    return result.digest === 'created' ? { ...result, objectChanges: createdBlock(id(0xb0c)).objectChanges } : result;
  });
  const results = await Promise.all([signAndExecuteTradingSetup(auth), signAndExecuteTradingSetup(auth)]);
  assert.equal(results[0]?.digest, 'registered');
  assert.equal(results[1], null);
  assert.equal(executed.length, 2, 'concurrent setup must not duplicate creation or registration');
});

test('registry failure stops setup before any transaction', async () => {
  mock.method(rpc, 'devInspectTransactionBlock', async () => ({ error: 'Registry unavailable' }));
  await assert.rejects(signAndExecuteTradingSetup(auth), /Registry unavailable/);
  assert.equal(executed.length, 0);
});

test('bundled platform join records creation before a failing read and resumes on retry', async () => {
  mock.method(Transaction.prototype, 'build', async () => new Uint8Array([1]));
  let joined = false;
  mock.method(rpc, 'dryRunTransactionBlock', async () => ({ effects: { status: joined ? { status: 'failure', error: 'join_platform abort code: 3' } : { status: 'success' } } }));
  const config = { platformPackageId: '0x50c1', platformRegistryObjectId: id(1), blockListRegistryObjectId: id(2), platformGraphqlId: id(3) };
  await assert.rejects(signAndExecuteJoinPlatform({ ...auth, config }), /read endpoint is behind/);
  assert.ok(executed[0].includes('join_platform'));
  assert.equal(readPendingBalanceManagerRegister(network, senderAddress)?.createDigest, 'created');
  joined = true; readable = true;
  await signAndExecuteJoinPlatform({ ...auth, config });
  assert.equal(executed.length, 2);
  assert.deepEqual(executed[1], ['register_balance_manager']);
});

test('created manager discovery accepts padded package IDs but never a different package', () => {
  assert.equal(findCreatedBalanceManagerObjectId('0x0b0c', createdBlock(id(0xb0c))), managerId);
  assert.equal(findCreatedBalanceManagerObjectId('0xb0c', createdBlock('0xb0c1')), null);
  assert.equal(findCreatedBalanceManagerObjectId('0xb0c', createdBlock('0x9999')), null);
});

test('storage quota failures cannot replace a newer recovery record with stale registration state', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  const stale = { managerObjectId: managerId, createDigest: 'created', savedAt: Date.now() };
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: () => JSON.stringify(stale),
    setItem: () => { throw new Error('Quota exceeded'); },
    removeItem: () => { throw new Error('Storage unavailable'); },
  } });
  try {
    writePendingBalanceManagerRegister(network, senderAddress, { ...stale, registerDigest: 'registered' });
    assert.equal(readPendingBalanceManagerRegister(network, senderAddress)?.registerDigest, 'registered');
    clearPendingBalanceManagerRegister(network, senderAddress);
    assert.equal(readPendingBalanceManagerRegister(network, senderAddress), null);
  } finally {
    if (original) Object.defineProperty(globalThis, 'sessionStorage', original);
    else Reflect.deleteProperty(globalThis, 'sessionStorage');
  }
});

test('concurrent join requests share one bundled creation and registration', async () => {
  readable = true;
  mock.method(Transaction.prototype, 'build', async () => new Uint8Array([1]));
  mock.method(rpc, 'dryRunTransactionBlock', async () => ({ effects: { status: { status: 'success' } } }));
  const input = { ...auth, config: { platformPackageId: '0x50c1', platformRegistryObjectId: id(1), blockListRegistryObjectId: id(2), platformGraphqlId: id(3) } };
  const results = await Promise.all([signAndExecuteJoinPlatform(input), signAndExecuteJoinPlatform(input)]);
  assert.equal(results[0]?.digest, 'registered');
  assert.equal(results[1]?.digest, 'registered');
  assert.equal(executed.length, 2);
  assert.ok(executed[0].includes('join_platform'));
  assert.deepEqual(executed[1], ['register_balance_manager']);
});
