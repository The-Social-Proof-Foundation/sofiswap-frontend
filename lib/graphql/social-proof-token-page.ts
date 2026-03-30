import { getMySoGraphQLClient } from '@/lib/myso-graphql-client';
import type { NetworkType } from '@/lib/network-utils';

const SPT_PAGE_FRAGMENTS = /* GraphQL */ `
  fragment PstBadge on SelectedBadge {
    badgeId
    badgeName
    badgeIconUrl
    badgeMediaUrl
    badgeType
  }

  fragment PstProfileSummary on ProfileSummary {
    displayName
    address
    username
    profilePhoto
    selectedBadge {
      ...PstBadge
    }
    socialProofToken {
      reservationPercentage
      reservationStatus
    }
  }
`;

export const SOCIAL_PROOF_TOKEN_PAGE_QUERY = /* GraphQL */ `
  query SocialProofTokenPage(
    $profileAddress: MySoAddress!
    $poolId: ID!
    $chartPoints: Int = 500
    $holdersLimit: Int = 100
    $txLimit: Int = 100
  ) {
    profile(address: $profileAddress) {
      displayName
      address
      username
      bio
      website
      profilePhoto
      followersCount
      followingCount
      postCount
      reservationPoolAddress
      selectedBadge {
        badgeId
        badgeName
        badgeIconUrl
        badgeMediaUrl
        badgeType
      }
      socialProofToken {
        poolId
        tokenAddress
        isActive
        name
        symbol
        tokenType
        owner
        createdAt
        basePrice
        circulatingSupply
        currentPrice
        marketCap
        priceChange24H
        volume24H
        creatorEarnings
        platformEarnings
        ecosystemEarnings
        reservationPoolId
        reservationStatus
        reservationPercentage
        totalReserved
        requiredThreshold
        reservationHolders(limit: $holdersLimit, offset: 0) {
          amount
          poolId
          poolStatus
          requiredThreshold
          reservedAt
          thresholdMet
          totalReserved
          reserver
          reserverProfile {
            ...PstProfileSummary
          }
          profile {
            ...PstProfileSummary
          }
        }
        formerReservationHolders(limit: $holdersLimit, offset: 0) {
          amount
          poolId
          poolStatus
          reservedAt
          reserver
          reserverProfile {
            ...PstProfileSummary
          }
          profile {
            ...PstProfileSummary
          }
          requiredThreshold
          thresholdMet
          totalReserved
        }
      }
    }

    sptPool(id: $poolId) {
      poolId
      name
      symbol
      tokenType
      price
      priceChange24H
      marketCap
      totalSupply
      volume24H
      creatorEarnings
      platformEarnings
      ecosystemEarnings
      owner
      ownerProfile {
        ...PstProfileSummary
      }
      holders(limit: $holdersLimit, offset: 0) {
        address
        amount
        profile {
          ...PstProfileSummary
        }
      }
      transactions(limit: $txLimit, offset: 0) {
        type
        amount
        from
        timestamp
        to
      }
      priceHistory(limit: $chartPoints, offset: 0) {
        poolId
        price
        circulatingSupply
        timestamp
        transactionId
      }
      reservationHolders(limit: $holdersLimit, offset: 0) {
        amount
        reservedAt
        reserver
        reserverProfile {
          ...PstProfileSummary
        }
        totalReserved
        requiredThreshold
        thresholdMet
      }
      formerReservationHolders(limit: $holdersLimit, offset: 0) {
        amount
        reservedAt
        reserver
      }
    }

    sptConfiguration {
      postThreshold
      profileThreshold
      maxIndividualReservationBps
      maxIndividualReservationAmountProfile
      maxIndividualReservationAmountPost
      totalFeeBps
      creatorFeeBps
      platformFeeBps
      treasuryFeeBps
      tradingCreatorFeeBps
      tradingPlatformFeeBps
      tradingTreasuryFeeBps
      reservationCreatorFeeBps
      reservationPlatformFeeBps
      reservationTreasuryFeeBps
      maxReserversPerPool
      basePrice
      quadraticCoefficient
      maxHoldPercentBps
      tradingEnabled
      updatedAt
    }
  }
  ${SPT_PAGE_FRAGMENTS}
`;

