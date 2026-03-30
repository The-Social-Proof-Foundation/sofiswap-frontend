'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { OpenOrderRow } from '@/lib/trade/activity-tables';

const th = 'text-left text-[10px] font-medium text-[var(--muted-foreground)] whitespace-nowrap';
const td = 'py-2 text-xs tabular-nums text-foreground';

export function TradeOpenOrdersTable({
  rows,
  className,
  onCancelOrder,
  cancelingOrderId,
}: {
  rows: OpenOrderRow[];
  className?: string;
  onCancelOrder?: (orderId: string) => void;
  cancelingOrderId?: string | null;
}) {
  if (rows.length === 0) return null;

  return (
    <div className={cn('min-h-0 min-w-0 overflow-x-auto', className)}>
      <table className="w-full min-w-[720px] border-collapse text-left">
        <thead>
          <tr className="border-b border-trade-shell">
            <th className={cn(th, 'py-2 pr-3')}>Market</th>
            <th className={cn(th, 'py-2 pr-3')}>Side</th>
            <th className={cn(th, 'py-2 pr-3 text-right')}>Price</th>
            <th className={cn(th, 'py-2 pr-3 text-right')}>Quantity</th>
            <th className={cn(th, 'py-2 pr-3 text-right')}>Filled</th>
            <th className={cn(th, 'py-2 text-right')}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-trade-shell">
              <td className={cn(td, 'pr-3')}>{row.market}</td>
              <td
                className={cn(
                  'py-2 pr-3 text-xs font-medium',
                  row.side === 'buy'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-500 dark:text-rose-400'
                )}
              >
                {row.side === 'buy' ? 'BUY' : 'SELL'}
              </td>
              <td className={cn(td, 'pr-3 text-right')}>{row.price}</td>
              <td className={cn(td, 'pr-3 text-right')}>{row.quantity}</td>
              <td className={cn(td, 'pr-3 text-right')}>{row.filled}</td>
              <td className={cn(td, 'text-right')}>
                {onCancelOrder ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs font-semibold text-rose-600 hover:bg-rose-500/10 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-300"
                    disabled={cancelingOrderId === row.id}
                    onClick={() => onCancelOrder(row.id)}
                  >
                    {cancelingOrderId === row.id ? 'Canceling…' : 'Cancel'}
                  </Button>
                ) : (
                  <span className="text-[var(--muted-foreground)]">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
