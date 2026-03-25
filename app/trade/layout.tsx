import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Trade — SofiSwap',
  description: 'Trade on SofiSwap — decentralized exchange on MySocial.',
};

export default function TradeLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
