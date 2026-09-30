import { getMySoGraphQLClient } from '@/lib/myso-graphql-client';
import type { NetworkType } from '@/lib/network-utils';

/**
 * Display data for the subjects behind wallet holdings.
 *
 * `sptHoldings` on the indexer is empty while its SPT tables lag, so holdings are
 * discovered from the chain (see `lib/spt/owned-positions`) and only their names,
 * avatars, and post previews come from GraphQL. Every subject is fetched with an
 * aliased field so one round trip covers the whole wallet.
 */

export type SptHoldingSubjectProfile = {
  kind: 'profile';
  /** Profile object id — the SPT `associated_id`. */
  id: string;
  /** Profile owner wallet address; the `/trade/spt/:address` route key. */
  address: string;
  username: string | null;
  displayName: string | null;
  profilePhoto: string | null;
};

export type SptHoldingSubjectPost = {
  kind: 'post';
  /** Post object id — the SPT `associated_id`. */
  id: string;
  postId: string;
  content: string | null;
  mediaUrls: unknown;
  owner: string | null;
  ownerProfile: {
    address: string;
    username: string | null;
    displayName: string | null;
    profilePhoto: string | null;
  } | null;
};

export type SptHoldingSubject = SptHoldingSubjectProfile | SptHoldingSubjectPost;

type ProfileSubjectPayload = {
  address: string;
  username: string | null;
  displayName: string | null;
  profilePhoto: string | null;
} | null;

type PostSubjectPayload = {
  postId: string;
  content: string | null;
  mediaUrls: unknown;
  owner: string | null;
  ownerProfile: {
    address: string;
    username: string | null;
    displayName: string | null;
    profilePhoto: string | null;
  } | null;
} | null;

const PROFILE_SUBJECT_FIELDS = 'address username displayName profilePhoto';
const POST_SUBJECT_FIELDS = `postId content mediaUrls owner ownerProfile { ${PROFILE_SUBJECT_FIELDS} }`;

export const SPT_HOLDING_SUBJECTS_QUERY_NAME = 'SofiSwapSptHoldingSubjects';

/**
 * One aliased lookup per subject, so a wallet with many positions still costs one request.
 * Exported for schema validation in `tests/graphql-contracts.test.ts`.
 */
export function buildSptHoldingSubjectsQuery(
  profileAddresses: readonly string[],
  postIds: readonly string[]
): string {
  const variables = [
    ...profileAddresses.map((_, index) => `$p${index}: MySoAddress!`),
    ...postIds.map((_, index) => `$t${index}: ID!`),
  ];
  const fields = [
    ...profileAddresses.map((_, index) => `  p${index}: profile(address: $p${index}) { ${PROFILE_SUBJECT_FIELDS} }`),
    ...postIds.map((_, index) => `  t${index}: post(id: $t${index}) { ${POST_SUBJECT_FIELDS} }`),
  ];
  const signature = variables.length > 0 ? `(${variables.join(', ')})` : '';
  return /* GraphQL */ `query ${SPT_HOLDING_SUBJECTS_QUERY_NAME}${signature} {\n${fields.join('\n')}\n}`;
}

function subjectVariables(
  profileAddresses: readonly string[],
  postIds: readonly string[]
): Record<string, string> {
  return Object.fromEntries([
    ...profileAddresses.map((address, index) => [`p${index}`, address]),
    ...postIds.map((postId, index) => [`t${index}`, postId]),
  ]);
}

/**
 * Resolves subject display data keyed by subject object id.
 * Missing subjects (not indexed yet) are simply absent from the map.
 */
export async function fetchSptHoldingSubjects(input: {
  network: NetworkType;
  /** Subject object id → wallet address of the profile that owns it (`tokenType` 1). */
  profiles: ReadonlyArray<{ id: string; address: string }>;
  /** Subject object id → post object id (`tokenType` 2). */
  posts: ReadonlyArray<{ id: string; postId: string }>;
}): Promise<Map<string, SptHoldingSubject>> {
  const subjects = new Map<string, SptHoldingSubject>();
  const profileAddresses = input.profiles.map((row) => row.address);
  const postIds = input.posts.map((row) => row.postId);
  if (profileAddresses.length === 0 && postIds.length === 0) return subjects;

  const response = await getMySoGraphQLClient(input.network).query<
    Record<string, ProfileSubjectPayload | PostSubjectPayload>
  >({
    query: buildSptHoldingSubjectsQuery(profileAddresses, postIds),
    variables: subjectVariables(profileAddresses, postIds),
  });
  if (response.errors?.length && !response.data) {
    throw new Error(response.errors.map((error) => error.message).join('; '));
  }

  const data = response.data ?? {};
  input.profiles.forEach((row, index) => {
    const payload = data[`p${index}`] as ProfileSubjectPayload;
    if (!payload) return;
    subjects.set(row.id, {
      kind: 'profile',
      id: row.id,
      address: payload.address,
      username: payload.username,
      displayName: payload.displayName,
      profilePhoto: payload.profilePhoto,
    });
  });
  input.posts.forEach((row, index) => {
    const payload = data[`t${index}`] as PostSubjectPayload;
    if (!payload) return;
    subjects.set(row.id, {
      kind: 'post',
      id: row.id,
      postId: payload.postId,
      content: payload.content,
      mediaUrls: payload.mediaUrls,
      owner: payload.owner,
      ownerProfile: payload.ownerProfile,
    });
  });
  return subjects;
}
