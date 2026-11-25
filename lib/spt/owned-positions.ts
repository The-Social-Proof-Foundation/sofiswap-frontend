import type { SpotlightItem } from '@sehaj23/react-spotlight-search';

import {
  fetchSptHoldingSubjects,
  type SptHoldingSubject,
} from '@/lib/graphql/spt-holding-subjects';
import { fetchOwnedObjectsPage, getMySoJsonRpcClient } from '@/lib/myso-client';
import type { NetworkType } from '@/lib/network-utils';
import { baseUnitsToDisplay, calculateSptSellRefund } from '@/lib/spt/amounts';
import { resolveSptChainConfig } from '@/lib/spt/chain-config';
import { postDirectoryThumbUrl, profileDirectoryThumbUrl } from '@/lib/spt/media';
import { moveRecord, readMoveObject, type MoveJson } from '@/lib/spt/pool-state';
import { tickerSymbolFromLabel } from '@/lib/spt/ticker';
import { tradeSptPath, tradeSptPostPath } from '@/lib/trade-route-path';

/**
 * Social Proof Tokens the connected wallet actually owns.
 *
 * Positions come from the chain's owned objects, not from `sptHoldings`: the indexer
 * returns an empty list while its SPT tables lag behind a launch, which hid every token
 * a wallet could sell. The chain is already authoritative for SPT trading
 * (`resolveLiveSptPoolId`, `readSptPoolState`, `findOwnedSocialToken`), so the same
 * source is used to discover what the wallet holds.
 */

export const SPT_PROFILE_TOKEN_TYPE = 1;
export const SPT_POST_TOKEN_TYPE = 2;
export type SptOwnedTokenType = typeof SPT_PROFILE_TOKEN_TYPE | typeof SPT_POST_TOKEN_TYPE;

/** Bounded reads keep a wallet with many positions from flooding the node. */
const POOL_READ_CONCURRENCY = 4;
const MAX_OWNED_OBJECT_PAGES = 10;

export interface SptOwnedPosition {
  poolId: string;
  tokenType: SptOwnedTokenType;
  /** Profile or post object id this token is tied to (`associated_id`). */
  subjectId: string;
  amountBaseUnits: bigint;
  /** Human amount, e.g. `4` or `12.5`. */
  amountDisplay: string;
  /** Every owned token object for this pool, largest first (merge targets for sells). */
  tokenObjectIds: string[];
  /** True once the pool has launched; only live pools can be bought or sold. */
  live: boolean;
  currentSupplyBaseUnits: bigint;
  basePriceBaseUnits: bigint;
  quadraticCoefficient: bigint;
  /** MYSO returned by selling the whole position on the bonding curve. */
  redeemableMysoBaseUnits: bigint;
  redeemableMysoDisplay: string;
  /** Curve price per whole token, in MYSO base units. */
  pricePerTokenMysoBaseUnits: bigint;
  /** Wallet that enabled the token (the subject's owner). */
  creatorAddress: string | null;
  /** `/trade/spt/:address` route key for profile tokens. */
  profileAddress: string | null;
  /** `/trade/spt/post/:postId` route key for post tokens. */
  postId: string | null;
  title: string;
  detail: string;
  symbol: string;
  href: string;
  thumbUrl: string | null;
  avatarShape: 'circle' | 'square';
}

type OwnedTokenObject = { objectId: string; poolId: string; amount: bigint; tokenType: number | null };

type PoolHoldings = {
  poolId: string;
  amount: bigint;
  tokenType: number | null;
  tokenObjectIds: string[];
};

function normalizeAddress(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase();
  if (!trimmed || !/^0x[0-9a-f]+$/.test(trimmed)) return null;
  return trimmed.replace(/^0x0+/, '0x');
}

function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeAddress(a);
  return Boolean(left && left === normalizeAddress(b));
}