export type SptScalar = string | number | null | undefined;

export interface SocialProofTokenPagePstBadge {
  badgeId: string;
  badgeName: string;
  badgeIconUrl: string | null;
  badgeMediaUrl: string | null;
  badgeType: string;
}

export interface SocialProofTokenPagePstProfileSummary {
  displayName: string | null;
  address: string;
  username: string | null;
  profilePhoto: string | null;
  selectedBadge: SocialProofTokenPagePstBadge | null;
  socialProofToken: {
    reservationPercentage: SptScalar;
    reservationStatus: string | null;
  } | null;
}

export interface SocialProofTokenPageProfileReservationHolder {
  amount: SptScalar;
  poolId: string | null;
  poolStatus: string | null;
  requiredThreshold: SptScalar;
  reservedAt: SptScalar;
  thresholdMet: boolean | null;
  totalReserved: SptScalar;
  reserver: string;
  reserverProfile: SocialProofTokenPagePstProfileSummary | null;
  profile: SocialProofTokenPagePstProfileSummary | null;
}

export interface SocialProofTokenPageProfileFormerReservationHolder {
  amount: SptScalar;
  poolId: string | null;
  poolStatus: string | null;
  reservedAt: SptScalar;
  reserver: string;
  reserverProfile: SocialProofTokenPagePstProfileSummary | null;
  profile: SocialProofTokenPagePstProfileSummary | null;
  requiredThreshold: SptScalar;
  thresholdMet: boolean | null;
  totalReserved: SptScalar;
}

export interface SocialProofTokenPageProfileSocialProofToken {
  poolId: string | null;
  tokenAddress: string | null;
  isActive: boolean | null;
  name: string | null;
  symbol: string | null;
  tokenType: string | null;
  owner: string | null;
  createdAt: SptScalar;
  basePrice: SptScalar;
  circulatingSupply: SptScalar;
  currentPrice: SptScalar;
  marketCap: SptScalar;
  priceChange24H: SptScalar;
  volume24H: SptScalar;
  creatorEarnings: SptScalar;
  platformEarnings: SptScalar;
  ecosystemEarnings: SptScalar;
  reservationPoolId: string | null;
  reservationStatus: string | null;
  reservationPercentage: SptScalar;
  totalReserved: SptScalar;
  requiredThreshold: SptScalar;
  reservationHolders: SocialProofTokenPageProfileReservationHolder[];
  formerReservationHolders: SocialProofTokenPageProfileFormerReservationHolder[];
}

export interface SocialProofTokenPageProfile {
  displayName: string | null;
  address: string;
  username: string | null;
  bio: string | null;
  website: string | null;
  profilePhoto: string | null;
  followersCount: number | null;
  followingCount: number | null;
  postCount: number | null;
  reservationPoolAddress: string | null;
  selectedBadge: SocialProofTokenPagePstBadge | null;
  socialProofToken: SocialProofTokenPageProfileSocialProofToken | null;
}

export interface SocialProofTokenPagePoolHolder {
  address: string;
  amount: SptScalar;
  profile: SocialProofTokenPagePstProfileSummary | null;
}

export interface SocialProofTokenPagePoolTransaction {
  type: string;
  amount: SptScalar;
  from: string | null;
  timestamp: SptScalar;
  to: string | null;
}

export interface SocialProofTokenPagePriceHistoryPoint {
  poolId: string | null;
  price: SptScalar;
  circulatingSupply: SptScalar;
  timestamp: SptScalar;
  transactionId: string | null;
}

export interface SocialProofTokenPagePoolReservationHolder {
  amount: SptScalar;
  reservedAt: SptScalar;
  reserver: string;
  reserverProfile: SocialProofTokenPagePstProfileSummary | null;
  totalReserved: SptScalar;
  requiredThreshold: SptScalar;
  thresholdMet: boolean | null;
}

