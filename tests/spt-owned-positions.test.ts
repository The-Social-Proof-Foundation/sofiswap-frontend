import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import {
  fetchOwnedSptPositions,
  listOwnedSocialTokenHoldings,
  mergeOwnedSpotlightItems,
  sptOwnedPositionSpotlightItems,
  sptOwnedSubjectKeys,
  sptSubjectKey,
  findPositionForSubject,
} from '../lib/spt/owned-positions';
import { calculateSptSellRefund } from '../lib/spt/amounts';

const PACKAGE_ID = `0x${'a'.repeat(64)}`;
const SOCIAL_TOKEN_TYPE = `${PACKAGE_ID}::social_proof_tokens::SocialToken`;
const id = (n: number) => `0x${n.toString(16).padStart(64, '0')}`;

type RpcCall = { method: string; params: unknown[] };

function socialTokenObject(objectId: string, poolId: string, amount: string, tokenType: number) {
  return {
    data: {
      objectId,
      version: '1',
      digest: 'digest',
      type: SOCIAL_TOKEN_TYPE,
      content: {
        dataType: 'moveObject',
        type: SOCIAL_TOKEN_TYPE,
        fields: { amount, id: { id: objectId }, pool_id: poolId, token_type: tokenType },
      },
    },
  };
}

function poolMoveJson(changes: Record<string, unknown>) {
  return {
    info: {
      id: id(200),
      token_type: 1,
      owner: id(1),
      associated_id: id(50),
      circulating_supply: null,
      base_price: '1000000000',
      quadratic_coefficient: '100000',
      ...changes,
    },
    myso_balance: '0',
    converted: false,
  };
}

/**
 * A single mocked transport: JSON-RPC for owned objects, GraphQL for pool/profile/post reads.
 * Every GraphQL query is recorded so tests can prove which data sources are used.
 */
function mockTransport(options: {
  pages: Array<{ data: unknown[]; hasNextPage?: boolean; nextCursor?: string | null }>;
  objects?: Record<string, Record<string, unknown>>;
  subjects?: Record<string, unknown>;
  onQuery?: (query: string, variables: Record<string, unknown>) => void;
}) {
  const rpcCalls: RpcCall[] = [];
  let pageIndex = 0;
  mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    if (typeof body.method === 'string') {
      rpcCalls.push({ method: body.method, params: body.params ?? [] });
      if (body.method === 'mysox_getOwnedObjects') {
        const page = options.pages[Math.min(pageIndex, options.pages.length - 1)];
        pageIndex += 1;
        return Response.json({
          jsonrpc: '2.0',
          id: body.id,
          result: { data: page.data, hasNextPage: page.hasNextPage ?? false, nextCursor: page.nextCursor ?? null },
        });
      }
      throw new Error(`Unexpected JSON-RPC method ${body.method}`);
    }
    const query = String(body.query);
    options.onQuery?.(query, body.variables ?? {});
    if (query.includes('SofiSwapSptObject')) {
      const objectId = String(body.variables?.id);
      const json = options.objects?.[objectId];
      return Response.json({ data: { object: json ? { asMoveObject: { contents: { json } } } : null } });
    }
    if (query.includes('SofiSwapSptHoldingSubjects')) return Response.json({ data: options.subjects ?? {} });
    throw new Error(`Unexpected GraphQL query: ${query.slice(0, 60)}`);
  });
  return { rpcCalls, pageOf: () => pageIndex };
}

afterEach(() => mock.restoreAll());

test('owned tokens come from the chain and collapse per pool', async () => {
  const poolA = id(10);
  const poolB = id(11);
  const transport = mockTransport({
    pages: [{
      data: [
        socialTokenObject(id(100), poolA, '1000000000', 1),
        socialTokenObject(id(101), poolA, '2500000000', 1),
        socialTokenObject(id(102), poolB, '500000000', 2),
      ],
    }],
  });

  const holdings = await listOwnedSocialTokenHoldings({ network: 'localnet', owner: id(1), packageId: PACKAGE_ID });

  assert.equal(holdings.length, 2);
  const [first] = holdings;
  assert.equal(first.poolId, poolA);
  assert.equal(first.amount, BigInt(3500000000));
  assert.deepEqual([...first.tokenObjectIds].sort(), [id(100), id(101)].sort());
  assert.equal(holdings[1].amount, BigInt(500000000));
  assert.equal(transport.rpcCalls.length, 1);
  assert.deepEqual((transport.rpcCalls[0].params[1] as { filter: unknown }).filter, { StructType: SOCIAL_TOKEN_TYPE });
  // Fullnodes reject an owned-objects page above their cap, so never ask for the SDK default of 100.
  assert.equal(transport.rpcCalls[0].params[3], 50);
});