function shortAddress(value: string): string {
  return value.length > 19 ? `${value.slice(0, 8)}…${value.slice(-8)}` : value;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nestedScalar(value: unknown): unknown {
  const record = asRecord(value);
  if (!record) return value;
  if ('value' in record) return nestedScalar(record.value);
  if ('fields' in record) return nestedScalar(record.fields);
  return value;
}

function stringField(fields: MoveJson, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = nestedScalar(fields[key]);
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function toBigInt(value: unknown): bigint | null {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isInteger(value)) return BigInt(value);
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return BigInt(value.trim());
  return null;
}

function bigintField(fields: MoveJson, ...keys: string[]): bigint | null {
  for (const key of keys) {
    const value = toBigInt(nestedScalar(fields[key]));
    if (value != null) return value;
  }
  return null;
}

function numberField(fields: MoveJson, ...keys: string[]): number | null {
  const value = bigintField(fields, ...keys);
  if (value == null) return null;
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) ? numeric : null;
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await run(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Every `SocialToken` object the wallet owns, collapsed per pool. */
export async function listOwnedSocialTokenHoldings(input: {
  network: NetworkType;
  owner: string;
  packageId?: string;
}): Promise<PoolHoldings[]> {
  const packageId = input.packageId || (await resolveSptChainConfig(input.network)).packageId;
  const client = getMySoJsonRpcClient(input.network);
  const structType = `${packageId}::social_proof_tokens::SocialToken`;
  const objects: OwnedTokenObject[] = [];
  let cursor: string | null | undefined;
  let pages = 0;

  do {
    const page = await fetchOwnedObjectsPage(client, { owner: input.owner, structType, cursor });
    for (const item of page.data) {
      const data = item.data;
      const fields = asRecord(asRecord(data?.content)?.fields);
      if (!data?.objectId || !fields) continue;
      const poolId = stringField(fields, 'pool_id', 'poolId');
      const amount = bigintField(fields, 'amount');
      if (!poolId || amount == null) continue;
      objects.push({ objectId: data.objectId, poolId, amount, tokenType: numberField(fields, 'token_type', 'tokenType') });
    }
    cursor = page.hasNextPage ? page.nextCursor : null;
    pages += 1;
  } while (cursor && pages < MAX_OWNED_OBJECT_PAGES);

  const byPool = new Map<string, PoolHoldings>();
  for (const token of objects) {
    const key = normalizeAddress(token.poolId) ?? token.poolId.toLowerCase();
    const existing = byPool.get(key);
    if (existing) {
      existing.amount += token.amount;
      existing.tokenObjectIds.push(token.objectId);
      existing.tokenType ??= token.tokenType;
      continue;
    }
    byPool.set(key, {
      poolId: token.poolId,
      amount: token.amount,
      tokenType: token.tokenType,
      tokenObjectIds: [token.objectId],
    });
  }
  return Array.from(byPool.values());
}

type PoolTerms = {
  subjectId: string | null;
  tokenType: number | null;
  creatorAddress: string | null;
  live: boolean;
  currentSupply: bigint;
  basePrice: bigint;
  quadraticCoefficient: bigint;
};

/** Bonding-curve terms and subject id for a token pool object. */
async function readPoolTerms(network: NetworkType, poolId: string): Promise<PoolTerms | null> {
  const pool = await readMoveObject(network, poolId);
  if (!pool) return null;
  const info = moveRecord(pool.info);
  const amount = (value: unknown) => toBigInt(nestedScalar(value)) ?? BigInt(0);
  const currentSupply = info.circulating_supply == null ? null : amount(info.circulating_supply);
  return {
    subjectId: stringField(info, 'associated_id', 'associatedId'),
    tokenType: numberField(info, 'token_type', 'tokenType'),
    creatorAddress: stringField(info, 'owner'),
    live: currentSupply != null,
    currentSupply: currentSupply ?? BigInt(0),
    basePrice: amount(info.base_price),
    quadraticCoefficient: amount(info.quadratic_coefficient),
  };
}

/** Profile object id → wallet address, which is what the SPT route keys on. */
async function readProfileOwner(network: NetworkType, profileObjectId: string): Promise<string | null> {
  try {
    const profile = await readMoveObject(network, profileObjectId);
    return stringField(profile ?? {}, 'owner');
  } catch {
    return null;
  }
}

function postTitle(content: string | null | undefined): string {
  const line = content?.replace(/\s+/g, ' ').trim() ?? '';
  if (!line) return 'Untitled post';
  return line.length > 58 ? `${line.slice(0, 57)}…` : line;
}

/** Ticker label — handles first, matching `trendingSptTickerItems`. */
function symbolLabel(subject: SptHoldingSubject | undefined, fallbackAddress: string | null): string {
  if (subject?.kind === 'profile') {
    const handle = subject.username?.trim();
    if (handle) return `@${handle.replace(/^@/, '')}`;
    if (subject.displayName?.trim()) return subject.displayName.trim();
  }
  if (subject?.kind === 'post') {
    const owner = subject.ownerProfile?.username?.trim();
    if (owner) return `@${owner.replace(/^@/, '')}`;
    if (subject.ownerProfile?.displayName?.trim()) return subject.ownerProfile.displayName.trim();
    if (subject.owner) return shortAddress(subject.owner);
  }
  return fallbackAddress ? shortAddress(fallbackAddress) : 'Social Proof Token';
}

/** Row title — display names read better than handles. */
function subjectTitle(subject: SptHoldingSubject | undefined, fallbackAddress: string | null): string {
  if (subject?.kind === 'post') return postTitle(subject.content);
  if (subject?.kind === 'profile') {
    if (subject.displayName?.trim()) return subject.displayName.trim();
    const handle = subject.username?.trim();
    if (handle) return `@${handle.replace(/^@/, '')}`;
    return shortAddress(subject.address);
  }
  return fallbackAddress ? shortAddress(fallbackAddress) : 'Social Proof Token';
}

/**
 * Discover and value the Social Proof Tokens held by `owner`.
 * Positions are chain-verified; names, avatars, and post previews come from GraphQL.
 */
export async function fetchOwnedSptPositions(input: {
  network: NetworkType;
  owner: string;
  packageId?: string;
}): Promise<SptOwnedPosition[]> {
  const owner = input.owner.trim();
  if (!owner) return [];
  const holdings = await listOwnedSocialTokenHoldings({ ...input, owner });
  if (holdings.length === 0) return [];

  const terms = await mapWithConcurrency(holdings, POOL_READ_CONCURRENCY, async (holding) => ({
    holding,
    terms: await readPoolTerms(input.network, holding.poolId),
  }));

  const profileSubjects: Array<{ id: string; address: string }> = [];
  const postSubjects: Array<{ id: string; postId: string }> = [];
  const resolved = await mapWithConcurrency(terms, POOL_READ_CONCURRENCY, async ({ holding, terms: poolTerms }) => {
    if (!poolTerms?.subjectId) return { holding, poolTerms, profileAddress: null as string | null };
    const tokenType = poolTerms.tokenType ?? holding.tokenType;
    if (tokenType === SPT_POST_TOKEN_TYPE) {
      postSubjects.push({ id: poolTerms.subjectId, postId: poolTerms.subjectId });
      return { holding, poolTerms, profileAddress: null as string | null };
    }
    // A profile SPT is keyed by its Profile object id; the profile's owner wallet is the route key.
    const profileAddress =
      (await readProfileOwner(input.network, poolTerms.subjectId)) ?? poolTerms.creatorAddress;
    if (profileAddress) profileSubjects.push({ id: poolTerms.subjectId, address: profileAddress });
    return { holding, poolTerms, profileAddress };
  });

  let subjects = new Map<string, SptHoldingSubject>();
  try {
    subjects = await fetchSptHoldingSubjects({
      network: input.network,
      profiles: dedupeSubjects(profileSubjects),
      posts: dedupeSubjects(postSubjects),
    });
  } catch {
    // Names and avatars are presentation only; a GraphQL hiccup must not hide a sellable position.
    subjects = new Map();
  }

  const positions: SptOwnedPosition[] = [];
  for (const { holding, poolTerms, profileAddress } of resolved) {
    const tokenType = poolTerms?.tokenType ?? holding.tokenType;
    if (tokenType !== SPT_PROFILE_TOKEN_TYPE && tokenType !== SPT_POST_TOKEN_TYPE) continue;
    const subjectId = poolTerms?.subjectId ?? null;
    const subject = subjectId ? subjects.get(subjectId) : undefined;
    const postId = tokenType === SPT_POST_TOKEN_TYPE ? subject?.kind === 'post' ? subject.postId : subjectId : null;
    const live = poolTerms?.live === true;
    const basePrice = poolTerms?.basePrice ?? BigInt(0);
    const quadraticCoefficient = poolTerms?.quadraticCoefficient ?? BigInt(0);
    const currentSupply = poolTerms?.currentSupply ?? BigInt(0);
    const sellable = holding.amount > currentSupply ? currentSupply : holding.amount;
    const redeemable = live && sellable > BigInt(0)
      ? calculateSptSellRefund({
          basePrice,
          quadraticCoefficient,
          currentSupply,
          tokenAmount: sellable,
        })
      : BigInt(0);
    const fallbackAddress = tokenType === SPT_PROFILE_TOKEN_TYPE ? profileAddress : subject?.kind === 'post' ? subject.owner : poolTerms?.creatorAddress ?? null;
    const label = symbolLabel(subject, fallbackAddress);
    const href = tokenType === SPT_POST_TOKEN_TYPE
      ? tradeSptPostPath(postId ?? '')
      : tradeSptPath(profileAddress);
    const detail = subject?.kind === 'post'
      ? subject.ownerProfile?.username?.trim()
        ? `@${subject.ownerProfile.username.trim().replace(/^@/, '')}`
        : subject.owner
          ? shortAddress(subject.owner)
          : 'Post SPT'
      : subject?.kind === 'profile' && subject.username?.trim()
        ? `@${subject.username.trim().replace(/^@/, '')}`
        : profileAddress
          ? shortAddress(profileAddress)
          : 'Profile SPT';

    positions.push({
      poolId: holding.poolId,
      tokenType,
      subjectId: subjectId ?? holding.poolId,
      amountBaseUnits: holding.amount,
      amountDisplay: baseUnitsToDisplay(holding.amount, 4),
      tokenObjectIds: [...holding.tokenObjectIds].sort((a, b) => a.localeCompare(b)),
      live,
      currentSupplyBaseUnits: currentSupply,
      basePriceBaseUnits: basePrice,
      quadraticCoefficient,
      redeemableMysoBaseUnits: redeemable,
      redeemableMysoDisplay: baseUnitsToDisplay(redeemable, 4),
      pricePerTokenMysoBaseUnits: holding.amount > BigInt(0) ? redeemable / holding.amount : BigInt(0),
      creatorAddress: poolTerms?.creatorAddress ?? null,
      profileAddress: tokenType === SPT_PROFILE_TOKEN_TYPE ? profileAddress : null,
      postId,
      title: subjectTitle(subject, fallbackAddress),
      detail,
      symbol: tickerSymbolFromLabel(label),
      href,
      thumbUrl: subject?.kind === 'post'
        ? postDirectoryThumbUrl(subject.mediaUrls, subject.ownerProfile?.profilePhoto)
        : subject?.kind === 'profile'
          ? profileDirectoryThumbUrl(subject.profilePhoto)
          : null,
      avatarShape: tokenType === SPT_POST_TOKEN_TYPE ? 'square' : 'circle',
    });
  }

  return positions.sort((a, b) => {
    if (a.live !== b.live) return a.live ? -1 : 1;
    if (a.redeemableMysoBaseUnits !== b.redeemableMysoBaseUnits) {
      return a.redeemableMysoBaseUnits > b.redeemableMysoBaseUnits ? -1 : 1;
    }
    return a.symbol.localeCompare(b.symbol);
  });
}

function dedupeSubjects<T extends { id: string }>(rows: ReadonlyArray<T>): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = normalizeAddress(row.id) ?? row.id.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The position a token page represents, so the page can highlight its own row. */
export function findPositionForSubject(
  positions: ReadonlyArray<SptOwnedPosition>,
  subject: { profileAddress?: string | null; postId?: string | null }
): SptOwnedPosition | null {
  const profileAddress = subject.profileAddress?.trim() || null;
  const postId = subject.postId?.trim() || null;
  return positions.find((position) => {
    if (postId) return Boolean(position.postId && sameAddress(position.postId, postId));
    if (profileAddress) return Boolean(position.profileAddress && sameAddress(position.profileAddress, profileAddress));
    return false;
  }) ?? null;
}

/** Directory rows use the same subject key, so holders can be marked as already owned. */
export function sptSubjectKey(kind: 'profile' | 'post', id: string): string {
  return `${kind}:${normalizeAddress(id) ?? id.trim().toLowerCase()}`;
}

export function sptOwnedSubjectKeys(positions: ReadonlyArray<SptOwnedPosition>): Set<string> {
  const keys = new Set<string>();
  for (const position of positions) {
    if (position.profileAddress) keys.add(sptSubjectKey('profile', position.profileAddress));
    if (position.postId) keys.add(sptSubjectKey('post', position.postId));
  }
  return keys;
}

/**
 * Spotlight rows for owned positions. They are listed ahead of the native spot
 * markets and the rest of the SPT catalog so a held token is the first result.
 */
export function sptOwnedPositionSpotlightItems(
  positions: ReadonlyArray<SptOwnedPosition>
): SpotlightItem[] {
  return positions.map((position) => ({
    id: `owned:${position.poolId}`,
    name: `${position.symbol} ${position.title} ${position.amountDisplay} held`,
    url: position.href,
    icon: position.thumbUrl ?? undefined,
    tags: Array.from(
      new Set(
        [
          'spt',
          'held',
          'owned',
          'my tokens',
          'portfolio',
          'position',
          position.symbol,
          position.title,
          position.detail,
          position.poolId,
          position.subjectId,
          position.tokenType === SPT_POST_TOKEN_TYPE ? 'post' : 'profile',
          position.live ? 'live' : 'not launched',
        ].filter(Boolean)
      )
    ),
  }));
}

/**
 * Merge owned-position rows into a catalog list without showing a token twice.
 * The owned row wins (it carries the held amount) and keeps the catalog's tags.
 */
export function mergeOwnedSpotlightItems(
  owned: ReadonlyArray<SpotlightItem>,
  catalog: ReadonlyArray<SpotlightItem>
): SpotlightItem[] {
  if (owned.length === 0) return [...catalog];
  const ownedUrls = new Set(owned.map((item) => item.url).filter((url): url is string => Boolean(url)));
  const merged = owned.map((item) => {
    const match = catalog.find((candidate) => candidate.url && candidate.url === item.url);
    if (!match) return item;
    return {
      ...item,
      icon: item.icon || match.icon,
      tags: Array.from(new Set([...(item.tags ?? []), ...(match.tags ?? [])])),
    };
  });
  const remaining = catalog.filter((item) => !(item.url && ownedUrls.has(item.url)));
  // A catalog entry can own several URLs (profile + its posts); keep unmatched ones in place.
  return [...merged, ...remaining];
}
