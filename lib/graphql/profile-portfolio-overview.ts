import { getMySoGraphQLClient } from '@/lib/myso-graphql-client';
import type { NetworkType } from '@/lib/network-utils';

export interface PlatformUserAccess {
  isMember: boolean;
  isBlocked: boolean;
  isModerator: boolean;
}

/** Lightweight gate query — avoids loading full portfolio on every login. */
export const PLATFORM_USER_ACCESS_GATE_QUERY = /* GraphQL */ `
  query PlatformUserAccessGate($address: MySoAddress!, $platformId: ID!) {
    platformUserAccess(platform: $platformId, user: $address) {
      isMember
      isBlocked
      isModerator
    }
  }
`;

interface PlatformUserAccessGateData {
  platformUserAccess: PlatformUserAccess | null;
}

export interface PlatformUserAccessGateResult {
  access: PlatformUserAccess | null;
  errors?: Array<{ message: string }>;
}

export async function fetchPlatformUserAccessGate(
  address: string,
  platformId: string,
  network?: NetworkType
): Promise<PlatformUserAccessGateResult> {
  const client = getMySoGraphQLClient(network);
  const res = await client.query<PlatformUserAccessGateData>({
    query: PLATFORM_USER_ACCESS_GATE_QUERY,
    variables: { address, platformId },
  });

  if (res.errors?.length) {
    return {
      access: res.data?.platformUserAccess ?? null,
      errors: res.errors,
    };
  }

  return { access: res.data?.platformUserAccess ?? null };
}

/** Full portfolio overview (and platform access) for rich profile UIs. */
export const PROFILE_PORTFOLIO_OVERVIEW_QUERY = /* GraphQL */ `
  query ProfilePortfolioOverview($address: MySoAddress!, $platformId: ID!) {
    # Platform relationship for this wallet (member / blocked / moderator)
    platformUserAccess(platform: $platformId, user: $address) {
      isMember
      isBlocked
      isModerator
    }

    address(address: $address) {
      balances(first: 10) {
        nodes {
          coinType {
            repr
          }
          totalBalance
        }
      }
    }

    profile(address: $address) {
      address
      username
      displayName
      profilePhoto
      coverPhoto
      bio
      followersCount
      followingCount
      postCount
      createdAt
      profileId
      socialProofTokenAddress
      reservationPoolAddress
      blockListAddress
      selectedBadge {
        badgeId
        badgeName
        badgeType
        badgeIconUrl
        badgeMediaUrl
        platformId
      }
      socialProofToken {
        poolId
        symbol
        name
        tokenAddress
        tokenType
        createdAt
        isActive
        currentPrice
        priceChange24H
        volume24H
        creatorEarnings
        platformEarnings
        ecosystemEarnings
        requiredThreshold
        reservationPercentage
        reservationPoolId
        reservationStatus
        totalReserved
      }
      sptHoldings(limit: 10, offset: 0) {
        address
        amount
        profile {
          address
          displayName
          username
          socialProofTokenAddress
          profilePhoto
          reservationPercentage
          selectedBadge {
            badgeId
            badgeIconUrl
          }
        }
      }
      reservationHoldings(limit: 10, offset: 0) {
        profile {
          address
          displayName
          username
          socialProofTokenAddress
          profilePhoto
          reservationPercentage
          selectedBadge {
            badgeId
            badgeIconUrl
          }
        }
        poolId
        amount
        poolStatus
        thresholdMet
        requiredThreshold
        totalReserved
      }
    }
  }
`;

/** @deprecated Use {@link PROFILE_PORTFOLIO_OVERVIEW_QUERY}. */
export const PROFILE_PORTFOLIO_OVERVIEW_2_QUERY = PROFILE_PORTFOLIO_OVERVIEW_QUERY;

/** Coin type as returned under `address.balances.nodes[].coinType`. */
export interface ProfilePortfolioCoinType {
  repr: string;
}

export interface ProfilePortfolioBalanceNode {
  coinType: ProfilePortfolioCoinType;
  totalBalance: string;
}

export interface ProfilePortfolioBalancesConnection {
  nodes: ProfilePortfolioBalanceNode[];
}

