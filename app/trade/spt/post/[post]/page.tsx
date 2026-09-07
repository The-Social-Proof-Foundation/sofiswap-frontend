import type { Metadata } from 'next';

import { mySoAddressFromString } from '@/lib/mysocial-oauth-utils';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { TradePageShell } from '@/components/trade/trade-page-shell';

export const metadata: Metadata = {
  title: 'Post Social Proof Token | SofiSwap',
  description: 'Reserve or trade a post Social Proof Token on SofiSwap.',
};

export default async function PostSptPage({
  params,
}: {
  params: Promise<{ post: string }>;
}) {
  const { post } = await params;
  if (!mySoAddressFromString(post)) notFound();
  return (
    <Suspense fallback={null}>
      <TradePageShell />
    </Suspense>
  );
}
