import { getMySoGraphQLClient } from '@/lib/myso-graphql-client';
import type { NetworkType } from '@/lib/network-utils';
import type {
  SocialProofTokenPageConfiguration,
  SocialProofTokenPagePoolReservationHolder,
  SocialProofTokenPageProfile,
  SocialProofTokenPageResult,
  SocialProofTokenPageSptPool,
} from '@/lib/graphql/social-proof-token-page';
import { scalarToBigInt } from '@/lib/spt/amounts';
import { readSptPoolState, readSptRules, resolveLiveSptPoolId, type SptPoolState, type SptRules } from '@/lib/spt/pool-state';
import {
  mapSocialProofTokenPageToWorkspace,
  type MappedSocialProofTokenWorkspace,
} from '@/lib/social-proof-token-map-workspace';

export type PostSptSubject = {
  postId: string;
  owner: string;
  content: string;
  mediaUrls: unknown;
  createdAt: number;
  enableSpt: boolean;
  sptId: string | null;
  revenueManifest?: { usesEscrowRedirect: boolean } | null;
  ownerProfile: {
    address: string;
    username: string | null;
    displayName: string | null;
    profilePhoto: string | null;
    bio: string | null;
    followersCount: number | null;
    followingCount: number | null;
    postCount: number | null;
  } | null;
};

export type PostSptPageResult = {
  rules?: SptRules;
  chainState?: SptPoolState | null;
  viewer?: string | null;
  post: PostSptSubject | null;
  ownerProfile: SocialProofTokenPageProfile | null;
  livePool: SocialProofTokenPageSptPool | null;
  reservationHolders: SocialProofTokenPagePoolReservationHolder[];
  reservationPoolId: string | null;
  configuration: SocialProofTokenPageConfiguration | null;
  errors?: Array<{ message: string }>;
};

export const RESOLVE_POST_SPT_QUERY = /* GraphQL */ `
  query SofiSwapResolvePostSpt($postId: ID!) {
    post(id: $postId) {
      postId owner content mediaUrls createdAt enableSpt sptId
      revenueManifest { usesEscrowRedirect }
      ownerProfile {
        address username displayName profilePhoto bio followersCount followingCount postCount
      }
    }
  }
`;

export const POST_SPT_DETAIL_QUERY = /* GraphQL */ `
  query SofiSwapPostSptDetail(
    $postId: ID!
    $owner: MySoAddress!
    $poolId: ID!
    $includePool: Boolean!
    $reservationPoolId: ID!
    $includeReservation: Boolean!
    $chartPoints: Int!
    $limit: Int!
  ) {
    post(id: $postId) {
      postId owner content mediaUrls createdAt enableSpt sptId
      revenueManifest { usesEscrowRedirect }
      ownerProfile {
        address username displayName profilePhoto bio followersCount followingCount postCount
      }
    }
    profile(address: $owner) {
      profileId displayName address username bio website profilePhoto coverPhoto
      followersCount followingCount postCount reservationPoolAddress
      selectedBadge { badgeId badgeName badgeIconUrl badgeMediaUrl badgeType }
    }
    sptPool(id: $poolId) @include(if: $includePool) {
      poolId tokenType price priceChange24H marketCap totalSupply volume24H
      creatorEarnings platformEarnings ecosystemEarnings owner
      ownerProfile {
        displayName address username profilePhoto
        selectedBadge { badgeId badgeName badgeIconUrl badgeMediaUrl badgeType }
        socialProofToken { reservationPercentage reservationStatus }
      }
      holders(limit: $limit, offset: 0) {
        address amount associatedId
        profile {
          displayName address username profilePhoto
          selectedBadge { badgeId badgeName badgeIconUrl badgeMediaUrl badgeType }
          socialProofToken { reservationPercentage reservationStatus }
        }
      }
      transactions(limit: $limit, offset: 0) { type amount from timestamp to }
      creatorFeeSettlements(limit: $limit, offset: 0) {
        eventId poolId trader sourcePostId creatorFee walletAmount vaultAmount timestamp
      }
      priceHistory(limit: $chartPoints, offset: 0) {
        poolId price circulatingSupply timestamp transactionId
      }
      reservationHolders(limit: $limit, offset: 0) {
        amount poolId reservedAt reserver totalReserved requiredThreshold thresholdMet
        reserverProfile {
          displayName address username profilePhoto
          selectedBadge { badgeId badgeName badgeIconUrl badgeMediaUrl badgeType }
          socialProofToken { reservationPercentage reservationStatus }
        }
      }
      formerReservationHolders(limit: $limit, offset: 0) {
        amount poolId reservedAt reserver
      }
    }
    reservationHolders: sptReservationHolders(
      poolId: $reservationPoolId
      limit: $limit
      offset: 0
    ) @include(if: $includeReservation) {
      amount poolId poolStatus requiredThreshold reservedAt thresholdMet totalReserved reserver
      reserverProfile {
        displayName address username profilePhoto
        selectedBadge { badgeId badgeName badgeIconUrl badgeMediaUrl badgeType }
        socialProofToken { reservationPercentage reservationStatus }
      }
    }
    sptConfiguration {
      updatedBy postThreshold profileThreshold maxIndividualReservationBps
      maxIndividualReservationAmountProfile maxIndividualReservationAmountPost totalFeeBps
      creatorFeeBps platformFeeBps treasuryFeeBps tradingCreatorFeeBps
      tradingPlatformFeeBps tradingTreasuryFeeBps reservationCreatorFeeBps
      reservationPlatformFeeBps reservationTreasuryFeeBps maxReserversPerPool
      basePrice quadraticCoefficient maxHoldPercentBps tradingEnabled updatedAt transactionId
    }
  }
`;

