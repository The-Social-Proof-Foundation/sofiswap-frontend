import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { Ed25519Keypair } from '@socialproof/myso/keypairs/ed25519';
import { Transaction } from '@socialproof/myso/transactions';
import { getMySoJsonRpcClient } from '../lib/myso-client';
import { setDiscoveredOrderbookMarkets } from '../lib/orderbook/discovered-markets';
import { checkedOrderbookAmount } from '../lib/orderbook/amounts';
import { executeDepositIntoBalanceManager } from '../lib/tx/deposit-balance-manager';
import { executeWithdrawFromBalanceManager } from '../lib/tx/withdraw-balance-manager';
import { executePlaceLimitOrder } from '../lib/tx/place-limit-order';
import { executePlaceMarketOrder } from '../lib/tx/place-market-order';
import { executeCancelPoolOrder } from '../lib/tx/cancel-order';
import { validateOrderForSubmission, orderBaseQuantity } from '../lib/trade/order-placement-utils';

const signer = Ed25519Keypair.fromSecretKey(new Uint8Array(32).fill(8));
const sender = signer.toMySoAddress();
const id = (n: number) => `0x${n.toString(16).padStart(64, '0')}`;
const myso = '0x2::myso::MYSO';
const usd = '0x1234::usd::USD';
const auth = { network: 'localnet' as const, obNet: 'localnet' as const, sender, signer, balanceManagerObjectId: id(1) };
let captured: ReturnType<Transaction['getData']> | null = null;

beforeEach(() => {
  captured = null;
  mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected request: all transaction tests must be offline'); });
  for (const network of ['localnet', 'testnet'] as const) {
    setDiscoveredOrderbookMarkets(network, {
      coins: { MYSO: { address: '0x2', type: myso, scalar: 1e9 }, USD: { address: '0x1234', type: usd, scalar: 1e6 } },
      pools: { MYSO_USD: { address: id(2), baseCoin: 'MYSO', quoteCoin: 'USD' } },
    });
    const client = getMySoJsonRpcClient(network);
    mock.method(client, 'getBalance', async () => ({ totalBalance: '10000000000', coinObjectCount: 1 }));
    mock.method(client, 'signAndExecuteTransaction', async ({ transaction, options }: { transaction: Transaction; options: { showEffects: boolean } }) => {
      assert.equal(options.showEffects, true);
      captured = transaction.getData();
      return { digest: 'offline-native', effects: { status: { status: 'success' } } };
    });
  }
});
afterEach(() => mock.restoreAll());

function moves() {
  assert.ok(captured);
  return captured.commands.flatMap((c) => c.$kind === 'MoveCall' ? [c.MoveCall] : []);
}

test('native deposit uses the user gas coin only on the user-paid path; withdrawal transfers to the wallet', async () => {
  await executeDepositIntoBalanceManager({ ...auth, coinKey: 'MYSO', amount: 1.25 });
  assert.equal(moves()[0].function, 'deposit');
  assert.deepEqual(moves()[0].typeArguments, [myso]);
  const intent = captured!.commands.find((c) => c.$kind === '$Intent');
  assert.equal(intent?.$Intent?.data.type, 'gas');
  await executeWithdrawFromBalanceManager({ ...auth, coinKey: 'USD', amount: 1.25, recipient: sender });
  assert.equal(moves()[0].function, 'withdraw');
  assert.deepEqual(moves()[0].typeArguments, [usd]);
  assert.equal(captured!.commands.at(-1)?.$kind, 'TransferObjects');
});

