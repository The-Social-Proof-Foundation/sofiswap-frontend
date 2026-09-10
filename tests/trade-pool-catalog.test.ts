import assert from 'node:assert/strict';
import { test } from 'node:test';
import { poolTickerForKey, spotAssetSymbolDisplay } from '../lib/trade/trade-pool-catalog';

test('spotAssetSymbolDisplay does not throw on missing symbols', () => {
  assert.equal(spotAssetSymbolDisplay(undefined), '—');
  assert.equal(spotAssetSymbolDisplay(null), '—');
  assert.equal(spotAssetSymbolDisplay(''), '—');
  assert.equal(spotAssetSymbolDisplay('   '), '—');
  assert.equal(spotAssetSymbolDisplay('—'), '—');
  assert.equal(spotAssetSymbolDisplay('MYSO'), 'MySo');
  assert.equal(spotAssetSymbolDisplay('myusd'), 'MyUSD');
  assert.equal(spotAssetSymbolDisplay('USDC'), 'USDC');
});

test('poolTickerForKey splits the key when coin fields are missing', () => {
  const unknown = poolTickerForKey('localnet', 'FOO_BAR');
  assert.equal(unknown.base, 'FOO');
  assert.equal(unknown.quote, 'BAR');
  const empty = poolTickerForKey('localnet', '');
  assert.equal(empty.base, '—');
  assert.equal(empty.quote, '—');
});
