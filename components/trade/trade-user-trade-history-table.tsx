'use client';

import { cn } from '@/lib/utils';
import type { UserTradeHistoryRow } from '@/lib/trade/activity-tables';

const th = 'text-left text-[10px] font-medium text-muted-foreground whitespace-nowrap';
const td = 'py-2 text-xs tabular-nums text-foreground';

export function TradeUserTradeHistoryTable({
  rows,
  className,
}: {
  rows: UserTradeHistoryRow[];
  className?: string;
}) {
  if (rows.length === 0) return null;

  return (
    <div className={cn('min-h-0 min-w-0 overflow-x-auto', className)}>
      <table className="w-full min-w-[960px] border-collapse text-left">
        <thead>
          <tr className="border-b border-trade-shell">
            <th className={cn(th, 'w-1 py-2 pl-0 pr-0')} aria-hidden />
            <th className={cn(th, 'py-2 pr-3')}>Market</th>
            <th className={cn(th, 'py-2 pr-3')}>Time</th>
            <th className={cn(th, 'py-2 pr-3')}>Side</th>
            <th className={cn(th, 'py-2 pr-3')}>Role</th>
            <th className={cn(th, 'py-2 pr-3 text-right')}>Price</th>
            <th className={cn(th, 'py-2 pr-3 text-right')}>Fee</th>
            <th className={cn(th, 'py-2 pr-3')}>Fee Type</th>
            <th className={cn(th, 'py-2 pr-3 text-right')}>Base Volume</th>
            <th className={cn(th, 'py-2 pr-3 text-right')}>Quote Volume</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-trade-shell">
              <td className="w-1 py-0 pl-0 pr-1 align-middle" aria-hidden>
                <span
                  className={cn(
                    'block w-0.5 min-h-[2rem] rounded-full',
                    row.side === 'buy' ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-rose-500 dark:bg-rose-400'
                  )}
                />
              </td>
              <td className={cn(td, 'pr-3')}>{row.market}</td>
              <td className={cn(td, 'pr-3 whitespace-nowrap')}>{row.time}</td>
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
              <td className={cn(td, 'pr-3')}>{row.role}</td>
              <td className={cn(td, 'pr-3 text-right')}>{row.price}</td>
              <td className={cn(td, 'pr-3 text-right')}>{row.fee}</td>
              <td className={cn(td, 'pr-3')}>{row.feeType}</td>
              <td className={cn(td, 'pr-3 text-right')}>{row.baseVolume}</td>
              <td className={cn(td, 'pr-3 text-right')}>{row.quoteVolume}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