export async function fetchPostSptPage(input: {
  viewer?: string | null;
  network: NetworkType;
  postId: string;
  chartPoints?: number;
  limit?: number;
}): Promise<PostSptPageResult> {
  const client = getMySoGraphQLClient(input.network);
  const resolved = await client.query<{
    post?: PostSptSubject | null;
    sptPools?: Array<{ poolId: string; holders: Array<{ associatedId: string }> }> | null;
  }>({
    query: RESOLVE_POST_SPT_QUERY,
    variables: { postId: input.postId },
  });
  const post = resolved.data?.post ?? null;
  if (!post) {
    return {
      post: null,
      ownerProfile: null,
      livePool: null,
      reservationHolders: [],
      reservationPoolId: null,
      configuration: null,
      errors: resolved.errors?.length ? resolved.errors : [{ message: 'Post was not found.' }],
    };
  }

  const livePoolId = await resolveLiveSptPoolId(input.network, post.postId);
  const reservationPoolId = livePoolId ? null : post.sptId?.trim() || null;
  const id = livePoolId || reservationPoolId;
  const chainState = id ? await readSptPoolState({
    network: input.network, poolId: id, subjectId: post.postId, viewer: input.viewer,
  }) : null;
  const detail = await client.query<{
    post?: PostSptSubject | null;
    profile?: SocialProofTokenPageProfile | null;
    sptPool?: SocialProofTokenPageSptPool | null;
    reservationHolders?: SocialProofTokenPagePoolReservationHolder[] | null;
    sptConfiguration?: SocialProofTokenPageConfiguration | null;
  }>({
    query: POST_SPT_DETAIL_QUERY,
    variables: {
      postId: post.postId,
      owner: post.owner,
      poolId: livePoolId || '0x0',
      includePool: Boolean(livePoolId),
      reservationPoolId: reservationPoolId || '0x0',
      includeReservation: Boolean(reservationPoolId),
      chartPoints: input.chartPoints ?? 500,
      limit: input.limit ?? 100,
    },
  });
  const pool = detail.data?.sptPool ?? null;
  const poolReservationId = pool?.reservationHolders?.[0]?.poolId?.trim() || null;
  return {
    rules: await readSptRules(input.network),
    chainState,
    viewer: input.viewer,
    post: detail.data?.post ?? post,
    ownerProfile: detail.data?.profile ?? null,
    livePool: pool,
    reservationHolders: detail.data?.reservationHolders ?? pool?.reservationHolders ?? [],
    reservationPoolId: reservationPoolId || poolReservationId,
    configuration: detail.data?.sptConfiguration ?? null,
    errors: [...(resolved.errors ?? []), ...(detail.errors ?? [])],
  };
}

