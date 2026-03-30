import { TradePageShell } from '@/components/trade/trade-page-shell';
import { Suspense } from 'react';

export default function TradeSptPage() {
  return (
    <Suspense fallback={null}>
      <TradePageShell />
    </Suspense>
  );
}
