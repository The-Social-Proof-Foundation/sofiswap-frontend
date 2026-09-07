import { getMySoGraphQLClient } from '@/lib/myso-graphql-client';
import type { NetworkType } from '@/lib/network-utils';
import type { SptDiscoveryPost, SptDiscoveryProfile } from '@/lib/graphql/spt-discovery';
import { readMoveObject } from '@/lib/spt/pool-state';

export const SPT_DIRECTORY_QUERY = /* GraphQL */ `
  query SofiSwapSptDirectory($limit: Int!, $offset: Int!, $owner: String, $viewer: MySoAddress!, $mine: Boolean!) {
    profiles(limit: $limit, offset: $offset) @skip(if: $mine) {
      address profileId username displayName bio profilePhoto reservationPoolAddress
      socialProofToken { poolId reservationPoolId tokenType isActive }
    }
    myProfile: profile(address: $viewer) @include(if: $mine) {
      address profileId username displayName bio profilePhoto reservationPoolAddress
      socialProofToken { poolId reservationPoolId tokenType isActive }
    }
    posts(owner: $owner, limit: $limit, offset: $offset) {
      postId owner content mediaUrls createdAt enableSpt sptId
      ownerProfile { address username displayName profilePhoto }
    }
  }
`;
export const SPT_USERNAME_QUERY = /* GraphQL */ `
  query SofiSwapSptUsername($username: String!) {
    usernameRegistryEntry(username: $username) { profileId }
  }
`;

/** Directory visibility includes reservations, not only launched trading pools. */
export function hasEnabledProfileSpt(profile: SptDiscoveryProfile): boolean {
  return Boolean(
    profile.reservationPoolAddress?.trim() ||
    profile.socialProofToken?.reservationPoolId?.trim() ||
    profile.socialProofToken?.poolId?.trim() ||
    profile.socialProofToken?.isActive === true
  );
}

export function hasEnabledPostSpt(post: SptDiscoveryPost): boolean {
  return post.enableSpt === true || Boolean(post.sptId?.trim());
}

export async function fetchSptDirectory(input: { network: NetworkType; offset: number; owner?: string | null }) {
  const response = await getMySoGraphQLClient(input.network).query<{
    profiles?: SptDiscoveryProfile[] | null;
    myProfile?: SptDiscoveryProfile | null;
    posts?: SptDiscoveryPost[] | null;
  }>({
    query: SPT_DIRECTORY_QUERY,
    variables: { limit: 50, offset: input.offset, owner: input.owner || null, viewer: input.owner || '0x0', mine: Boolean(input.owner) },
  });
  if (response.errors?.length) throw new Error(response.errors.map((e) => e.message).join('; '));
  if (!response.data) throw new Error('Could not load Social Proof Tokens.');
  return {
    profiles: (response.data.myProfile ? [response.data.myProfile] : response.data.profiles ?? []).filter(hasEnabledProfileSpt),
    posts: (response.data.posts ?? []).filter(hasEnabledPostSpt),
    // The schema paginates subjects, not enabled SPTs. Use the unfiltered page
    // lengths so hidden subjects cannot cut off access to later enabled tokens.
    hasNext: (response.data.profiles?.length ?? 0) === 50 || (response.data.posts?.length ?? 0) === 50,
  };
}

export async function findSptProfileByUsername(network: NetworkType, username: string): Promise<string> {
  const response = await getMySoGraphQLClient(network).query<{ usernameRegistryEntry: { profileId: string } | null }>({
    query: SPT_USERNAME_QUERY, variables: { username: username.trim().replace(/^@/, '').toLowerCase() },
  });
  if (response.errors?.length) throw new Error(response.errors.map((e) => e.message).join('; '));
  const id = response.data?.usernameRegistryEntry?.profileId;
  if (!id) throw new Error('No registered profile has that username.');
  const profile = await readMoveObject(network, id);
  if (typeof profile?.owner !== 'string') throw new Error('Could not resolve this profile’s owner.');
  return profile.owner;
}
