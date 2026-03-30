import { TradePageShell } from '@/components/trade/trade-page-shell';
import { mySoAddressFromString } from '@/lib/mysocial-oauth-utils';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

type PageProps = {
  params: Promise<{ wallet: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { wallet } = await params;
  const addr = mySoAddressFromString(wallet);
  const short = addr && addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : (addr ?? 'Profile');
  return {
    title: `SPT ${short} — SofiSwap`,
    description: 'Social proof token profile on SofiSwap.',
  };
}

export default async function TradeSptWalletPage({ params }: PageProps) {
  const { wallet } = await params;
  if (!mySoAddressFromString(wallet)) {
    notFound();
  }

  return (
    <Suspense fallback={null}>
      <TradePageShell />
    </Suspense>
  );
}
