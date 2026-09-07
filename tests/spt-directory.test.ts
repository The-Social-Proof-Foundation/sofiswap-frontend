import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { fetchSptDirectory, findSptProfileByUsername } from '../lib/graphql/spt-directory';
import { sptSpotlightItems, type SptDiscoveryProfile, type SptDiscoveryPost } from '../lib/graphql/spt-discovery';

const id = (n: number) => `0x${n.toString(16).padStart(64, '0')}`;
const profile = (n: number, changes: Partial<SptDiscoveryProfile> = {}): SptDiscoveryProfile => ({
  address: id(n), profileId: id(n + 100), username: `creator${n}`, displayName: null, bio: null,
  profilePhoto: null, reservationPoolAddress: null, socialProofToken: null, ...changes,
});
const post = (n: number, changes: Partial<SptDiscoveryPost> = {}): SptDiscoveryPost => ({
  postId: id(n), owner: id(1), content: `Post ${n}`, mediaUrls: [], createdAt: 0,
  enableSpt: false, sptId: null, ownerProfile: null, ...changes,
});
const spt = { poolId: null, reservationPoolId: null, tokenType: 1, isActive: false };
afterEach(() => mock.restoreAll());

test('main SPT directory excludes unenabled subjects but retains reservations and live tokens', async () => {
  const profiles = [profile(1), profile(2, { socialProofToken: spt }), profile(3, { reservationPoolAddress: id(30) }),
    profile(4, { socialProofToken: { ...spt, reservationPoolId: id(40) } }),
    profile(5, { socialProofToken: { ...spt, poolId: id(50), isActive: true } })];
  const posts = [post(10), post(11, { enableSpt: true }), post(12, { sptId: id(120) })];
  mock.method(globalThis, 'fetch', async () => Response.json({ data: { profiles, posts } }));
  const result = await fetchSptDirectory({ network: 'localnet', offset: 0 });
  assert.deepEqual(result.profiles.map((p) => p.address), [id(3), id(4), id(5)]);
  assert.deepEqual(result.posts.map((p) => p.postId), [id(11), id(12)]);
  assert.equal(result.hasNext, false);
});

test('hidden subjects do not disable pagination before later enabled tokens', async () => {
  mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
    const { variables } = JSON.parse(String(init?.body));
    return Response.json({ data: { profiles: variables.offset === 0 ? Array.from({ length: 50 }, (_, i) => profile(i + 1)) : [profile(60, { reservationPoolAddress: id(160) })], posts: [] } });
  });
  const first = await fetchSptDirectory({ network: 'localnet', offset: 0 });
  assert.deepEqual(first.profiles, []);
  assert.equal(first.hasNext, true);
  const next = await fetchSptDirectory({ network: 'localnet', offset: 50 });
  assert.equal(next.profiles[0].address, id(60));
  assert.equal(next.hasNext, false);
});

test('owner directory views also exclude unenabled profiles and posts', async () => {
  mock.method(globalThis, 'fetch', async () => Response.json({ data: { myProfile: profile(1), posts: [post(2), post(3, { enableSpt: true })] } }));
  const result = await fetchSptDirectory({ network: 'localnet', offset: 0, owner: id(1) });
  assert.deepEqual(result.profiles, []);
  assert.deepEqual(result.posts.map((p) => p.postId), [id(3)]);
});

test('unenabled profiles remain searchable and exact username lookup still opens their profile', async () => {
  const unenabled = profile(1);
  const items = sptSpotlightItems({ profiles: [unenabled], posts: [], pools: [] });
  assert.equal(items[0].url, `/trade/spt/${id(1)}`);
  mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
    const { query } = JSON.parse(String(init?.body));
    if (query.includes('SofiSwapSptUsername')) return Response.json({ data: { usernameRegistryEntry: { profileId: id(101) } } });
    assert.match(query, /SofiSwapSptObject/);
    return Response.json({ data: { object: { asMoveObject: { contents: { json: { owner: id(1) } } } } } });
  });
  assert.equal(await findSptProfileByUsername('localnet', '@creator1'), id(1));
});
