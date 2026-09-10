import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';

import {
  buildPoolOrderBookUrl,
  fetchPoolOrderBook,
} from '../lib/orderbook-indexer/orderbook';
import {
  applyLivePriceToCandles,
  fetchPoolOhlcv,
  indexerTupleToCandlestick,
} from '../lib/orderbook-indexer/ohlcv';
import { discoveredMarketsFromIndexerPools } from '../lib/orderbook-indexer/pools';
import {
  buildOrderbookSummaryUrl,
  fetchOrderbookMarketSummaries,
  formatTickerPrice,
  marketDisplayPrice,
  mergeOrderbookMarketSummaries,
  parseOrderbookSummaryPayload,
} from '../lib/orderbook-indexer/ticker';
import {
  indexerTradeRowToPrint,
  indexerTradeRowToUserHistory,
} from '../lib/orderbook-indexer/trades';
import { buildAccountOrdersUrl, fetchAccountOpenOrders } from '../lib/orderbook-indexer/orders';
import { spotlightItemsFromIndexerPools } from '../lib/trade/indexer-pools-spotlight';
import { getOrderbookStatusUrl } from '../lib/orderbook-status';

afterEach(() => {
  mock.restoreAll();
  delete process.env.NEXT_PUBLIC_ORDERBOOK_INDEXER_LOCALNET_URL;
  delete process.env.NEXT_PUBLIC_ORDERBOOK_INDEXER_URL;
  delete process.env.NEXT_PUBLIC_ORDERBOOK_STATUS_URL_LOCALNET;
});

test('orderbook REST client accepts the live tuple/string response and derives mid price', async () => {
  process.env.NEXT_PUBLIC_ORDERBOOK_INDEXER_LOCALNET_URL = 'http://127.0.0.1:9008';
  let requestedUrl = '';
  mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    requestedUrl = String(input);
    return Response.json({
      asks: [['0.006', '4'], ['0.005', '2']],
      bids: [['0.004', '2'], ['0.003', '4']],
      timestamp: '1788807803819',
    });
  });

  const result = await fetchPoolOrderBook({
    network: 'localnet',
    poolName: 'MYSO_MYUSD',
    levelsPerSide: 40,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(requestedUrl, /orderbook\/MYSO_MYUSD\?depth=80&level=2$/);
  assert.deepEqual(result.data.asks, [
    { price: 0.006, size: 4 },
    { price: 0.005, size: 2 },
  ]);
  assert.deepEqual(result.data.bids, [
    { price: 0.004, size: 2 },
    { price: 0.003, size: 4 },
  ]);
  assert.equal(result.data.midPrice, 0.0045000000000000005);
});

test('orderbook URL preserves an indexer path prefix', () => {
  assert.equal(
    buildPoolOrderBookUrl('https://example.test/api/orderbook', 'BTC_MYUSD', 10),
    'https://example.test/api/orderbook/orderbook/BTC_MYUSD?depth=20&level=2'
  );
});

test('OHLCV converts server milliseconds to lightweight-charts Unix seconds', () => {
  assert.deepEqual(indexerTupleToCandlestick([1_788_807_803_000, 1, 2, 0.5, 1.5, 10]), {
    time: 1_788_807_803,
    open: 1,
    high: 2,
    low: 0.5,
    close: 1.5,
  });
});

