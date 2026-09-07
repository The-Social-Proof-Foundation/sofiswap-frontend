import type {
  ReservationHistoryRow,
  SocialProofChartPoint,
  SocialProofProfileRibbon,
  SocialProofStat,
  SocialProofTokenMeta,
  TradeHistoryRow,
} from '@/components/trade/trade-social-proof-token-workspace';
import { formatCompactDecimal } from '@/lib/trade/orderbook-format';
import type {
  SocialProofTokenPageConfiguration,
  SocialProofTokenPagePriceHistoryPoint,
  SocialProofTokenPageProfile,
  SocialProofTokenPageProfileFormerReservationHolder,
  SocialProofTokenPageProfileReservationHolder,
  SocialProofTokenPageProfileSocialProofToken,
  SocialProofTokenPagePoolFormerReservationHolder,
  SocialProofTokenPagePoolHolder,
  SocialProofTokenPagePoolReservationHolder,
  SocialProofTokenPagePoolTransaction,
  SocialProofTokenPageResult,
  SocialProofTokenPageSptPool,
  SptScalar,
} from '@/lib/graphql/social-proof-token-page';
import type { ProfilePortfolioSocialProofToken } from '@/lib/graphql/profile-portfolio-overview';
import { baseUnitsToDisplay, scalarToBigInt } from '@/lib/spt/amounts';

export function effectivePoolIdFromPortfolioSpt(
  spt: ProfilePortfolioSocialProofToken | null | undefined
): string | null {
  if (!spt) return null;
  const trading = spt.poolId?.trim();
  if (trading) return trading;
  const res = spt.reservationPoolId?.trim();
  return res || null;
}

export function effectivePoolIdFromPageProfileSpt(
  spt: SocialProofTokenPageProfileSocialProofToken | null | undefined
): string | null {
  if (!spt) return null;
  const trading = spt.poolId?.trim();
  if (trading) return trading;
  const res = spt.reservationPoolId?.trim();
  return res || null;
}

