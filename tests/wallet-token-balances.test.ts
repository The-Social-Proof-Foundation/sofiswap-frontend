import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { fetchWalletTokenBalances, formatBaseUnits } from '../lib/graphql/wallet-token-balances';
import { buildSptHoldingSubjectsQuery, SPT_HOLDING_SUBJECTS_QUERY_NAME } from '../lib/graphql/spt-holding-subjects';

const OWNER = `0x${'1'.repeat(64)}`;
const MYSO = '0x0000000000000000000000000000000000000000000000000000000000000002::myso::MYSO';
const MYUSD = '0xf3d604789e067d0afdb89d209e522155d09f6689e2266ddd87faaa23be7272e6::myusd::MYUSD';
const BTC = '0xc5efb3e6c3561b0eb74d2c6d9fcb7bd776e7fc0ce026c4478fcbbb4af0ee56be::btc::BTC';

afterEach(() => mock.restoreAll());

function mockBalances(nodes: Array<{ repr: string; total: string }>, metadata: Record<string, unknown>) {
  const queried: string[] = [];
  mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    const query = String(body.query);
    if (query.includes('SofiSwapWalletTokenBalances')) {
      return Response.json({
        data: { address: { balances: { nodes: nodes.map((n) => ({ coinType: { repr: n.repr }, totalBalance: n.total })) } } },
      });
    }
    if (query.includes('SofiSwapWalletCoinMetadata')) {
      const type = String(body.variables?.type);
      queried.push(type);
      return Response.json({ data: { coinMetadata: metadata[type] ?? null } });
    }
    throw new Error(`Unexpected query ${query.slice(0, 60)}`);
  });
  return queried;
}

test('wallet tokens drop empty balances and lead with the swap coin', async () => {
  mockBalances(
    [
      { repr: BTC, total: '32000' },
      { repr: MYSO, total: '1977298454933' },
      { repr: MYUSD, total: '772849882' },
      { repr: '0xdead::useless::USELESS', total: '0' },
    ],
    {
      [MYSO]: { symbol: 'MySo', decimals: 9, name: 'MySocial' },
      [MYUSD]: { symbol: 'MYUSD', decimals: 6, name: 'MySocial USD' },
      [BTC]: { symbol: 'BTC', decimals: 8, name: 'Bitcoin' },
    }
  );

  const rows = await fetchWalletTokenBalances({ network: 'localnet', owner: OWNER });

  assert.deepEqual(rows.map((row) => row.symbol), ['MySo', 'MYUSD', 'BTC']);
  assert.equal(rows[0].isMyso, true);
  assert.equal(rows[0].amountDisplay, '1977.2984');
  assert.equal(rows[1].amountDisplay, '772.8498');
  assert.equal(rows[2].amountDisplay, '0.0003');
});

test('padded and canonical coin types are not listed twice', async () => {
  mockBalances(
    [
      { repr: MYSO, total: '1000000000' },
      { repr: MYSO.replace('0x0000000000000000000000000000000000000000000000000000000000000002', '0x2'), total: '2000000000' },
    ],
    { [MYSO]: { symbol: 'MySo', decimals: 9, name: 'MySocial' } }
  );

  const rows = await fetchWalletTokenBalances({ network: 'localnet', owner: OWNER });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].amountBaseUnits, BigInt('1000000000'));
});

test('missing metadata falls back to the coin ticker without hiding the balance', async () => {
  mockBalances([{ repr: MYUSD, total: '500000' }], {});

  const rows = await fetchWalletTokenBalances({ network: 'localnet', owner: OWNER });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].symbol, 'MYUSD');
  assert.equal(rows[0].name, null);
});

test('formatBaseUnits honors the coin decimals', () => {
  assert.equal(formatBaseUnits(BigInt('4000000000'), 9), '4');
  assert.equal(formatBaseUnits(BigInt('1977298454933'), 9), '1977.2984');
  assert.equal(formatBaseUnits(BigInt('772849882'), 6), '772.8498');
  assert.equal(formatBaseUnits(BigInt('32000'), 8), '0.0003');
  assert.equal(formatBaseUnits(BigInt('0'), 9), '0');
});

test('subject lookups alias every held profile and post in one document', () => {
  const query = buildSptHoldingSubjectsQuery([`0x${'a'.repeat(64)}`], [`0x${'b'.repeat(64)}`]);

  assert.match(query, new RegExp(`query ${SPT_HOLDING_SUBJECTS_QUERY_NAME}\\(`));
  assert.match(query, /\$p0: MySoAddress!/);
  assert.match(query, /\$t0: ID!/);
  assert.match(query, /p0: profile\(address: \$p0\)/);
  assert.match(query, /t0: post\(id: \$t0\)/);
  assert.equal(buildSptHoldingSubjectsQuery([], []), `query ${SPT_HOLDING_SUBJECTS_QUERY_NAME} {\n\n}`);
});
