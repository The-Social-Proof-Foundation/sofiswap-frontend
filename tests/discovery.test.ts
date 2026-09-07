import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { bcs } from '@socialproof/myso/bcs';
import { clearSptChainConfigCache } from '../lib/spt/chain-config';
import { fetchSocialProofTokenPage } from '../lib/graphql/social-proof-token-page';
import { fetchPostSptPage } from '../lib/graphql/post-spt-page';
import { refreshOrderbookMarkets } from '../lib/graphql/orderbook-markets';
import { orderbookCoinsForSdkNetwork, orderbookPoolsForSdkNetwork } from '../lib/orderbook/sdk-surface';
import { mapSocialProofTokenPageToWorkspace } from '../lib/social-proof-token-map-workspace';

const id = (n: number) => `0x${n.toString(16).padStart(64, '0')}`;
afterEach(() => { mock.restoreAll(); clearSptChainConfigCache(); });

test('profile and post pool discovery follows the subject registry after launch and reads the viewer ledger directly', async () => {
  let live = false;
  const viewer = id(99);
  const requests: Array<{ query: string; variables: Record<string, unknown> }> = [];
  mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body));
    requests.push(request);
    const q: string = request.query;
    const v = request.variables;
    let data: unknown;
    if (q.includes('SofiSwapSptChainConfig')) {
      data = Object.fromEntries(['tokenRegistry', 'sptConfig', 'ecosystemTreasury', 'usernameRegistry', 'blockListRegistry', 'platformRegistry'].map((name, i) => [name, { nodes: [{ address: id(i + 1) }] }]));
    } else if (q.includes('SofiSwapSptObject')) {
      let json: unknown;
      if (v.id === id(1)) json = { tokens: { id: id(30) } };
      else if (v.id === id(2)) json = { trading_creator_fee_bps: '100', trading_platform_fee_bps: '100', trading_treasury_fee_bps: '100', reservation_creator_fee_bps: '100', reservation_platform_fee_bps: '100', reservation_treasury_fee_bps: '100', base_price: '2000000000', quadratic_coefficient: '500', max_hold_percent_bps: '5000', profile_threshold: '100000000000', post_threshold: '10000000000', max_individual_reservation_bps: '1000', trading_enabled: true };
      else if (v.id === id(10)) json = { info: { associated_id: id(50), owner: id(60), token_type: 1, total_reserved: '7000000000', required_threshold: '100000000000' }, reservations: { id: id(31) }, converted: false, myso_balance: '7000000000' };
      else if (v.id === id(20)) json = { info: { associated_id: id(50), owner: id(60), token_type: 1, circulating_supply: '100000000000', base_price: '1000000000', quadratic_coefficient: '100' }, holders: { id: id(32) }, myso_balance: '90000000000' };
      else throw new Error(`Unexpected object ${v.id}`);
      data = { object: { asMoveObject: { contents: { json } } } };
    } else if (q.includes('SofiSwapSptTableValue')) {
      const key = bcs.Address.parse(Buffer.from(v.name.bcs, 'base64'));
      const json = v.table === id(30) ? live ? { id: id(20) } : null : v.table === id(31) ? '7000000000' : '5000000000';
      assert.equal(key, v.table === id(30) ? id(50) : viewer);
      data = { address: { dynamicField: json == null ? null : { value: { json } } } };
    } else if (q.includes('SocialProofTokenPage')) {
      data = {
        profile: { profileId: id(50), address: id(60), displayName: 'Creator', reservationPoolAddress: id(10), socialProofToken: { tokenType: 1, reservationPoolId: id(10), poolId: null, reservationHolders: [], formerReservationHolders: [] } },
        sptPool: v.includePool ? { poolId: id(20), holders: [], transactions: [], priceHistory: [], reservationHolders: [], formerReservationHolders: [] } : null,
        sptConfiguration: null,
      };
    } else if (q.includes('SofiSwapResolvePostSpt')) {
      data = { post: { postId: id(50), owner: id(60), content: 'Post', enableSpt: true, sptId: id(10) } };
    } else if (q.includes('SofiSwapPostSptDetail')) {
      assert.equal(v.poolId, id(20));
      data = { sptPool: { poolId: id(20), reservationHolders: [] } };
    } else throw new Error('Unexpected network request');
    return Response.json({ data });
  });
  const input = { network: 'localnet' as const, profileAddress: id(60), viewer };
  const reserved = await fetchSocialProofTokenPage(input);
  assert.equal(reserved.chainState?.viewerReservation, BigInt(7000000000));
  assert.equal(mapSocialProofTokenPageToWorkspace(reserved).reservationBalances[0].amount, BigInt(7000000000));
  live = true;
  const launched = await fetchSocialProofTokenPage({ ...input, poolId: id(1234) });
  assert.equal(launched.chainState?.poolId, id(20));
  const mapped = mapSocialProofTokenPageToWorkspace(launched);
  assert.equal(mapped.hasLiveTradingPool, true);
  assert.equal(mapped.basePriceBaseUnits, BigInt(1000000000), 'existing pool terms must not use the changed global base price');
  assert.equal(mapped.reservationBalances[0].amount, BigInt(0));
  assert.equal(mapped.maxIndividualReservationBaseUnits, BigInt(10000000000));
  const post = await fetchPostSptPage({ network: 'localnet', postId: id(50), viewer });
  assert.equal(post.livePool?.poolId, id(20));
  assert.ok(requests.filter((r) => r.query.includes('SofiSwapResolvePostSpt')).every((r) => !r.query.includes('sptPools(')), 'post discovery must not depend on a paginated list of pool holders');
});

test('native market discovery paginates and installs fresh pool IDs and decimals in the SDK surface', async () => {
  const myso = '0x2::myso::MYSO';
  const usd = '0x1234::myusd::MYUSD';
  const token = '0x9999::token::TOKEN';
  mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
    const { query, variables } = JSON.parse(String(init?.body));
    if (query.includes('SofiSwapOrderbookMarkets')) {
      const second = variables.after === 'page-2';
      return Response.json({ data: { objects: { nodes: [{ address: second ? id(202) : id(201), asMoveObject: { contents: { type: { repr: `0xb0c::pool::Pool<${second ? token : myso}, ${usd}>` } } } }], pageInfo: { endCursor: second ? null : 'page-2', hasNextPage: !second } } } });
    }
    assert.match(query, /SofiSwapOrderbookCoinMetadata/);
    return Response.json({ data: { coinMetadata: { symbol: variables.type === myso ? 'MYSO' : variables.type === usd ? 'MYUSD' : 'TOKEN', decimals: variables.type === myso ? 9 : 6 } } });
  });
  await refreshOrderbookMarkets('localnet');
  const pools = orderbookPoolsForSdkNetwork('localnet');
  assert.equal(pools.MYSO_MYUSD.address, id(201));
  assert.equal(pools.TOKEN_MYUSD.address, id(202));
  assert.equal(orderbookCoinsForSdkNetwork('localnet').MYUSD.type, usd);
  assert.equal(orderbookCoinsForSdkNetwork('localnet').MYUSD.scalar, 1000000);
});
