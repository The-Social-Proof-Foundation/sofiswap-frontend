'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { TradeSocialProofTokenWorkspace } from '@/components/trade/trade-social-proof-token-workspace';
import { SptMarketDirectory } from '@/components/trade/spt-market-directory';
import type { GraphqlProfileOverviewData } from '@/hooks/useGraphqlProfileOverviewSWR';
import { useMySocialAuth } from '@/hooks/useMySocialAuth';
import { usePostSptPage } from '@/hooks/usePostSptPage';
import { useSocialProofTokenPage } from '@/hooks/useSocialProofTokenPage';
import { mapPostSptPageToWorkspace } from '@/lib/graphql/post-spt-page';
import { useNetwork } from '@/lib/network-provider';
import { primaryMysoBalanceFromProfileOverview } from '@/lib/profile-overview-myso-balance';
import {
  mapSocialProofTokenPageToWorkspace,
} from '@/lib/social-proof-token-map-workspace';
import {
  tradeWorkspaceRouteEmptyRootClass,
  tradeWorkspaceRouteLoadingClass,
} from '@/lib/trade-shell-styles';
import { cn } from '@/lib/utils';

function TokenNotFound() {
  return (
    <div className={cn(tradeWorkspaceRouteEmptyRootClass, 'gap-3')} role="status">
      <p className="text-lg font-semibold text-foreground">Profile or post not found</p>
      <p className="max-w-md text-sm text-[var(--muted-foreground)]">
        It may not be indexed on the selected network yet.
      </p>
      <Link href="/trade/spt" className="text-sm text-primary underline">Browse Social Proof Tokens</Link>
    </div>
  );
}