test('a fullnode with a smaller owned-objects cap is honored instead of failing the read', async () => {
  const limits: unknown[] = [];
  let call = 0;
  mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    limits.push(body.params[3]);
    call += 1;
    if (call === 1) {
      return Response.json({
        jsonrpc: '2.0',
        id: body.id,
        error: { code: -32602, message: 'Page size limit 50 exceeds max limit 20' },
      });
    }
    return Response.json({
      jsonrpc: '2.0',
      id: body.id,
      result: { data: [socialTokenObject(id(100), id(10), '1', 1)], hasNextPage: false, nextCursor: null },
    });
  });

  const holdings = await listOwnedSocialTokenHoldings({ network: 'localnet', owner: id(1), packageId: PACKAGE_ID });

  assert.deepEqual(limits, [50, 20]);
  assert.equal(holdings.length, 1);
  assert.equal(holdings[0].amount, BigInt(1));
});

test('owned token pagination follows the cursor', async () => {
  const poolA = id(10);
  const transport = mockTransport({
    pages: [
      { data: [socialTokenObject(id(100), poolA, '1', 1)], hasNextPage: true, nextCursor: 'cursor-1' },
      { data: [socialTokenObject(id(101), poolA, '2', 1)] },
    ],
  });

  const holdings = await listOwnedSocialTokenHoldings({ network: 'localnet', owner: id(1), packageId: PACKAGE_ID });

  assert.equal(transport.rpcCalls.length, 2);
  assert.equal(transport.rpcCalls[0].params[2], null);
  assert.equal(transport.rpcCalls[1].params[2], 'cursor-1');
  assert.equal(holdings[0].amount, BigInt(3));
});

test('a held profile token resolves its subject, curve value, and trade route', async () => {
  const poolId = id(10);
  const profileObjectId = id(50);
  const wallet = id(7);
  const supply = '5000000000';
  const basePrice = '1000000000';
  const coefficient = '100000';

  mockTransport({
    pages: [{ data: [socialTokenObject(id(100), poolId, '2000000000', 1)] }],
    objects: {
      [poolId]: poolMoveJson({
        associated_id: profileObjectId,
        token_type: 1,
        owner: wallet,
        circulating_supply: supply,
        base_price: basePrice,
        quadratic_coefficient: coefficient,
      }),
      [profileObjectId]: { owner: wallet },
    },
    subjects: {
      p0: { address: wallet, username: 'brandin', displayName: 'Brandon Shaw', profilePhoto: '//cdn.example/me.jpg' },
    },
  });

  const positions = await fetchOwnedSptPositions({ network: 'localnet', owner: wallet, packageId: PACKAGE_ID });

  assert.equal(positions.length, 1);
  const [position] = positions;
  assert.equal(position.tokenType, 1);
  assert.equal(position.live, true);
  assert.equal(position.profileAddress, wallet);
  assert.equal(position.postId, null);
  assert.equal(position.href, `/trade/spt/${wallet}`);
  assert.equal(position.title, 'Brandon Shaw');
  assert.equal(position.detail, '@brandin');
  assert.equal(position.symbol, 'BRANDI');
  assert.equal(position.thumbUrl, 'https://cdn.example/me.jpg');
  assert.equal(position.amountDisplay, '2');
  assert.equal(position.avatarShape, 'circle');
  assert.equal(
    position.redeemableMysoBaseUnits,
    calculateSptSellRefund({
      basePrice: BigInt(basePrice),
      quadraticCoefficient: BigInt(coefficient),
      currentSupply: BigInt(supply),
      tokenAmount: BigInt('2000000000'),
    })
  );
  assert.ok(position.redeemableMysoBaseUnits > BigInt(0));
});

test('a held post token routes to its post page and keeps post media', async () => {
  const poolId = id(11);
  const postId = id(60);
  const wallet = id(8);

  mockTransport({
    pages: [{ data: [socialTokenObject(id(102), poolId, '4000000000', 2)] }],
    objects: {
      [poolId]: poolMoveJson({
        associated_id: postId,
        token_type: 2,
        owner: wallet,
        circulating_supply: '10000000000',
      }),
    },
    subjects: {
      t0: {
        postId,
        content: 'A long post about social tokens that should be shortened in the row title',
        mediaUrls: ['https://cdn.example/post.jpg'],
        owner: wallet,
        ownerProfile: { address: wallet, username: 'poster', displayName: null, profilePhoto: 'https://cdn.example/owner.jpg' },
      },
    },
  });

  const positions = await fetchOwnedSptPositions({ network: 'localnet', owner: wallet, packageId: PACKAGE_ID });

  assert.equal(positions.length, 1);
  const [position] = positions;
  assert.equal(position.tokenType, 2);
  assert.equal(position.postId, postId);
  assert.equal(position.profileAddress, null);
  assert.equal(position.href, `/trade/spt/post/${postId}`);
  assert.equal(position.avatarShape, 'square');
  assert.equal(position.thumbUrl, 'https://cdn.example/post.jpg');
  assert.equal(position.symbol, 'POSTER');
  assert.match(position.title, /\.\.\.$|…$/);
  assert.ok(position.title.length <= 58);
});

