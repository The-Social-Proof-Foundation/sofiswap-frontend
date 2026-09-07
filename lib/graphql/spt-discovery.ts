import type { SpotlightItem } from '@sehaj23/react-spotlight-search';

import { getMySoGraphQLClient } from '@/lib/myso-graphql-client';
import type { NetworkType } from '@/lib/network-utils';

export type SptDiscoveryProfile = {
  address: string;
  profileId: string | null;
  username: string | null;
  displayName: string | null;
  bio: string | null;
  profilePhoto: string | null;
  reservationPoolAddress: string | null;
  socialProofToken: {
    poolId: string | null;
    reservationPoolId: string | null;
    tokenType: number | null;
    isActive: boolean;
  } | null;
};

export type SptDiscoveryPost = {
  postId: string;
  owner: string;
  content: string;
  mediaUrls: unknown;
  createdAt: number;
  enableSpt: boolean;
  sptId: string | null;
  ownerProfile: {
    address: string;
    username: string | null;
    displayName: string | null;
    profilePhoto: string | null;
  } | null;
};

export type SptDiscoveryPool = {
  poolId: string;
  tokenType: number;
  owner: string;
  price: number;
  priceChange24H: number | null;
  volume24H: number | null;
  ownerProfile: SptDiscoveryPost['ownerProfile'];
  holders: Array<{
    associatedId: string;
    post: SptDiscoveryPost | null;
  }>;
};

export type SptDiscoveryResult = {
  profiles: SptDiscoveryProfile[];
  posts: SptDiscoveryPost[];
  pools: SptDiscoveryPool[];
  errors?: Array<{ message: string }>;
};

export const SPT_DISCOVERY_QUERY = /* GraphQL */ `
  query SofiSwapSptDiscovery($limit: Int!, $offset: Int!) {
    profiles(limit: $limit, offset: $offset) {
      address
      profileId
      username
      displayName
      bio
      profilePhoto
      reservationPoolAddress
      socialProofToken {
        poolId
        reservationPoolId
        tokenType
        isActive
      }
    }
    posts(limit: $limit, offset: $offset) {
      postId
      owner
      content
      mediaUrls
      createdAt
      enableSpt
      sptId
      ownerProfile { address username displayName profilePhoto }
    }
    sptPools(limit: $limit, offset: $offset) {
      poolId
      tokenType
      owner
      price
      priceChange24H
      volume24H
      ownerProfile { address username displayName profilePhoto }
      holders(limit: 1, offset: 0) {
        associatedId
        post {
          postId
          owner
          content
          mediaUrls
          createdAt
          enableSpt
          sptId
          ownerProfile { address username displayName profilePhoto }
        }
      }
    }
  }
`;

export async function fetchSptDiscovery(
  network: NetworkType,
  limit = 100,
  offset = 0
): Promise<SptDiscoveryResult> {
  const response = await getMySoGraphQLClient(network).query<{
    profiles?: SptDiscoveryProfile[] | null;
    posts?: SptDiscoveryPost[] | null;
    sptPools?: SptDiscoveryPool[] | null;
  }>({
    query: SPT_DISCOVERY_QUERY,
    variables: { limit, offset },
  });
  return {
    profiles: response.data?.profiles ?? [],
    posts: response.data?.posts ?? [],
    pools: response.data?.sptPools ?? [],
    errors: response.errors,
  };
}

function short(value: string): string {
  return value.length > 20 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value;
}

function postTitle(post: SptDiscoveryPost): string {
  const line = post.content.replace(/\s+/g, ' ').trim();
  if (!line) return 'Untitled post';
  return line.length > 58 ? `${line.slice(0, 57)}…` : line;
}

export function sptSpotlightItems(result: SptDiscoveryResult): SpotlightItem[] {
  const profileItems = result.profiles
    .filter((profile) => profile.profileId || profile.socialProofToken || profile.reservationPoolAddress)
    .map((profile): SpotlightItem => ({
      id: `spt:profile:${profile.address}`,
      name: `${profile.displayName?.trim() || profile.username?.trim() || short(profile.address)} · Profile SPT`,
      url: `/trade/spt/${profile.address}`,
      tags: [
        'spt',
        'profile',
        'social proof token',
        profile.address,
        profile.profileId || '',
        profile.username || '',
        profile.displayName || '',
        profile.bio || '',
      ].filter(Boolean),
    }));

  const postById = new Map(result.posts.map((post) => [post.postId.toLowerCase(), post]));
  for (const pool of result.pools) {
    for (const holder of pool.holders) {
      if (holder.post) postById.set(holder.post.postId.toLowerCase(), holder.post);
    }
  }

  const postItems = Array.from(postById.values()).map((post): SpotlightItem => {
      const creator = post.ownerProfile?.displayName || post.ownerProfile?.username || short(post.owner);
      return {
        id: `spt:post:${post.postId}`,
        name: `${postTitle(post)} · Post SPT`,
        url: `/trade/spt/post/${post.postId}`,
        tags: [
          'spt',
          'post',
          'social proof token',
          post.postId,
          post.owner,
          creator,
          post.ownerProfile?.username || '',
          post.content,
        ].filter(Boolean),
      };
    });

  return [...profileItems, ...postItems];
}
