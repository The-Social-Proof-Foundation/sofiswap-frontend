import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { Ed25519Keypair } from '@socialproof/myso/keypairs/ed25519';
import { Transaction } from '@socialproof/myso/transactions';
import type { MySoJsonRpcClient, MySoTransactionBlockResponse } from '@socialproof/myso/jsonRpc';

import { getMySoJsonRpcClient } from '../lib/myso-client';
import {
  applyTransactionExpiration,
  executeTransactionWithSmartGas,
  isTransientSubmissionError,
  TX_EXPIRATION_EPOCHS,
} from '../lib/transaction-utils';

const rpc: MySoJsonRpcClient = getMySoJsonRpcClient('localnet');
const signer = Ed25519Keypair.generate();
const sender = signer.toMySoAddress();

const CURRENT_EPOCH = 591;

/** Mirrors a localnet node: epochs advance every ~60s, so an SDK-default +1 window is short-lived. */
const staleRejection = () => new Error(
  'Transaction is rejected as invalid by more than 1/3 of validators by stake (non-retriable). ' +
  'Non-retriable errors: [Transaction Expired { k#99f25ef6.. } with 10000 stake].'
);
const versionRejection = () => new Error(
  'Transaction is rejected as invalid by more than 1/3 of validators by stake (non-retriable). ' +
  'Non-retriable errors: [Object ID 0x49aced Version 0x69120 Digest HFk is not available for consumption, current version: 0x6997f]'
);

let built: Transaction[];

/** Only `digest` and `effects.status` are read by the submission path. */
const successResponse = (digest: string) =>
  ({ digest, effects: { status: { status: 'success' } } }) as unknown as MySoTransactionBlockResponse;

beforeEach(() => {
  built = [];
  mock.method(rpc, 'getBalance', async () => ({ totalBalance: '1000000000', coinObjectCount: 1 }));
  mock.method(rpc, 'getLatestMySoSystemState', async () => ({ epoch: String(CURRENT_EPOCH), chainIdentifier: 'chain' }));
  mock.method(rpc, 'getChainIdentifier', async () => 'abcd1234');
});
afterEach(() => mock.restoreAll());

function buildCallback(tx: Transaction) {
  built.push(tx);
  tx.moveCall({ target: '0x2::myso::transfer', arguments: [] });
}

async function execute() {
  return executeTransactionWithSmartGas({
    network: 'localnet',
    client: rpc,
    signer,
    sender,
    build: buildCallback,
  });
}

test('app transactions carry a validity window that outlives a reviewed quote', async () => {
  const submitted: Transaction[] = [];
  mock.method(rpc, 'signAndExecuteTransaction', async ({ transaction }: { transaction: Transaction }) => {
    submitted.push(transaction);
    return successResponse('ok');
  });

  const response = await execute();

  assert.equal(response.digest, 'ok');
  assert.equal(submitted.length, 1);
  const expiration = submitted[0].getData().expiration as {
    $kind: string;
    ValidDuring?: { minEpoch?: string; maxEpoch?: string; chain?: string; nonce?: number };
  };
  assert.equal(expiration?.$kind, 'ValidDuring');
  assert.equal(expiration?.ValidDuring?.minEpoch, String(CURRENT_EPOCH));
  assert.equal(expiration?.ValidDuring?.maxEpoch, String(CURRENT_EPOCH + TX_EXPIRATION_EPOCHS));
  assert.equal(expiration?.ValidDuring?.chain, 'abcd1234');
  assert.equal(typeof expiration?.ValidDuring?.nonce, 'number');
  // 60s epochs: the SDK default (+1) expires across a create+register or quote review.
  assert.ok(TX_EXPIRATION_EPOCHS > 1);
});

test('expiration widens against the node epoch and never blocks a trade on a read failure', async () => {
  const tx = new Transaction();
  await applyTransactionExpiration(tx, rpc);
  const expiration = tx.getData().expiration as { ValidDuring?: { maxEpoch?: string } };
  assert.equal(expiration?.ValidDuring?.maxEpoch, String(CURRENT_EPOCH + TX_EXPIRATION_EPOCHS));

  mock.restoreAll();
  mock.method(rpc, 'getBalance', async () => ({ totalBalance: '1000000000', coinObjectCount: 1 }));
  mock.method(rpc, 'getLatestMySoSystemState', async () => { throw new Error('system state unavailable'); });
  mock.method(rpc, 'signAndExecuteTransaction', async () => successResponse('nodefault'));

  const fallbackTx = new Transaction();
  await applyTransactionExpiration(fallbackTx, rpc);
  assert.equal(fallbackTx.getData().expiration, null);
  const response = await execute();
  assert.equal(response.digest, 'nodefault');
  assert.equal((built[0].getData().expiration as { Epoch?: string } | null)?.Epoch, undefined);
});

test('a stale submission is rebuilt with fresh object versions and then lands', async () => {
  let attempts = 0;
  mock.method(rpc, 'signAndExecuteTransaction', async () => {
    attempts += 1;
    if (attempts === 1) throw staleRejection();
    return successResponse('second-try');
  });

  const response = await execute();

  assert.equal(response.digest, 'second-try');
  assert.equal(attempts, 2);
  // A retry must build a new PTB: reusing the old one would resubmit stale object refs.
  assert.equal(built.length, 2);
  assert.notEqual(built[0], built[1]);
});

test('a consumed-object rejection is retried the same way', async () => {
  let attempts = 0;
  mock.method(rpc, 'signAndExecuteTransaction', async () => {
    attempts += 1;
    if (attempts === 1) throw versionRejection();
    return successResponse('landed');
  });

  assert.equal((await execute()).digest, 'landed');
  assert.equal(attempts, 2);
});

test('an on-chain abort is final and never resubmitted', async () => {
  let attempts = 0;
  mock.method(rpc, 'signAndExecuteTransaction', async () => {
    attempts += 1;
    return {
      digest: 'aborted',
      effects: { status: { status: 'failure', error: 'MoveAbort ... abort code: 23 ... social_proof_tokens' } },
    } as unknown as MySoTransactionBlockResponse;
  });

  await assert.rejects(execute(), /abort code: 23/);
  assert.equal(attempts, 1);
  assert.equal(built.length, 1);
});

test('a precondition failure is surfaced without a retry', async () => {
  let attempts = 0;
  mock.method(rpc, 'signAndExecuteTransaction', async () => {
    attempts += 1;
    throw new Error('This wallet does not hold enough of this Social Proof Token.');
  });

  await assert.rejects(execute(), /does not hold enough/);
  assert.equal(attempts, 1);
});

test('transient submission errors are distinguished from aborts', () => {
  assert.equal(isTransientSubmissionError(staleRejection()), true);
  assert.equal(isTransientSubmissionError(versionRejection()), true);
  assert.equal(isTransientSubmissionError(new Error('Transaction resolution failed: MoveAbort ... abort code: 23')), false);
  assert.equal(isTransientSubmissionError(new Error('Insufficient MySo for gas.')), false);
});
