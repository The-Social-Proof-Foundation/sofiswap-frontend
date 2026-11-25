import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';

const TradeMarketTicker = dynamic(() =>
  import('@/components/trade/trade-market-ticker').then((mod) => mod.TradeMarketTicker)
);

export const metadata: Metadata = {
  title: 'Trade — SofiSwap',
  description: 'Trade on SofiSwap — decentralized exchange on MySocial.',
};

export default function TradeLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="trade-viewport-shell flex min-h-0 w-full flex-col overflow-hidden bg-background">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
      <TradeMarketTicker />
    </div>
  );
}