export function TradeSocialProofTokenContainer({
  enabled,
  profileOverview,
  profileAddressOverride = null,
  postIdOverride = null,
}: {
  enabled: boolean;
  profileOverview: GraphqlProfileOverviewData | null;
  profileAddressOverride?: string | null;
  postIdOverride?: string | null;
}) {
  const searchParams = useSearchParams();
  const { currentNetwork } = useNetwork();
  const { displayAddress } = useMySocialAuth();
  const profileParam = searchParams.get('profile')?.trim() || null;
  const isPost = Boolean(postIdOverride?.trim());
  const explicitProfile = Boolean(profileAddressOverride?.trim() || profileParam);

  const profileAddress = useMemo(() => {
    if (isPost) return null;
    if (profileAddressOverride?.trim()) return profileAddressOverride.trim();
    if (profileParam) return profileParam;
    return null;
  }, [isPost, profileAddressOverride, profileParam]);

  const profilePage = useSocialProofTokenPage({
    profileAddress,
    viewer: displayAddress,
    network: currentNetwork,
    enabled: Boolean(enabled && profileAddress && !isPost),
  });
  const postPage = usePostSptPage({
    viewer: displayAddress,
    postId: postIdOverride,
    network: currentNetwork,
    enabled: Boolean(enabled && isPost),
  });

  const mapped = useMemo(() => {
    if (isPost) return postPage.data ? mapPostSptPageToWorkspace(postPage.data) : null;
    return profilePage.data?.profile ? mapSocialProofTokenPageToWorkspace(profilePage.data) : null;
  }, [isPost, postPage.data, profilePage.data]);
  const error = isPost ? postPage.error : profilePage.error;
  const loading = isPost ? postPage.isLoading : profilePage.isLoading;
  const revalidate = isPost ? postPage.revalidate : profilePage.revalidate;

  const walletMysoAvailable = useMemo(
    () => primaryMysoBalanceFromProfileOverview(profileOverview),
    [profileOverview]
  );

  if (!enabled) return null;
  if (!explicitProfile && !isPost) return <SptMarketDirectory key={`${currentNetwork}:${displayAddress}`} />;
  if (loading && !mapped) {
    return <div className={tradeWorkspaceRouteLoadingClass}>Loading token…</div>;
  }
  if (error && !mapped) {
    return (
      <div className={cn(tradeWorkspaceRouteEmptyRootClass, 'gap-2')} role="alert">
        <p className="text-sm font-medium text-foreground">Could not load token</p>
        <p className="max-w-md text-sm text-destructive">{error}</p>
        <button type="button" onClick={revalidate} className="mt-2 rounded-md border border-trade-shell px-4 py-2 text-sm">Try again</button>
      </div>
    );
  }
  if (!mapped) return <TokenNotFound />;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between px-4 py-2 text-xs sm:px-6">
        <Link href="/trade/spt" className="text-muted-foreground hover:text-foreground">← All Social Proof Tokens</Link>
        <button type="button" onClick={revalidate} disabled={loading} className="text-muted-foreground hover:text-foreground disabled:opacity-50">{loading ? 'Refreshing…' : 'Refresh'}</button>
      </div>
      {error ? (
        <div
          className="shrink-0 border-b border-amber-500/35 bg-amber-500/10 px-4 py-2 text-center text-sm text-amber-950 dark:text-amber-100"
          role="status"
        >
          Partial data: {error}
        </div>
      ) : null}
      <TradeSocialProofTokenWorkspace
        key={`${currentNetwork}:${postIdOverride || profileAddress}:${displayAddress}`}
        token={mapped.token}
        creatorDisplayName={mapped.creatorDisplayName}
        profilePhotoUrl={mapped.profilePhotoUrl}
        coverPhotoUrl={mapped.coverPhotoUrl}
        websiteUrl={mapped.websiteUrl}
        reservationFillPercent={mapped.reservationFillPercent}
        profileRibbon={mapped.profileRibbon}
        trades={mapped.trades}
        reservations={mapped.reservations}
        formerReservations={mapped.formerReservations}
        holders={mapped.holders}
        chartSeries={mapped.chartSeries}
        priceLabel={mapped.priceLabel}
        changeLabel={mapped.changeLabel}
        tradingEnabled={mapped.tradingEnabled}
        reservationStatus={mapped.reservationStatus}
        reservationPoolId={mapped.reservationPoolId}
        reservationPoolAddress={mapped.reservationPoolAddress}
        hasLiveTradingPool={mapped.hasLiveTradingPool}
        maxIndividualReservationMyso={mapped.maxIndividualReservationMyso}
        maxIndividualReservationBaseUnits={mapped.maxIndividualReservationBaseUnits}
        usdPerMysoReservationQuote={mapped.usdPerMysoReservationQuote}
        walletMysoAvailable={walletMysoAvailable}
        sptIsActive={mapped.sptIsActive}
        reservationPlatformFeeBps={mapped.reservationPlatformFeeBps}
        reservationTreasuryFeeBps={mapped.reservationTreasuryFeeBps}
        reservationCreatorFeeBps={mapped.reservationCreatorFeeBps}
        tokenTypeCode={mapped.tokenTypeCode}
        ownerAddress={mapped.ownerAddress}
        subjectObjectId={mapped.subjectObjectId}
        livePoolId={mapped.livePoolId}
        creatorFeesUseVault={isPost && postPage.data?.chainState?.creatorFeesUseVault === true}
        hasIndexedVaultSettlements={isPost && Boolean(postPage.data?.livePool?.creatorFeeSettlements?.length)}
        totalReservedBaseUnits={mapped.totalReservedBaseUnits}
        requiredThresholdBaseUnits={mapped.requiredThresholdBaseUnits}
        currentSupplyBaseUnits={mapped.currentSupplyBaseUnits}
        basePriceBaseUnits={mapped.basePriceBaseUnits}
        quadraticCoefficient={mapped.quadraticCoefficient}
        tradingFeeBps={mapped.tradingFeeBps}
        maxHoldPercentBps={mapped.maxHoldPercentBps}
        reservationBalances={mapped.reservationBalances}
        onDataChanged={revalidate}
      />
    </div>
  );
}
