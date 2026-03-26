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
export const PROFILE_PORTFOLIO_OVERVIEW_2_QUERY = /* GraphQL */ `
  query ProfilePortfolioOverview2($address: MySoAddress!, $platformId: ID!) {
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
      selectedBadgeId
      selectedEcosystemBadgeId
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
        owner
        createdAt
        isActive
        basePrice
        currentPrice
        circulatingSupply
        marketCap
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
      vestingWallets {
        walletId
        totalAmount
        duration
        claimedAmount
        claimedPercentage
      }
      sptHoldings(limit: 10, offset: 0) {
        profile {
          displayName
          username
          socialProofTokenAddress
        }
        address
        amount
      }
      reservationHoldings(limit: 10, offset: 0) {
        profile {
          displayName
          username
          socialProofTokenAddress
        }
        amount
        poolId
        poolStatus
        requiredThreshold
        reservedAt
        thresholdMet
        totalReserved
      }
    }
  }
`;

export interface ProfilePortfolioOverview2Result {
  platformUserAccess: PlatformUserAccess | null;
  address?: unknown;
  profile?: unknown;
  errors?: Array<{ message: string }>;
}

export async function fetchProfilePortfolioOverview(
  address: string,
  platformId: string,
  network?: NetworkType
): Promise<ProfilePortfolioOverview2Result> {
  const client = getMySoGraphQLClient(network);
  const res = await client.query<ProfilePortfolioOverview2Result>({
    query: PROFILE_PORTFOLIO_OVERVIEW_2_QUERY,
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
