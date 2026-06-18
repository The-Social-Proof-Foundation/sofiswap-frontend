'use client';

import { TradeSocialProofTokenWorkspace } from '@/components/trade/trade-social-proof-token-workspace';
import type { GraphqlProfileOverviewData } from '@/hooks/useGraphqlProfileOverviewSWR';
import { useMySocialAuth } from '@/hooks/useMySocialAuth';
import { useSocialProofTokenPage } from '@/hooks/useSocialProofTokenPage';
import { fetchProfilePortfolioOverview } from '@/lib/graphql/profile-portfolio-overview';
import { getDefaultSptProfileAddress, getSofiSwapPlatformConfig } from '@/lib/platform-config';
import { useNetwork } from '@/lib/network-provider';
import { primaryMysoBalanceFromProfileOverview } from '@/lib/profile-overview-myso-balance';
import {
  effectivePoolIdFromPortfolioSpt,
  mapSocialProofTokenPageToWorkspace,
} from '@/lib/social-proof-token-map-workspace';
import {
  tradeWorkspaceRouteEmptyRootClass,
  tradeWorkspaceRouteLoadingClass,
} from '@/lib/trade-shell-styles';
import { cn } from '@/lib/utils';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

function SignInPrompt() {
  return (
    <div className={cn(tradeWorkspaceRouteEmptyRootClass, 'gap-3')} role="status">
      <p className="text-lg font-semibold text-foreground">Sign in to view Social Proof Tokens</p>
      <p className="max-w-md text-sm text-[var(--muted-foreground)]">
        Use the header to sign in, open <span className="font-mono">/trade/spt/0x…</span>, add{' '}
        <span className="font-mono">?profile=</span> to the URL, or set{' '}
        <span className="font-mono">NEXT_PUBLIC_DEFAULT_SPT_PROFILE_ADDRESS</span> for a default token
        view.
      </p>
    </div>
  );
}

function NoPoolPrompt({ message }: { message?: string | null }) {
  return (
    <div className={cn(tradeWorkspaceRouteEmptyRootClass, 'gap-2')} role="status">
      <p className="text-lg font-semibold text-foreground">No pool for this profile</p>
      <p className="max-w-md text-sm text-[var(--muted-foreground)]">
        {message ??
          'This profile does not have a social proof reservation or trading pool yet. Try another profile or add a pool id to the URL.'}
      </p>
    </div>
  );
}

function ConfigPrompt() {
  return (
    <div className={cn(tradeWorkspaceRouteEmptyRootClass, 'gap-2')} role="status">
      <p className="text-lg font-semibold text-foreground">Platform not configured</p>
      <p className="max-w-sm text-sm text-[var(--muted-foreground)]">
        GraphQL platform id is missing for this environment. Set{' '}
        <span className="font-mono">NEXT_PUBLIC_SOFISWAP_PLATFORM_ID</span> or tier-specific{' '}
        <span className="font-mono">*_MAINNET</span>/<span className="font-mono">*_TESTNET</span>
        /<span className="font-mono">*_LOCALNET</span> platform env vars (see{' '}
        <span className="font-mono">.env.example</span>
        ).
      </p>
    </div>
  );
}

