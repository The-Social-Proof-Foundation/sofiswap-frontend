'use client';

import { TradeTopNav } from '@/components/trade/trade-top-nav';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';

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
    <div className="min-h-screen bg-background font-sans text-foreground">
      <TradeTopNav />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <Suspense fallback={null}>
          <TradeAuthMessage />
        </Suspense>
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-foreground md:text-4xl">
          Trade
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          Trading interface coming soon. Use Get started to connect with MySocial
          auth.
        </p>
      </main>
    </div>
  );
}