test('OHLCV accepts string tuples and seeds a live candle when the indexer has no fills', async () => {
  process.env.NEXT_PUBLIC_ORDERBOOK_INDEXER_LOCALNET_URL = 'http://127.0.0.1:9008';
  mock.method(globalThis, 'fetch', async () =>
    Response.json({
      candles: [['1788807803000', '1', '2', '0.5', '1.5', '10']],
    })
  );

  const result = await fetchPoolOhlcv({
    network: 'localnet',
    poolName: 'ETH_MYUSD',
    interval: '1h',
    limit: 50,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.data, [
    { time: 1_788_807_803, open: 1, high: 2, low: 0.5, close: 1.5 },
  ]);

  const seeded = applyLivePriceToCandles([], 2493.8, '1h', 1_788_807_803_000);
  assert.equal(seeded.length, 2);
  assert.equal(seeded[1]?.close, 2493.8);
  assert.equal(seeded[1]?.time, 1_788_807_600);
  assert.equal(seeded[0]?.time, 1_788_804_000);

  const withBook = applyLivePriceToCandles(
    [],
    { price: 0.0045, bid: 0.004, ask: 0.005 },
    '1h',
    1_788_807_803_000
  );
  assert.equal(withBook[1]?.high, 0.005);
  assert.equal(withBook[1]?.low, 0.004);
  assert.ok(Math.abs((withBook[1]?.close ?? 0) - 0.0045) < 1e-12);
});

test('market summary uses last trade or bid/ask mid and lists every indexer pool', () => {
  assert.equal(
    buildOrderbookSummaryUrl('http://127.0.0.1:9008', ['MYSO_MYUSD', 'BTC_MYUSD']),
    'http://127.0.0.1:9008/summary?pool_names=MYSO_MYUSD%2CBTC_MYUSD'
  );
  const rows = parseOrderbookSummaryPayload([
    {
      trading_pairs: 'MYSO_MYUSD',
      base_currency: 'MYSO',
      quote_currency: 'MYUSD',
      last_price: 0,
      highest_bid: 0.004,
      lowest_ask: 0.005,
      price_change_percent_24h: 0,
      quote_volume: 0,
    },
    {
      trading_pairs: 'ETH_MYUSD',
      base_currency: 'ETH',
      last_price: '2493.8',
      highest_bid: '2492',
      lowest_ask: '2495',
    },
  ]);
  assert.ok(Math.abs(marketDisplayPrice(rows[0]!)! - 0.0045) < 1e-12);
  assert.equal(marketDisplayPrice(rows[1]!), 2493.8);
  assert.equal(formatTickerPrice(2493.8), '2,493.8');

  const spotlight = spotlightItemsFromIndexerPools('localnet', [
    {
      pool_id: '0xbtc',
      pool_name: 'BTC_MYUSD',
      base_asset_symbol: 'BTC',
      quote_asset_symbol: 'MYUSD',
    },
    {
      pool_id: '0xeth',
      pool_name: 'ETH_MYUSD',
      base_asset_symbol: 'ETH',
      quote_asset_symbol: 'MYUSD',
    },
    {
      pool_id: '0xmyso',
      pool_name: 'MYSO_MYUSD',
      base_asset_symbol: 'MYSO',
      quote_asset_symbol: 'MYUSD',
    },
  ]);
  assert.deepEqual(
    spotlight.map((item) => item.id),
    ['MYSO_MYUSD', 'BTC_MYUSD', 'ETH_MYUSD']
  );

  const markets = discoveredMarketsFromIndexerPools([
    {
      pool_id: '0xbtc',
      pool_name: 'BTC_MYUSD',
      base_asset_id: '0xabc::btc::BTC',
      base_asset_decimals: 8,
      base_asset_symbol: 'BTC',
      quote_asset_id: '0xdef::myusd::MYUSD',
      quote_asset_decimals: 6,
      quote_asset_symbol: 'MYUSD',
    },
  ]);
  assert.equal(markets.pools.BTC_MYUSD?.address, '0xbtc');
  assert.equal(markets.coins.BTC?.scalar, 100_000_000);
});

test('ticker keeps every catalog pool and fills missing prices from live depth', async () => {
  process.env.NEXT_PUBLIC_ORDERBOOK_INDEXER_LOCALNET_URL = 'http://127.0.0.1:9008';
  const pools = [
    {
      pool_id: '0xmyso',
      pool_name: 'MYSO_MYUSD',
      base_asset_symbol: 'MYSO',
      quote_asset_symbol: 'MYUSD',
    },
    {
      pool_id: '0xbtc',
      pool_name: 'BTC_MYUSD',
      base_asset_symbol: 'BTC',
      quote_asset_symbol: 'MYUSD',
    },
    {
      pool_id: '0xeth',
      pool_name: 'ETH_MYUSD',
      base_asset_symbol: 'ETH',
      quote_asset_symbol: 'MYUSD',
    },
  ];

  const merged = mergeOrderbookMarketSummaries(pools, [
    { trading_pairs: 'MYSO_MYUSD', last_price: 0.0045 },
  ]);
  assert.deepEqual(
    merged.map((market) => market.trading_pairs),
    ['MYSO_MYUSD', 'BTC_MYUSD', 'ETH_MYUSD']
  );

  mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith('/summary')) {
      return Response.json([{ trading_pairs: 'MYSO_MYUSD', last_price: 0.0045 }]);
    }
    if (url.endsWith('/get_pools')) return Response.json(pools);
    if (url.includes('/orderbook/BTC_MYUSD')) {
      return Response.json({ bids: [['96950', '0.4']], asks: [['97050', '0.2']] });
    }
    if (url.includes('/orderbook/ETH_MYUSD')) {
      return Response.json({ bids: [['2492', '2']], asks: [['2495', '1']] });
    }
    throw new Error(`Unexpected URL: ${url}`);
  });

  const result = await fetchOrderbookMarketSummaries({ network: 'localnet' });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.data.map((market) => market.trading_pairs),
    ['MYSO_MYUSD', 'BTC_MYUSD', 'ETH_MYUSD']
  );
  assert.equal(marketDisplayPrice(result.data[0]!), 0.0045);
  assert.equal(marketDisplayPrice(result.data[1]!), 97000);
  assert.equal(marketDisplayPrice(result.data[2]!), 2493.5);
});

