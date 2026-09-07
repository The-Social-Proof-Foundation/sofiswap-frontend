import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_U64, SPT_SCALE, baseUnitsToDisplay, calculateMaxSptBuyAmount,
  calculateSptBuyCost, calculateSptSellRefund, feeFromBps,
  parseDisplayAmountToBaseUnits, scalarToBigInt,
} from '../lib/spt/amounts';
import { resolveSptSidePanelMode } from '../lib/spt-reservation-ui-policy';
import { poolCoinTypes } from '../lib/graphql/orderbook-markets';

test('decimal inputs preserve all 9 places and never round or reinterpret invalid amounts', () => {
  assert.equal(parseDisplayAmountToBaseUnits('0.000000001'), BigInt(1));
  assert.equal(parseDisplayAmountToBaseUnits('.5'), SPT_SCALE / BigInt(2));
  assert.equal(parseDisplayAmountToBaseUnits('1000000.123456789'), BigInt('1000000123456789'));
  for (const value of ['', '.', '-1', '1e9', '1,000', '1..2', '0.0000000001', '18446744073.709551616']) {
    assert.equal(parseDisplayAmountToBaseUnits(value), null, value);
  }
  assert.equal(parseDisplayAmountToBaseUnits(baseUnitsToDisplay(MAX_U64, 9)), MAX_U64);
  assert.equal(scalarToBigInt(Number.MAX_SAFE_INTEGER + 1), null);
  assert.equal(baseUnitsToDisplay(BigInt(1), 9), '0.000000001');
});

test('curve prices use nano-SPT and nano-MYSO, including small fractions', () => {
  const curve = { basePrice: SPT_SCALE, quadraticCoefficient: BigInt(30000), currentSupply: SPT_SCALE };
  assert.equal(calculateSptBuyCost({ ...curve, tokenAmount: SPT_SCALE }), SPT_SCALE + BigInt(7));
  assert.equal(calculateSptSellRefund({ ...curve, currentSupply: SPT_SCALE * BigInt(2), tokenAmount: SPT_SCALE }), SPT_SCALE + BigInt(7));
  assert.equal(calculateSptBuyCost({ ...curve, tokenAmount: BigInt(1) }), BigInt(1));
  assert.equal(calculateSptSellRefund({ ...curve, tokenAmount: SPT_SCALE * BigInt(2) }), BigInt(0));
  assert.equal(feeFromBps(BigInt(999), BigInt(100)), BigInt(9));
});

test('budget inversion returns the greatest affordable amount across boundaries', () => {
  const curve = { basePrice: BigInt(10000000), quadraticCoefficient: BigInt(5000), currentSupply: BigInt('100000000000') };
  for (const mysoBudget of [BigInt(1), BigInt(10), SPT_SCALE, SPT_SCALE * BigInt(1000000)]) {
    const quote = calculateMaxSptBuyAmount({ ...curve, mysoBudget });
    assert.ok(quote.cost <= mysoBudget);
    assert.equal(quote.cost, calculateSptBuyCost({ ...curve, tokenAmount: quote.tokenAmount }));
    assert.ok(calculateSptBuyCost({ ...curve, tokenAmount: quote.tokenAmount + BigInt(1) }) > mysoBudget);
  }
  assert.equal(calculateMaxSptBuyAmount({ basePrice: BigInt(1), quadraticCoefficient: BigInt(0), currentSupply: BigInt(0), mysoBudget: MAX_U64 }).tokenAmount, MAX_U64);
  assert.equal(calculateMaxSptBuyAmount({ ...curve, currentSupply: MAX_U64, mysoBudget: SPT_SCALE }).tokenAmount, BigInt(0));
  assert.equal(calculateMaxSptBuyAmount({ ...curve, basePrice: BigInt(0), mysoBudget: SPT_SCALE }).tokenAmount, BigInt(0));
});

test('reservation lifecycle does not confuse threshold reached with launch', () => {
  const state = { hasSptPool: false, reservationPoolId: '0x1', reservationPoolAddress: null, reservationStatus: 'threshold_met' };
  assert.equal(resolveSptSidePanelMode(state), 'simple');
  assert.equal(resolveSptSidePanelMode({ ...state, reservationStatus: 'converted' }), 'none');
  assert.equal(resolveSptSidePanelMode({ ...state, hasSptPool: true }), 'full');
});

test('pool type parsing respects nested generics', () => {
  assert.deepEqual(poolCoinTypes('0xb0c::pool::Pool<0x2::myso::MYSO, 0x3::token::Coin<0x4::x::X>>'), ['0x2::myso::MYSO', '0x3::token::Coin<0x4::x::X>']);
  assert.equal(poolCoinTypes('0x2::myso::MYSO'), null);
});