test('sponsored native deposit resolves sender coins, never sponsor gas, and pins the network', async () => {
  const urls: string[] = [];
  mock.method(getMySoJsonRpcClient('testnet'), 'getBalance', async () => ({ totalBalance: '500000', coinObjectCount: 1 }));
  mock.method(Transaction.prototype, 'build', async function (this: Transaction) { captured = this.getData(); return new Uint8Array([1, 2, 3]); });
  mock.method(signer, 'signTransaction', async () => ({ signature: 'offline-signature', bytes: 'AQID' }));
  mock.method(globalThis, 'fetch', async (url: unknown) => {
    urls.push(String(url));
    if (String(url).includes('/reserve?')) return Response.json({ result: { sponsor_address: id(90), reservation_id: 7, gas_coins: [{ objectId: id(91), version: 1, digest: '11111111111111111111111111111111' }] }, error: null });
    assert.match(String(url), /\/execute\?network=testnet$/);
    return Response.json({ result: { digest: 'offline-sponsored', effects: { status: { status: 'success' } }, events: [] }, error: null });
  });
  await executeDepositIntoBalanceManager({ ...auth, network: 'testnet', obNet: 'testnet', coinKey: 'MYSO', amount: 0.0001 });
  assert.equal(urls.length, 2);
  assert.ok(urls.every((url) => url.endsWith('?network=testnet')));
  const intent = captured!.commands.find((c) => c.$kind === '$Intent');
  assert.match(String(intent?.$Intent?.data.type), /::myso::MYSO$/);
  assert.notEqual(intent?.$Intent?.data.type, 'gas');
  assert.equal(captured!.gasData.owner, id(90));
});

test('limit buys, market sells, and cancel use discovered pool and manager objects', async () => {
  const order = { ...auth, poolKey: 'MYSO_USD', clientOrderId: '123', quantity: 1 };
  await executePlaceLimitOrder({ ...order, side: 'buy', price: 2 });
  assert.equal(moves().at(-1)?.function, 'place_limit_order');
  assert.deepEqual(moves().at(-1)?.typeArguments, [myso, usd]);
  assert.ok(captured!.inputs.some((input) => input.$kind === 'UnresolvedObject' && input.UnresolvedObject.objectId === id(2)));
  await executePlaceMarketOrder({ ...order, side: 'sell' });
  assert.equal(moves().at(-1)?.function, 'place_market_order');
  await executeCancelPoolOrder({ ...auth, poolKey: 'MYSO_USD', orderId: '456' });
  assert.equal(moves().at(-1)?.function, 'cancel_order');
});

test('native transfer rejects chain failures, mismatched networks and signing wallets', async () => {
  const input = { ...auth, coinKey: 'MYSO', amount: 1 };
  await assert.rejects(executeDepositIntoBalanceManager({ ...input, obNet: 'testnet' }), /networks do not match/);
  await assert.rejects(executeDepositIntoBalanceManager({ ...input, sender: id(99) }), /signing wallet/);
  mock.method(getMySoJsonRpcClient('localnet'), 'signAndExecuteTransaction', async () => ({ digest: 'offline-abort', effects: { status: { status: 'failure', error: 'InsufficientBalance' } } }));
  await assert.rejects(executeDepositIntoBalanceManager(input), /InsufficientBalance/);
});

test('native amount validation rejects excess precision, zero balances and unsafe numbers', () => {
  assert.equal(checkedOrderbookAmount(1.000001, 1e6), BigInt(1000001));
  for (const amount of [0, -1, NaN, Infinity, 0.0000001, 1e10]) assert.throws(() => checkedOrderbookAmount(amount, 1e6));
  const context = { bookParams: null, baseBalance: 0, quoteBalance: 0, midPrice: 1, bestBid: 1, bestAsk: 1 };
  assert.equal(validateOrderForSubmission({ side: 'buy', orderType: 'market', amount: 1 }, context).ok, false);
  assert.equal(validateOrderForSubmission({ side: 'sell', orderType: 'market', amount: 1 }, context).ok, false);
});

test('a buy budget is converted to base quantity before lot and balance validation', () => {
  const quantity = orderBaseQuantity('buy', 10, 2);
  assert.equal(quantity, 5);
  const result = validateOrderForSubmission({ side: 'buy', orderType: 'limit', amount: quantity, limitPrice: 2 }, {
    bookParams: { tickSize: 0.01, lotSize: 0.1, minSize: 0.1 }, baseBalance: 0, quoteBalance: 10, midPrice: 2, bestBid: 1.9, bestAsk: 2,
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.roundedQuantity * result.roundedPrice!, 10);
  assert.equal(orderBaseQuantity('sell', 10, 2), 10);
  assert.equal(orderBaseQuantity('buy', 10, 0), 0);
});
