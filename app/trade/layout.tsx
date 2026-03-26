import { TradeMarketTicker } from '@/components/trade/trade-market-ticker';
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
  return (
    <div className="trade-viewport-shell flex min-h-0 w-full flex-col overflow-hidden bg-background">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
      <TradeMarketTicker />
    </div>
  );
}
