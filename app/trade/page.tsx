'use client';

import { Footer } from '@/components/footer';
import { TradePlatformAccessGate } from '@/components/trade/trade-platform-access-gate';
import { TradeTopNav } from '@/components/trade/trade-top-nav';
import { useGraphqlProfileOverviewSWR } from '@/hooks/useGraphqlProfileOverviewSWR';
import { useMySocialAuth } from '@/hooks/useMySocialAuth';
import { useNetwork } from '@/lib/network-provider';
import { getSofiSwapPlatformConfig } from '@/lib/platform-config';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo } from 'react';

/** Subscribes to profile overview SWR (cache + GraphQL); logs from the hook. Renders nothing. */
function TradeProfileOverviewSubscription() {
  const { currentNetwork } = useNetwork();
  const { displayAddress, isAuthenticated, isLoading } = useMySocialAuth();
  const platformId = useMemo(() => getSofiSwapPlatformConfig()?.platformGraphqlId ?? null, []);
  const address = isAuthenticated && !isLoading ? displayAddress : null;
  useGraphqlProfileOverviewSWR(address, platformId, currentNetwork);
  return null;
}

function TradeAuthMessage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const error = searchParams.get('error');

  useEffect(() => {
    if (!error) return;
    const t = window.setTimeout(() => {
      router.replace('/trade');
    }, 8000);
    return () => window.clearTimeout(t);
  }, [error, router]);

  if (error === 'rate_limit') {
    return (
      <div
        role="status"
        className="mb-6 rounded-lg border border-secondary/60 bg-muted/40 px-4 py-3 text-sm text-foreground"
      >
        Too many refresh attempts. Please wait a moment and try signing in again.
      </div>
    );
  }
  if (error === 'auth_failed') {
    return (
      <div
        role="status"
        className="mb-6 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-foreground"
      >
        Sign-in could not be completed. Try again from Get started.
      </div>
    );
  }
  return null;
}

export default function TradePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background font-sans text-foreground">
      <TradeTopNav />
      <TradeProfileOverviewSubscription />
      <TradePlatformAccessGate />
      <main className="mx-auto flex w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
        <Suspense fallback={null}>
          <TradeAuthMessage />
        </Suspense>
        <p className="max-w-2xl text-muted-foreground">
          Trading interface coming soon.
        </p>
      </main>
      <Footer />
    </div>
  );
}