test('trade mappers accept the live server base_volume, type, and millisecond timestamp fields', () => {
  const serverRow = {
    trade_id: '7',
    price: 2.5,
    base_volume: 4,
    quote_volume: 10,
    type: 'sell',
    timestamp: 1_788_807_803_000,
    maker_balance_manager_id: 'manager',
    taker_balance_manager_id: 'other',
    maker_fee: 0.01,
  };

  assert.deepEqual(indexerTradeRowToPrint(serverRow), {
    price: 2.5,
    size: 4,
    side: 'sell',
  });
  const userRow = indexerTradeRowToUserHistory(serverRow, 'BTC_MYUSD', 'manager');
  assert.ok(userRow);
  assert.equal(userRow.role, 'Maker');
  assert.equal(userRow.side, 'buy');
  assert.equal(userRow.feeType, 'MYUSD');
  assert.equal(userRow.baseVolume, '4');
  assert.equal(userRow.quoteVolume, '10');
  assert.notEqual(userRow.time, '—');
});

test('open orders use the indexed orders contract and keep only live statuses', async () => {
  process.env.NEXT_PUBLIC_ORDERBOOK_INDEXER_LOCALNET_URL = 'http://127.0.0.1:9008';
  let requestedUrl = '';
  mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    requestedUrl = String(input);
    return Response.json([
      {
        order_id: '99',
        type: 'buy',
        current_status: 'partially_filled',
        price: 0.004,
        original_quantity: 10,
        filled_quantity: 2,
        remaining_quantity: 8,
      },
    ]);
  });

  const result = await fetchAccountOpenOrders({
    network: 'localnet',
    poolName: 'MYSO_MYUSD',
    balanceManagerId: '0xmanager',
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(
    requestedUrl,
    buildAccountOrdersUrl('http://127.0.0.1:9008', 'MYSO_MYUSD', '0xmanager')
  );
  assert.match(requestedUrl, /status=placed%2Cpartially_filled/);
  assert.deepEqual(result.data, [
    {
      id: '99',
      market: 'MySo-MyUSD',
      side: 'buy',
      price: '0.004',
      quantity: '10',
      filled: '2',
    },
  ]);
});

test('orderbook status URL is resolved for localnet from the local indexer', () => {
  assert.equal(getOrderbookStatusUrl('localnet'), null);
  process.env.NEXT_PUBLIC_ORDERBOOK_INDEXER_LOCALNET_URL = 'http://127.0.0.1:9008/';
  assert.equal(getOrderbookStatusUrl('localnet'), 'http://127.0.0.1:9008/status');
  assert.equal(getOrderbookStatusUrl('testnet'), 'https://orderbook.testnet.mysocial.network/status');
});