/** Top-level `address` field (wallet balances). */
export interface ProfilePortfolioAddressData {
  balances: ProfilePortfolioBalancesConnection;
}

export interface ProfilePortfolioSelectedBadge {
  badgeId: string;
  badgeName: string;
  badgeType: string;
  badgeIconUrl: string | null;
  badgeMediaUrl: string | null;
  platformId: string;
}

export interface ProfilePortfolioSocialProofToken {
  poolId: string;
  symbol: string;
  name: string;
  tokenAddress: string;
  tokenType: string;
  createdAt: string;
  isActive: boolean;
  currentPrice: string | null;
  priceChange24H: string | null;
  volume24H: string | null;
  creatorEarnings: string | null;
  platformEarnings: string | null;
  ecosystemEarnings: string | null;
  requiredThreshold: string | null;
  reservationPercentage: string | null;
  reservationPoolId: string | null;
  reservationStatus: string | null;
  totalReserved: string | null;
}

export interface ProfilePortfolioHoldingBadge {
  badgeId: string;
  badgeIconUrl: string | null;
}

/** Nested `profile` on `sptHoldings` / `reservationHoldings` rows. */
export interface ProfilePortfolioHoldingProfile {
  address: string;
  displayName: string | null;
  username: string | null;
  socialProofTokenAddress: string | null;
  profilePhoto: string | null;
  reservationPercentage: string | null;
  selectedBadge: ProfilePortfolioHoldingBadge | null;
}

export interface ProfilePortfolioSptHolding {
  address: string;
  amount: string;
  profile: ProfilePortfolioHoldingProfile;
}

export interface ProfilePortfolioReservationHolding {
  profile: ProfilePortfolioHoldingProfile;
  poolId: string;
  amount: string;
  poolStatus: string | null;
  thresholdMet: boolean | null;
  requiredThreshold: string | null;
  totalReserved: string | null;
}

/** Top-level `profile` field — matches `ProfilePortfolioOverview` selection set. */
export interface ProfilePortfolioOverviewProfile {
  address: string;
  username: string | null;
  displayName: string | null;
  profilePhoto: string | null;
  coverPhoto: string | null;
  bio: string | null;
  followersCount: number | null;
  followingCount: number | null;
  postCount: number | null;
  createdAt: string | null;
  profileId: string | null;
  socialProofTokenAddress: string | null;
  reservationPoolAddress: string | null;
  blockListAddress: string | null;
  selectedBadge: ProfilePortfolioSelectedBadge | null;
  socialProofToken: ProfilePortfolioSocialProofToken | null;
  sptHoldings: ProfilePortfolioSptHolding[];
  reservationHoldings: ProfilePortfolioReservationHolding[];
}

/** GraphQL `data` payload for {@link PROFILE_PORTFOLIO_OVERVIEW_QUERY}. */
export interface ProfilePortfolioOverviewQueryData {
  platformUserAccess: PlatformUserAccess | null;
  address: ProfilePortfolioAddressData | null;
  profile: ProfilePortfolioOverviewProfile | null;
}

export interface ProfilePortfolioOverviewResult {
  platformUserAccess: PlatformUserAccess | null;
  address?: ProfilePortfolioAddressData | null;
  profile?: ProfilePortfolioOverviewProfile | null;
  errors?: Array<{ message: string }>;
}

export async function fetchProfilePortfolioOverview(
  address: string,
  platformId: string,
  network?: NetworkType
): Promise<ProfilePortfolioOverviewResult> {
  const client = getMySoGraphQLClient(network);
  const res = await client.query<ProfilePortfolioOverviewQueryData>({
    query: PROFILE_PORTFOLIO_OVERVIEW_QUERY,
    variables: { address, platformId },
  });

  if (res.errors?.length) {
    return {
      platformUserAccess: res.data?.platformUserAccess ?? null,
      address: res.data?.address,
      profile: res.data?.profile,
      errors: res.errors,
    };
  }

  return {
    platformUserAccess: res.data?.platformUserAccess ?? null,
    address: res.data?.address,
    profile: res.data?.profile,
  };
}
