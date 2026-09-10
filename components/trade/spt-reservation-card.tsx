'use client';

import { useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { baseUnitsToDisplay, feeFromBps, parseDisplayAmountToBaseUnits } from '@/lib/spt/amounts';
import { tradeSptTallCardReserveClass } from '@/lib/trade-shell-styles';
import { cn } from '@/lib/utils';

export function SptReservationCard({
  walletAvailable, reservationAvailable, reservationLimit, feeBps, isAuthenticated, isBusy,
  onReserve, onWithdraw, className,
}: {
  walletAvailable: bigint;
  reservationAvailable: bigint;
  reservationLimit: bigint;
  feeBps: bigint;
  isAuthenticated: boolean;
  isBusy: boolean;
  onReserve: (amount: string) => Promise<boolean>;
  onWithdraw: (amount: string) => Promise<boolean>;
  className?: string;
}) {
  const [mode, setMode] = useState<'reserve' | 'withdraw'>('reserve');
  const [draft, setDraft] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);
  const confirmTimer = useRef(0);
  const amount = parseDisplayAmountToBaseUnits(draft);
  const principal = amount ?? BigInt(0);
  const fee = feeFromBps(principal, feeBps);
  const walletMax = walletAvailable * BigInt(10_000) / (BigInt(10_000) + feeBps);
  const remaining = reservationLimit > reservationAvailable ? reservationLimit - reservationAvailable : BigInt(0);
  const maximum = mode === 'withdraw' ? reservationAvailable : walletMax < remaining ? walletMax : remaining;
  const error = !draft ? null : amount == null ? 'Enter a MySo amount with up to 9 decimal places.'
    : principal <= BigInt(0) ? 'Enter an amount greater than zero.'
    : principal > maximum ? mode === 'withdraw' ? 'Amount exceeds your reservation.' : 'Amount exceeds your available balance or reservation limit.'
    : null;
  const total = mode === 'reserve' ? principal + fee : principal - fee;
  const valid = amount != null && principal > BigInt(0) && !error && total > BigInt(0);
  return (
    <div className={cn(tradeSptTallCardReserveClass, className)}>
      <div className="flex rounded-full bg-background/45 p-1 text-xs font-semibold" role="group" aria-label="Reservation action">
        {(['reserve', 'withdraw'] as const).map((value) => (
          <button key={value} type="button" disabled={isBusy} aria-pressed={mode === value}
            onClick={() => { setMode(value); setDraft(''); setConfirm(null); }}
            className={cn('flex-1 rounded-full px-3 py-2 capitalize focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring', mode === value ? 'bg-foreground text-background' : 'text-muted-foreground')}>
            {value === 'reserve' ? 'Reserve' : 'Withdraw reserve'}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        <label htmlFor="spt-reservation-amount" className="text-xs text-muted-foreground">{mode === 'reserve' ? 'Add to your reservation' : 'Remove from your reservation'}</label>
        <div className="flex items-baseline gap-2">
          <input id="spt-reservation-amount" type="text" inputMode="decimal" autoComplete="off" placeholder="0"
            value={draft} disabled={isBusy} maxLength={32} onChange={(event) => setDraft(event.target.value)}
            aria-invalid={Boolean(error)} aria-describedby="spt-reservation-feedback"
            className="min-w-0 flex-1 rounded-md bg-transparent text-3xl font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          <span className="text-sm font-medium text-muted-foreground">MySo</span>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Amount presets">
          {[25, 50, 75, 100].map((percent) => (
            <button type="button" key={percent} disabled={isBusy || maximum <= BigInt(0)}
              onClick={() => setDraft(baseUnitsToDisplay(maximum * BigInt(percent) / BigInt(100), 9))}
              className="rounded-full bg-background/45 px-3 py-1.5 text-xs font-semibold hover:bg-background/70 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
              {percent === 100 ? 'Max' : `${percent}%`}
            </button>
          ))}
        </div>
        <p className="text-xs tabular-nums text-muted-foreground">Reserved: {baseUnitsToDisplay(reservationAvailable, 9)} MySo</p>
        <p id="spt-reservation-feedback" aria-live="polite" className={cn('text-xs', error ? 'text-destructive' : 'text-muted-foreground')}>
          {error || `${baseUnitsToDisplay(maximum, 9)} MySo available to ${mode}.`}
        </p>
      </div>
      <dl className="space-y-2 rounded-xl border border-trade-shell bg-background/30 p-3 text-xs">
        <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Reservation fee ({Number(feeBps) / 100}%)</dt><dd className="tabular-nums">{baseUnitsToDisplay(fee, 9)} MySo</dd></div>
        <div className="flex justify-between gap-3 border-t border-trade-shell pt-2"><dt>{mode === 'reserve' ? 'Total payment' : 'You receive'}</dt><dd className="font-semibold tabular-nums">{baseUnitsToDisplay(total > BigInt(0) ? total : BigInt(0), 9)} MySo</dd></div>
      </dl>
      <p className="text-xs leading-relaxed text-muted-foreground">Network gas is additional. Reservation fees apply when adding or withdrawing funds. After launch, your reservation becomes SPT.</p>
      {confirm ? (
        <p role="status" className="rounded-xl border border-primary/25 bg-primary/10 px-3 py-2 text-xs font-medium text-foreground">
          {confirm}
        </p>
      ) : null}
      <Button type="button" disabled={isBusy || !isAuthenticated || !valid} className="h-12 w-full rounded-2xl font-semibold"
        onClick={() => {
          if (!valid || isBusy) return;
          const action = mode;
          const display = draft;
          void (action === 'reserve' ? onReserve(display) : onWithdraw(display)).then((success) => {
            if (!success) return;
            setDraft('');
            setConfirm(
              action === 'reserve'
                ? `Reserved ${display} MySo on-chain.`
                : `Withdrew ${display} MySo on-chain.`
            );
            window.clearTimeout(confirmTimer.current);
            confirmTimer.current = window.setTimeout(() => setConfirm(null), 6_000);
          });
        }}>
        {isBusy ? <><Loader2 className="mr-2 size-4 animate-spin" />Submitting…</>
          : !isAuthenticated ? 'Sign in to continue' : mode === 'reserve' ? 'Reserve MySo' : 'Withdraw reserve'}
      </Button>
    </div>
  );
}