test('unlaunched reservations stay listed with no curve value', async () => {
  const poolId = id(12);
  const profileObjectId = id(51);
  const wallet = id(9);

  mockTransport({
    pages: [{ data: [socialTokenObject(id(103), poolId, '1000000000', 1)] }],
    objects: {
      [poolId]: poolMoveJson({ associated_id: profileObjectId, circulating_supply: null, owner: wallet }),
      [profileObjectId]: { owner: wallet },
    },
    subjects: {},
  });

  const positions = await fetchOwnedSptPositions({ network: 'localnet', owner: wallet, packageId: PACKAGE_ID });

  assert.equal(positions.length, 1);
  assert.equal(positions[0].live, false);
  assert.equal(positions[0].redeemableMysoBaseUnits, BigInt(0));
  assert.equal(positions[0].redeemableMysoDisplay, '0');
  assert.equal(positions[0].href, `/trade/spt/${wallet}`);
  assert.equal(positions[0].title, wallet.length > 20 ? `${wallet.slice(0, 10)}…${wallet.slice(-6)}` : wallet);
});

test('holdings never depend on the indexer sptHoldings list', async () => {
  const poolId = id(13);
  const profileObjectId = id(52);
  const wallet = id(10);
  const queries: string[] = [];

  mockTransport({
    pages: [{ data: [socialTokenObject(id(104), poolId, '1000000000', 1)] }],
    objects: {
      [poolId]: poolMoveJson({ associated_id: profileObjectId, circulating_supply: '1000000000', owner: wallet }),
      [profileObjectId]: { owner: wallet },
    },
    subjects: {},
    onQuery: (query) => queries.push(query),
  });

  const positions = await fetchOwnedSptPositions({ network: 'localnet', owner: wallet, packageId: PACKAGE_ID });

  assert.equal(positions.length, 1);
  assert.ok(queries.length > 0);
  assert.deepEqual(queries.filter((query) => query.includes('sptHoldings')), []);
});

test('a wallet with no SPT objects never touches the chain graph', async () => {
  const transport = mockTransport({ pages: [{ data: [] }] });
  const positions = await fetchOwnedSptPositions({ network: 'localnet', owner: id(1), packageId: PACKAGE_ID });
  assert.deepEqual(positions, []);
  assert.equal(transport.rpcCalls.length, 1);
});

test('owned spotlight rows lead the catalog and never duplicate a token', () => {
  const position = {
    poolId: id(10), tokenType: 1 as const, subjectId: id(50), amountBaseUnits: BigInt(4), amountDisplay: '4',
    tokenObjectIds: [id(100)], live: true, currentSupplyBaseUnits: BigInt(1), basePriceBaseUnits: BigInt(1),
    quadraticCoefficient: BigInt(0), redeemableMysoBaseUnits: BigInt(1), redeemableMysoDisplay: '0', pricePerTokenMysoBaseUnits: BigInt(0),
    creatorAddress: id(7), profileAddress: id(7), postId: null, title: 'Brandon Shaw', detail: '@brandin',
    symbol: 'BRANDI', href: `/trade/spt/${id(7)}`, thumbUrl: null, avatarShape: 'circle' as const,
  };
  const owned = sptOwnedPositionSpotlightItems([position]);
  const nativePool = { id: 'MYSO_MYUSD', name: 'MySo / MyUSD', url: '/trade', tags: ['pool', 'MYSO'] };
  const sameToken = { id: `spt:profile:${id(7)}`, name: 'Brandon Shaw · Profile SPT', url: `/trade/spt/${id(7)}`, tags: ['spt', 'profile'] };

  const merged = mergeOwnedSpotlightItems(owned, [nativePool, sameToken]);

  assert.equal(merged.length, 2);
  assert.equal(merged[0].id, `owned:${id(10)}`);
  assert.match(merged[0].name, /4 held/);
  assert.equal(merged[1].id, 'MYSO_MYUSD');
  assert.ok(merged[0].tags?.includes('held'));
  assert.ok(merged[0].tags?.includes('my tokens'));
  assert.ok(merged[0].tags?.includes('profile'));
  assert.equal(merged.filter((item) => item.url === `/trade/spt/${id(7)}`).length, 1);
});

test('subject keys match directory rows and locate the current token', () => {
  const keys = sptOwnedSubjectKeys([{
    poolId: id(10), tokenType: 1, subjectId: id(50), amountBaseUnits: BigInt(1), amountDisplay: '1',
    tokenObjectIds: [], live: true, currentSupplyBaseUnits: BigInt(0), basePriceBaseUnits: BigInt(0),
    quadraticCoefficient: BigInt(0), redeemableMysoBaseUnits: BigInt(0), redeemableMysoDisplay: '0',
    pricePerTokenMysoBaseUnits: BigInt(0), creatorAddress: null, profileAddress: id(7).toUpperCase().replace('0X', '0x'),
    postId: null, title: 't', detail: 'd', symbol: 'S', href: '/trade/spt', thumbUrl: null, avatarShape: 'circle',
  }]);

  assert.ok(keys.has(sptSubjectKey('profile', id(7))));
  assert.equal(keys.has(sptSubjectKey('post', id(7))), false);

  const positions = [{ profileAddress: id(7), postId: null, poolId: id(10) }] as never;
  assert.equal(findPositionForSubject(positions, { profileAddress: id(7) })?.poolId, id(10));
  assert.equal(findPositionForSubject(positions, { profileAddress: id(8) }), null);
});