export function TradeSocialProofTokenContainer({
  enabled,
  profileOverview,
  profileAddressOverride = null,
}: {
  enabled: boolean;
  profileOverview: GraphqlProfileOverviewData | null;
  /** From `/trade/spt/[wallet]`; wins over `?profile=`, signed-in wallet, and env default. */
  profileAddressOverride?: string | null;
}) {
  const searchParams = useSearchParams();
  const { currentNetwork } = useNetwork();
  const { isAuthenticated, displayAddress, isLoading: authLoading } = useMySocialAuth();

  const platformId = useMemo(
    () => getSofiSwapPlatformConfig(currentNetwork)?.platformGraphqlId ?? null,
    [currentNetwork]
  );

  const profileParam = searchParams.get('profile')?.trim() || null;
  const poolParam = searchParams.get('pool')?.trim() || null;

  const defaultSptProfileAddress = useMemo(() => getDefaultSptProfileAddress(), []);

  const explicitProfile = Boolean(profileAddressOverride?.trim() || profileParam);

  const profileAddress = useMemo(() => {
    if (profileAddressOverride?.trim()) return profileAddressOverride.trim();
    if (profileParam) return profileParam;
    if (isAuthenticated) {
      if (authLoading) return null;
      if (displayAddress?.trim()) return displayAddress.trim();
      return null;
    }
    if (defaultSptProfileAddress) return defaultSptProfileAddress;
    return null;
  }, [
    profileAddressOverride,
    profileParam,
    isAuthenticated,
    authLoading,
    displayAddress,
    defaultSptProfileAddress,
  ]);

  const [resolvedPoolId, setResolvedPoolId] = useState<string | null>(null);
  const [poolResolveError, setPoolResolveError] = useState<string | null>(null);
  const [poolResolving, setPoolResolving] = useState(false);

  useEffect(() => {
    if (!enabled || !platformId?.trim()) {
      setResolvedPoolId(null);
      setPoolResolveError(null);
      setPoolResolving(false);
      return;
    }

    if (!profileAddress?.trim()) {
      setResolvedPoolId(null);
      setPoolResolveError(null);
      setPoolResolving(false);
      return;
    }

    if (poolParam) {
      setResolvedPoolId(poolParam);
      setPoolResolveError(null);
      setPoolResolving(false);
      return;
    }

    const addr = profileAddress.trim();
    const overviewProfile = profileOverview?.profile ?? null;
    const selfProfile =
      overviewProfile?.address?.trim() === addr ? overviewProfile : null;

    if (selfProfile) {
      const id = effectivePoolIdFromPortfolioSpt(selfProfile.socialProofToken);
      setResolvedPoolId(id);
      setPoolResolveError(id ? null : 'no_pool');
      setPoolResolving(false);
      return;
    }

    let cancelled = false;
    setPoolResolving(true);
    setPoolResolveError(null);
    setResolvedPoolId(null);

    fetchProfilePortfolioOverview(addr, platformId, currentNetwork)
      .then((res) => {
        if (cancelled) return;
        if (res.errors?.length) {
          setPoolResolveError(res.errors.map((e) => e.message).join('; '));
          setResolvedPoolId(null);
          return;
        }
        const id = effectivePoolIdFromPortfolioSpt(res.profile?.socialProofToken);
        setResolvedPoolId(id);
        setPoolResolveError(id ? null : 'no_pool');
      })
      .catch((e) => {
        if (!cancelled) {
          setPoolResolveError(e instanceof Error ? e.message : 'Failed to resolve pool');
          setResolvedPoolId(null);
        }
      })
      .finally(() => {
        if (!cancelled) setPoolResolving(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, platformId, profileAddress, poolParam, profileOverview, currentNetwork]);

  const { data: sptPageData, error: sptPageError, isLoading: sptLoading } = useSocialProofTokenPage({
    profileAddress,
    poolId: resolvedPoolId,
    network: currentNetwork,
    enabled: Boolean(enabled && profileAddress && resolvedPoolId && platformId),
  });

  const mapped = useMemo(
    () => (sptPageData ? mapSocialProofTokenPageToWorkspace(sptPageData) : null),
    [sptPageData]
  );

  const walletMysoAvailable = useMemo(
    () => primaryMysoBalanceFromProfileOverview(profileOverview),
    [profileOverview]
  );

  if (!enabled) {
    return null;
  }

  if (!platformId) {
    return <ConfigPrompt />;
  }

  if (isAuthenticated && authLoading && !explicitProfile) {
    return <div className={tradeWorkspaceRouteLoadingClass}>Loading account…</div>;
  }

  if (!authLoading && !explicitProfile && !isAuthenticated && !defaultSptProfileAddress) {
    return <SignInPrompt />;
  }

  if (profileAddress && poolResolving) {
    return <div className={tradeWorkspaceRouteLoadingClass}>Resolving pool…</div>;
  }

  if (profileAddress && poolResolveError && !resolvedPoolId) {
    return <NoPoolPrompt message={poolResolveError === 'no_pool' ? null : poolResolveError} />;
  }

  if (profileAddress && !resolvedPoolId && !poolParam) {
    return <NoPoolPrompt />;
  }

  if (sptLoading && !mapped) {
    return <div className={tradeWorkspaceRouteLoadingClass}>Loading token…</div>;
  }

  if (sptPageError && !mapped) {
    return (
      <div className={cn(tradeWorkspaceRouteEmptyRootClass, 'gap-2')} role="alert">
        <p className="text-sm font-medium text-foreground">Could not load token</p>
        <p className="max-w-md text-sm text-destructive">{sptPageError}</p>
      </div>
    );
  }

  if (!mapped) {
    return <NoPoolPrompt />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {sptPageError ? (
        <div
          className={cn(
            'shrink-0 border-b border-amber-500/35 bg-amber-500/10 px-4 py-2 text-center text-sm text-amber-950 dark:text-amber-100'
          )}
          role="status"
        >
          Partial data: {sptPageError}
        </div>
      ) : null}
      <TradeSocialProofTokenWorkspace
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
        usdPerMysoReservationQuote={mapped.usdPerMysoReservationQuote}
        walletMysoAvailable={walletMysoAvailable}
        sptIsActive={mapped.sptIsActive}
        reservationPlatformFeeBps={mapped.reservationPlatformFeeBps}
        reservationTreasuryFeeBps={mapped.reservationTreasuryFeeBps}
        reservationCreatorFeeBps={mapped.reservationCreatorFeeBps}
      />
    </div>
  );
}