function percentage(total: bigint, threshold: bigint): number {
  if (threshold <= BigInt(0)) return 0;
  return Math.min(100, Number((total * BigInt(10_000)) / threshold) / 100);
}

function firstMediaUrl(value: unknown): string | null {
  if (Array.isArray(value)) {
    const found = value.find((entry) => typeof entry === 'string' && entry.trim());
    return typeof found === 'string' ? found.trim() : null;
  }
  if (typeof value === 'string') {
    try {
      return firstMediaUrl(JSON.parse(value));
    } catch {
      return value.trim() || null;
    }
  }
  return null;
}

export function mapPostSptPageToWorkspace(
  result: PostSptPageResult
): MappedSocialProofTokenWorkspace | null {
  const post = result.post;
  if (!post) return null;
  const config = result.configuration;
  const rows = result.livePool?.reservationHolders?.length
    ? result.livePool.reservationHolders
    : result.reservationHolders;
  const first = rows[0];
  const total = scalarToBigInt(first?.totalReserved) ?? BigInt(0);
  const threshold =
    scalarToBigInt(first?.requiredThreshold) ?? scalarToBigInt(config?.postThreshold) ?? BigInt(0);
  const syntheticProfile: SocialProofTokenPageProfile = {
    profileId: result.ownerProfile?.profileId ?? null,
    displayName: post.ownerProfile?.displayName ?? result.ownerProfile?.displayName ?? null,
    address: post.owner,
    username: post.ownerProfile?.username ?? result.ownerProfile?.username ?? null,
    bio: post.content,
    website: null,
    profilePhoto: post.ownerProfile?.profilePhoto ?? result.ownerProfile?.profilePhoto ?? null,
    coverPhoto: firstMediaUrl(post.mediaUrls) ?? result.ownerProfile?.coverPhoto ?? null,
    followersCount: post.ownerProfile?.followersCount ?? null,
    followingCount: post.ownerProfile?.followingCount ?? null,
    postCount: post.ownerProfile?.postCount ?? null,
    reservationPoolAddress: result.reservationPoolId,
    selectedBadge: result.ownerProfile?.selectedBadge ?? null,
    socialProofToken: post.enableSpt || post.sptId || result.livePool
      ? {
          poolId: result.livePool?.poolId ?? null,
          tokenAddress: result.livePool?.poolId ?? null,
          isActive: Boolean(result.livePool),
          tokenType: 2,
          owner: post.owner,
          createdAt: post.createdAt,
          basePrice: config?.basePrice,
          circulatingSupply: result.livePool?.totalSupply,
          currentPrice: result.livePool?.price ?? config?.basePrice,
          marketCap: result.livePool?.marketCap,
          priceChange24H: result.livePool?.priceChange24H,
          volume24H: result.livePool?.volume24H,
          creatorEarnings: result.livePool?.creatorEarnings,
          platformEarnings: result.livePool?.platformEarnings,
          ecosystemEarnings: result.livePool?.ecosystemEarnings,
          reservationPoolId: result.reservationPoolId,
          reservationStatus: first?.thresholdMet ? 'threshold_met' : 'active',
          reservationPercentage: percentage(total, threshold),
          totalReserved: total.toString(),
          requiredThreshold: threshold.toString(),
          reservationHolders: rows.map((row) => ({
            ...row,
            poolStatus: first?.thresholdMet ? 'threshold_met' : 'active',
            profile: null,
          })),
          formerReservationHolders: [],
        }
      : null,
  };
  const mapped = mapSocialProofTokenPageToWorkspace({
    rules: result.rules,
    chainState: result.chainState,
    viewer: result.viewer,
    profile: syntheticProfile,
    sptPool: result.livePool,
    sptConfiguration: config,
  } satisfies SocialProofTokenPageResult);
  const creator = post.ownerProfile?.displayName || post.ownerProfile?.username || 'creator';
  return {
    ...mapped,
    token: {
      ...mapped.token,
      name: `Post by ${creator}`,
      symbol: 'POST',
      about: post.content,
      address: result.livePool?.poolId ?? result.reservationPoolId ?? post.postId,
    },
    creatorDisplayName: creator,
    subjectObjectId: post.postId,
    ownerAddress: post.owner,
    tokenType: 'Post',
    tokenTypeCode: 2,
  };
}