export interface SocialProofTokenPagePoolFormerReservationHolder {
  amount: SptScalar;
  reservedAt: SptScalar;
  reserver: string;
}

export interface SocialProofTokenPageSptPool {
  poolId: string | null;
  name: string | null;
  symbol: string | null;
  tokenType: string | null;
  price: SptScalar;
  priceChange24H: SptScalar;
  marketCap: SptScalar;
  totalSupply: SptScalar;
  volume24H: SptScalar;
  creatorEarnings: SptScalar;
  platformEarnings: SptScalar;
  ecosystemEarnings: SptScalar;
  owner: string | null;
  ownerProfile: SocialProofTokenPagePstProfileSummary | null;
  holders: SocialProofTokenPagePoolHolder[];
  transactions: SocialProofTokenPagePoolTransaction[];
  priceHistory: SocialProofTokenPagePriceHistoryPoint[];
  reservationHolders: SocialProofTokenPagePoolReservationHolder[];
  formerReservationHolders: SocialProofTokenPagePoolFormerReservationHolder[];
}

export interface SocialProofTokenPageConfiguration {
  postThreshold: SptScalar;
  profileThreshold: SptScalar;
  maxIndividualReservationBps: SptScalar;
  maxIndividualReservationAmountProfile: SptScalar;
  maxIndividualReservationAmountPost: SptScalar;
  totalFeeBps: SptScalar;
  creatorFeeBps: SptScalar;
  platformFeeBps: SptScalar;
  treasuryFeeBps: SptScalar;
  tradingCreatorFeeBps: SptScalar;
  tradingPlatformFeeBps: SptScalar;
  tradingTreasuryFeeBps: SptScalar;
  reservationCreatorFeeBps: SptScalar;
  reservationPlatformFeeBps: SptScalar;
  reservationTreasuryFeeBps: SptScalar;
  maxReserversPerPool: SptScalar;
  basePrice: SptScalar;
  quadraticCoefficient: SptScalar;
  maxHoldPercentBps: SptScalar;
  tradingEnabled: boolean | null;
  updatedAt: SptScalar;
}

export interface SocialProofTokenPageQueryData {
  profile: SocialProofTokenPageProfile | null;
  sptPool: SocialProofTokenPageSptPool | null;
  sptConfiguration: SocialProofTokenPageConfiguration | null;
}

export interface SocialProofTokenPageResult {
  profile: SocialProofTokenPageProfile | null;
  sptPool: SocialProofTokenPageSptPool | null;
  sptConfiguration: SocialProofTokenPageConfiguration | null;
  errors?: Array<{ message: string }>;
}

export interface FetchSocialProofTokenPageArgs {
  profileAddress: string;
  poolId: string;
  network?: NetworkType;
  chartPoints?: number;
  holdersLimit?: number;
  txLimit?: number;
}

export async function fetchSocialProofTokenPage({
  profileAddress,
  poolId,
  network,
  chartPoints = 500,
  holdersLimit = 100,
  txLimit = 100,
}: FetchSocialProofTokenPageArgs): Promise<SocialProofTokenPageResult> {
  const client = getMySoGraphQLClient(network);
  const res = await client.query<SocialProofTokenPageQueryData>({
    query: SOCIAL_PROOF_TOKEN_PAGE_QUERY,
    variables: {
      profileAddress,
      poolId,
      chartPoints,
      holdersLimit,
      txLimit,
    },
  });

  if (res.errors?.length) {
    return {
      profile: res.data?.profile ?? null,
      sptPool: res.data?.sptPool ?? null,
      sptConfiguration: res.data?.sptConfiguration ?? null,
      errors: res.errors,
    };
  }

  return {
    profile: res.data?.profile ?? null,
    sptPool: res.data?.sptPool ?? null,
    sptConfiguration: res.data?.sptConfiguration ?? null,
  };
}