function scalarToNum(v: SptScalar): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number.parseFloat(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

export function formatSptScalarAmount(v: SptScalar): string {
  const amount = scalarToBigInt(v);
  if (amount == null) return '—';
  return baseUnitsToDisplay(amount, 6);
}

function tokenTypeLabel(value: number | null | undefined): string | null {
  if (value === 1) return 'Profile';
  if (value === 2) return 'Post';
  return value == null ? null : `Type ${value}`;
}

function formatPercentish(v: SptScalar): string {
  const n = scalarToNum(v);
  if (n == null) return '—';
  return `${formatCompactDecimal(n, { maxFractionDigits: 4 })}%`;
}

function formatPriceish(v: SptScalar): string {
  const n = scalarToBigInt(v);
  return n == null ? '—' : baseUnitsToDisplay(n, 9);
}

function scalarToEpochMs(v: SptScalar): number | null {
  if (typeof v === 'string' && !/^\d+(\.\d+)?$/.test(v.trim())) {
    const ms = Date.parse(v);
    return Number.isFinite(ms) ? ms : null;
  }
  const n = scalarToNum(v);
  if (n == null) return null;
  if (n > 1e15) return Math.round(n / 1e6);
  if (n > 1e12) return Math.round(n);
  if (n > 1e9) return Math.round(n * 1000);
  if (n > 1e6) return Math.round(n * 1000);
  return null;
}

function reservedAtToIso(v: SptScalar): string | null {
  const ms = scalarToEpochMs(v);
  if (ms == null || !Number.isFinite(ms)) return null;
  const cap = Date.now() + 864_000_000;
  if (ms < 946684800000 || ms > cap) return null;
  return new Date(ms).toISOString();
}

const INVALID_CHART_TIME = 'invalid';

function txTimestampToIso(v: SptScalar): string {
  const ms = scalarToEpochMs(v);
  if (ms != null && ms >= 946684800000 && ms <= Date.now() + 864_000_000) {
    return new Date(ms).toISOString();
  }
  return INVALID_CHART_TIME;
}

function transactionSide(type: string): 'buy' | 'sell' {
  const t = type.trim().toLowerCase();
  if (t.includes('sell') || t === 'ask') return 'sell';
  return 'buy';
}

function formatCreatedAtLabel(v: SptScalar): string | null {
  const ms = scalarToEpochMs(v);
  if (ms == null || !Number.isFinite(ms)) return null;
  const cap = Date.now() + 864_000_000;
  if (ms < 946684800000 || ms > cap) return null;
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function buildProfileRibbon(
  profile: SocialProofTokenPageProfile | null,
  pool: SocialProofTokenPageSptPool | null
): SocialProofProfileRibbon | null {
  if (!profile && !pool) return null;
  const spt = profile?.socialProofToken ?? null;
  const ownerLine =
    pool?.ownerProfile?.displayName?.trim() ||
    pool?.ownerProfile?.username?.trim() ||
    null;
  const ownerFallback =
    !ownerLine && pool?.owner?.trim() ? truncateMiddle(pool.owner.trim()) : null;

  return {
    username: profile?.username?.trim() ?? null,
    followersCount: profile?.followersCount ?? null,
    followingCount: profile?.followingCount ?? null,
    postCount: profile?.postCount ?? null,
    badge: profile?.selectedBadge
      ? {
          name: profile.selectedBadge.badgeName,
          iconUrl: profile.selectedBadge.badgeIconUrl ?? profile.selectedBadge.badgeMediaUrl,
        }
      : null,
    reservationPoolAddress:
      profile?.reservationPoolAddress?.trim() || spt?.reservationPoolId?.trim() || null,
    poolOwnerLine: ownerLine || ownerFallback,
    tokenType: tokenTypeLabel(pool?.tokenType ?? spt?.tokenType),
    isActive: spt?.isActive ?? null,
    profileAddress: profile?.address?.trim() ?? null,
  };
}

function buildTokenMeta(
  profile: SocialProofTokenPageProfile | null,
  pool: SocialProofTokenPageSptPool | null
): SocialProofTokenMeta {
  const spt = profile?.socialProofToken ?? null;
  const name =
    profile?.displayName?.trim() ||
    pool?.ownerProfile?.displayName?.trim() ||
    'Social proof token';
  const symbol =
    profile?.username?.trim() ||
    (spt?.tokenAddress?.trim() ? truncateMiddle(spt.tokenAddress.trim()) : '') ||
    '—';
  const address =
    pool?.poolId?.trim() ||
    spt?.tokenAddress?.trim() ||
    spt?.poolId?.trim() ||
    profile?.reservationPoolAddress?.trim() ||
    null;

  return {
    name,
    symbol,
    address,
    about: profile?.bio?.trim() || null,
  };
}

/** 0–100 for header progress ring; null when the page has no SPT / reservation context. */
function reservationFillPercentFromProfile(
  profile: SocialProofTokenPageProfile | null
): number | null {
  const spt = profile?.socialProofToken ?? null;
  if (!spt) return null;
  const raw = spt.reservationPercentage;
  if (raw == null || raw === '') return 0;
  const n = Number.parseFloat(String(raw));
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

function buildStats(
  profile: SocialProofTokenPageProfile | null,
  pool: SocialProofTokenPageSptPool | null,
  config: SocialProofTokenPageConfiguration | null
): SocialProofStat[] {
  const spt = profile?.socialProofToken ?? null;
  const rows: SocialProofStat[] = [];

  const add = (label: string, value: string) => {
    if (value !== '—') rows.push({ label, value });
  };

  if (pool) {
    add('Market cap', formatPriceish(pool.marketCap));
    add('Volume (24h)', formatPriceish(pool.volume24H));
    add('Total supply', formatSptScalarAmount(pool.totalSupply));
    add('Price', formatPriceish(pool.price));
    add('24h change', formatPercentish(pool.priceChange24H));
    add('Creator earnings', formatSptScalarAmount(pool.creatorEarnings));
    add('Platform earnings', formatSptScalarAmount(pool.platformEarnings));
    add('Ecosystem earnings', formatSptScalarAmount(pool.ecosystemEarnings));
  } else if (spt) {
    add('Total reserved', formatSptScalarAmount(spt.totalReserved));
    add('Volume (24h)', formatSptScalarAmount(spt.volume24H));
    add('Circulating', formatSptScalarAmount(spt.circulatingSupply));
    add('Market cap', formatPriceish(spt.marketCap));
    add('Creator earnings', formatSptScalarAmount(spt.creatorEarnings));
  }

  if (profile) {
    if (profile.username?.trim()) add('Username', `@${profile.username.trim()}`);
    if (profile.followersCount != null) add('Followers', String(profile.followersCount));
    if (profile.followingCount != null) add('Following', String(profile.followingCount));
    if (profile.selectedBadge?.badgeName?.trim()) add('Badge', profile.selectedBadge.badgeName.trim());
    const paddr = profile.address?.trim();
    if (paddr) add('Profile', truncateMiddle(paddr));
  }

  const tokenType = tokenTypeLabel(pool?.tokenType ?? profile?.socialProofToken?.tokenType);
  if (tokenType) add('Token type', tokenType);

  const ownerDisp =
    pool?.ownerProfile?.displayName?.trim() || pool?.ownerProfile?.username?.trim();
  if (ownerDisp) add('Pool owner', ownerDisp);
  else if (pool?.owner?.trim()) add('Pool owner', truncateMiddle(pool.owner.trim()));

  if (profile?.socialProofToken?.createdAt != null) {
    const created = formatCreatedAtLabel(profile.socialProofToken.createdAt);
    if (created) add('Created', created);
  }

  if (config) {
    add('Trading enabled', config.tradingEnabled === true ? 'Yes' : config.tradingEnabled === false ? 'No' : '—');
    const fees = scalarToNum(config.totalFeeBps);
    if (fees != null) add('Total fee (bps)', String(fees));
  }

  return rows;
}

function priceHistoryToChartSeries(
  points: readonly SocialProofTokenPagePriceHistoryPoint[]
): SocialProofChartPoint[] {
  return points
    .map((p) => {
      const t = scalarToEpochMs(p.timestamp);
      const price = scalarToNum(p.price);
      if (t == null || price == null) return null;
      return { t, price: price / 1e9 };
    })
    .filter((x): x is SocialProofChartPoint => x != null)
    .sort((a, b) => a.t - b.t);
}

function mapPoolTransactions(rows: readonly SocialProofTokenPagePoolTransaction[]): TradeHistoryRow[] {
  return rows.map((row, index) => {
    const amt = formatSptScalarAmount(row.amount);
    const side = transactionSide(row.type ?? '');
    return {
      id: `${row.from ?? ''}-${row.to ?? ''}-${index}`,
      time: txTimestampToIso(row.timestamp),
      traderAddress: row.from,
      side,
      price: '—',
      amount: amt,
      total: '—',
    };
  });
}

function truncateMiddle(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

function holderDisplay(p: SocialProofTokenPagePoolHolder['profile']): string {
  if (!p) return '—';
  return p.displayName?.trim() || p.username?.trim() || truncateMiddle(p.address);
}

export type SocialProofHolderRow = {
  id: string;
  address: string;
  label: string;
  amount: string;
};

function mapHolders(rows: readonly SocialProofTokenPagePoolHolder[]): SocialProofHolderRow[] {
  return rows.map((h, i) => ({
    id: `${h.address}-${i}`,
    address: h.address,
    label: h.profile?.address?.toLowerCase() === h.address.toLowerCase()
      ? holderDisplay(h.profile) : truncateMiddle(h.address),
    amount: formatSptScalarAmount(h.amount),
  }));
}

function reservationRowFromPool(
  row: SocialProofTokenPagePoolReservationHolder,
  index: number
): ReservationHistoryRow {
  const iso = reservedAtToIso(row.reservedAt);
  const time = iso ?? INVALID_CHART_TIME;
  const status: ReservationHistoryRow['status'] =
    row.thresholdMet === true ? 'filled' : row.thresholdMet === false ? 'pending' : 'partial';
  return {
    id: `${row.reserver}-pool-${index}`,
    time,
    holder: row.reserverProfile?.displayName?.trim() || row.reserverProfile?.username?.trim() || row.reserver,
    reservationId: truncateMiddle(row.reserver),
    allocated: formatSptScalarAmount(row.totalReserved),
    received: formatSptScalarAmount(row.amount),
    status,
  };
}

function reservationRowFromProfileSpt(
  row: SocialProofTokenPageProfileReservationHolder,
  index: number
): ReservationHistoryRow {
  const iso = reservedAtToIso(row.reservedAt);
  const time = iso ?? INVALID_CHART_TIME;
  const status: ReservationHistoryRow['status'] =
    row.thresholdMet === true ? 'filled' : row.thresholdMet === false ? 'pending' : 'partial';
  const resId =
    row.poolId?.trim() ? truncateMiddle(row.poolId.trim()) : truncateMiddle(row.reserver);
  return {
    id: `${row.reserver}-profile-${index}`,
    time,
    holder: row.reserverProfile?.displayName?.trim() || row.reserverProfile?.username?.trim() || row.reserver,
    reservationId: resId,
    allocated: formatSptScalarAmount(row.totalReserved),
    received: formatSptScalarAmount(row.amount),
    status,
  };
}

function formerFromProfile(
  row: SocialProofTokenPageProfileFormerReservationHolder,
  index: number
): ReservationHistoryRow {
  const iso = reservedAtToIso(row.reservedAt);
  return {
    id: `former-prof-${row.reserver}-${index}`,
    time: iso ?? INVALID_CHART_TIME,
    holder: row.reserverProfile?.displayName?.trim() || row.reserver,
    reservationId: row.poolId ? truncateMiddle(row.poolId) : '—',
    allocated: formatSptScalarAmount(row.totalReserved),
    received: formatSptScalarAmount(row.amount),
    status: row.thresholdMet === true ? 'filled' : 'partial',
  };
}

function formerFromPool(
  row: SocialProofTokenPagePoolFormerReservationHolder,
  index: number
): ReservationHistoryRow {
  const iso = reservedAtToIso(row.reservedAt);
  return {
    id: `former-pool-${row.reserver}-${index}`,
    time: iso ?? INVALID_CHART_TIME,
    holder: row.reserver,
    reservationId: '—',
    allocated: '—',
    received: formatSptScalarAmount(row.amount),
    status: 'filled',
  };
}

function buildPriceLabels(pool: SocialProofTokenPageSptPool | null): {
  priceLabel: string;
  changeLabel: string | null;
} {
  if (!pool) return { priceLabel: '—', changeLabel: null };
  return {
    priceLabel: formatPriceish(pool.price),
    changeLabel: `24h ${formatPercentish(pool.priceChange24H)}`,
  };
}

function maxIndividualReservationHuman(
  config: SocialProofTokenPageConfiguration | null,
  tokenType: number | null
): number | null {
  if (!config) return null;
  const postish = tokenType === 2;
  const raw = postish
    ? config.maxIndividualReservationAmountPost
    : config.maxIndividualReservationAmountProfile;
  const amount = scalarToBigInt(raw);
  if (amount == null || amount <= BigInt(0)) return null;
  const value = Number(baseUnitsToDisplay(amount, 9));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function firstFormattedPrice(...candidates: (SptScalar | null | undefined)[]): string {
  for (const c of candidates) {
    const f = formatPriceish(c ?? null);
    if (f !== '—') return f;
  }
  return '—';
}

/** Reservation / no-live-pool header: token spot/base, then ecosystem `sptConfiguration.basePrice`. */
function buildReservationPriceLabels(
  profile: SocialProofTokenPageProfile | null,
  config: SocialProofTokenPageConfiguration | null
): { priceLabel: string; changeLabel: string | null } {
  const spt = profile?.socialProofToken ?? null;
  const pl = firstFormattedPrice(
    spt?.currentPrice,
    spt?.basePrice,
    config?.basePrice
  );
  return { priceLabel: pl, changeLabel: null };
}

export type MappedSocialProofTokenWorkspace = {
  token: SocialProofTokenMeta;
  /** GraphQL profile.displayName (creator); prefer over token name in identity UI. */
  creatorDisplayName: string | null;
  profilePhotoUrl: string | null;
  coverPhotoUrl: string | null;
  websiteUrl: string | null;
  /** Reservation fill 0–100 for header ring; null if no SPT. */
  reservationFillPercent: number | null;
  profileRibbon: SocialProofProfileRibbon | null;
  stats: SocialProofStat[];
  trades: TradeHistoryRow[];
  reservations: ReservationHistoryRow[];
  formerReservations: ReservationHistoryRow[];
  chartSeries: SocialProofChartPoint[];
  priceLabel: string;
  changeLabel: string | null;
  holders: SocialProofHolderRow[];
  tradingEnabled: boolean | null;
  tokenType: string | null;
  tokenTypeCode: number | null;
  ownerAddress: string | null;
  subjectObjectId: string | null;
  livePoolId: string | null;
  totalReservedBaseUnits: bigint;
  requiredThresholdBaseUnits: bigint;
  currentSupplyBaseUnits: bigint;
  basePriceBaseUnits: bigint;
  quadraticCoefficient: bigint;
  tradingFeeBps: bigint;
  maxHoldPercentBps: bigint;
  reservationBalances: Array<{ reserver: string; amount: bigint }>;
  reservationStatus: string | null;
  reservationPoolId: string | null;
  reservationPoolAddress: string | null;
  hasLiveTradingPool: boolean;
  maxIndividualReservationMyso: number | null;
  maxIndividualReservationBaseUnits: bigint;
  usdPerMysoReservationQuote: number | null;
  /** GraphQL `socialProofToken.isActive`: drives reservation vs trading side panel. */
  sptIsActive: boolean | null;
  /** Ecosystem SPT configuration (fees, thresholds, reservation base price, etc.). */
  sptConfiguration: SocialProofTokenPageConfiguration | null;
  /** Reservation fee basis points from GraphQL `sptConfiguration` (for UI estimates). */
  reservationPlatformFeeBps: number | null;
  reservationTreasuryFeeBps: number | null;
  reservationCreatorFeeBps: number | null;
};

export function mapSocialProofTokenPageToWorkspace(result: SocialProofTokenPageResult): MappedSocialProofTokenWorkspace {
  const { profile, sptPool, sptConfiguration, chainState, rules } = result;
  const token = buildTokenMeta(profile, sptPool);
  const stats = buildStats(profile, sptPool, sptConfiguration);
  const profileRibbon = buildProfileRibbon(profile, sptPool);
  const reservationFillPercent = reservationFillPercentFromProfile(profile);
  const spt = profile?.socialProofToken ?? null;
  const tokenTypeCode = chainState?.tokenType ?? sptPool?.tokenType ?? spt?.tokenType ?? 1;
  const tokenType = tokenTypeLabel(tokenTypeCode);
  const reservationStatus = spt?.reservationStatus?.trim() || null;
  const reservationPoolId = spt?.reservationPoolId?.trim() || null;
  const reservationPoolAddress = profile?.reservationPoolAddress?.trim() || null;

  const poolPrice = buildPriceLabels(sptPool);
  const resPrice = buildReservationPriceLabels(profile, sptConfiguration);
  const priceLabel = sptPool ? poolPrice.priceLabel : resPrice.priceLabel;
  const changeLabel = sptPool ? poolPrice.changeLabel : resPrice.changeLabel;

  const envUsdPerMyso = (() => {
    const v = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_RESERVATION_USD_PER_MYSO?.trim() : '';
    if (!v) return null;
    const n = Number.parseFloat(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  })();

  const usdPerMysoReservationQuote = envUsdPerMyso;

  const maxIndividualReservationMyso = maxIndividualReservationHuman(sptConfiguration, tokenTypeCode);

  let reservations: ReservationHistoryRow[] = [];
  let formerReservations: ReservationHistoryRow[] = [];

  if (sptPool) {
    reservations = (sptPool.reservationHolders ?? []).map(reservationRowFromPool);
    formerReservations = (sptPool.formerReservationHolders ?? []).map(formerFromPool);
  }
  if (profile?.socialProofToken) {
    const spt = profile.socialProofToken;
    if (!sptPool) {
      reservations = (spt.reservationHolders ?? []).map(reservationRowFromProfileSpt);
    }
    formerReservations = [
      ...formerReservations,
      ...(spt.formerReservationHolders ?? []).map(formerFromProfile),
    ];
  }

  const chartSeries = sptPool ? priceHistoryToChartSeries(sptPool.priceHistory) : [];
  const trades = sptPool ? mapPoolTransactions(sptPool.transactions) : [];
  const holders = sptPool ? mapHolders(sptPool.holders) : [];

  return {
    token,
    creatorDisplayName: profile?.displayName?.trim() || null,
    profilePhotoUrl: profile?.profilePhoto?.trim() || null,
    coverPhotoUrl: profile?.coverPhoto?.trim() || null,
    websiteUrl: profile?.website?.trim() || null,
    reservationFillPercent: chainState && !chainState.live && chainState.requiredThreshold > BigInt(0)
      ? Math.min(100, Number(chainState.totalReserved * BigInt(10_000) / chainState.requiredThreshold) / 100)
      : reservationFillPercent,
    profileRibbon,
    stats,
    trades,
    reservations,
    formerReservations,
    chartSeries,
    priceLabel: chainState?.live ? baseUnitsToDisplay(chainState.basePrice +
      chainState.quadraticCoefficient * chainState.currentSupply * chainState.currentSupply / BigInt('10000000000000000000000'), 9) : priceLabel,
    changeLabel,
    holders,
    tradingEnabled: rules?.tradingEnabled ?? sptConfiguration?.tradingEnabled ?? false,
    tokenType,
    tokenTypeCode,
    ownerAddress: sptPool?.owner?.trim() || spt?.owner?.trim() || profile?.address?.trim() || null,
    subjectObjectId: profile?.profileId?.trim() || null,
    livePoolId: chainState?.live ? chainState.poolId : null,
    totalReservedBaseUnits: chainState?.totalReserved ?? scalarToBigInt(spt?.totalReserved) ?? BigInt(0),
    requiredThresholdBaseUnits: (tokenTypeCode === 2 ? rules?.postThreshold : rules?.profileThreshold) ?? chainState?.requiredThreshold ?? scalarToBigInt(spt?.requiredThreshold) ?? BigInt(0),
    currentSupplyBaseUnits: chainState?.currentSupply ?? BigInt(0),
    basePriceBaseUnits: chainState?.live ? chainState.basePrice : rules?.basePrice ?? scalarToBigInt(sptConfiguration?.basePrice) ?? BigInt(0),
    quadraticCoefficient: chainState?.live ? chainState.quadraticCoefficient : rules?.quadraticCoefficient ?? scalarToBigInt(sptConfiguration?.quadraticCoefficient) ?? BigInt(0),
    tradingFeeBps: rules?.tradingFeeBps ?? (
      (scalarToBigInt(sptConfiguration?.tradingCreatorFeeBps) ?? BigInt(0)) +
      (scalarToBigInt(sptConfiguration?.tradingPlatformFeeBps) ?? BigInt(0)) +
      (scalarToBigInt(sptConfiguration?.tradingTreasuryFeeBps) ?? BigInt(0))),
    maxHoldPercentBps: rules?.maxHoldBps ?? scalarToBigInt(sptConfiguration?.maxHoldPercentBps) ?? BigInt(0),
    reservationBalances: result.viewer && chainState ? [{ reserver: result.viewer, amount: chainState.viewerReservation }] : (sptPool?.reservationHolders ?? spt?.reservationHolders ?? [])
      .map((row) => ({
        reserver: row.reserver,
        amount: scalarToBigInt(row.amount) ?? BigInt(0),
      })),
    reservationStatus: chainState?.live || chainState?.converted ? 'converted' : reservationStatus,
    reservationPoolId,
    reservationPoolAddress,
    hasLiveTradingPool: Boolean(chainState?.live),
    maxIndividualReservationMyso,
    maxIndividualReservationBaseUnits: rules
      ? (tokenTypeCode === 2 ? rules.postThreshold : rules.profileThreshold) * rules.maxReservationBps / BigInt(10_000)
      : scalarToBigInt(tokenTypeCode === 2 ? sptConfiguration?.maxIndividualReservationAmountPost : sptConfiguration?.maxIndividualReservationAmountProfile) ?? BigInt(0),
    usdPerMysoReservationQuote,
    sptIsActive: chainState ? chainState.live : spt?.isActive ?? null,
    sptConfiguration: sptConfiguration ?? null,
    reservationPlatformFeeBps: rules ? Number(rules.reservationPlatformBps) : scalarToNum(sptConfiguration?.reservationPlatformFeeBps),
    reservationTreasuryFeeBps: rules ? Number(rules.reservationTreasuryBps) : scalarToNum(sptConfiguration?.reservationTreasuryFeeBps),
    reservationCreatorFeeBps: rules ? Number(rules.reservationCreatorBps) : scalarToNum(sptConfiguration?.reservationCreatorFeeBps),
  };
}
