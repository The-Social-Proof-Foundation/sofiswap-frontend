'use client';

/**
 * Order entry for the swap rail. Primary amount uses a transparent text input over
 * TextMorph so the caret and focus ring stay visible while digits morph on change.
 */

import { Button } from '@/components/ui/button';
import { useNetwork } from '@/lib/network-provider';
import { poolTickerForKey } from '@/lib/trade/trade-pool-catalog';
import { cn } from '@/lib/utils';
import { TextMorph } from 'torph/react';
import { useCallback, useId, useMemo, useState } from 'react';

export type TradeOrderSide = 'buy' | 'sell';
export type TradeOrderType = 'market' | 'limit';

const MOCK_PRICE_QUOTE_PER_BASE = 1.25;
/** Mock balances so % shortcuts are usable before wallet/indexer wiring. */
const AVAILABLE_QUOTE_MOCK = 10_000;
const AVAILABLE_BASE_MOCK = 50_000;

function sanitizeDecimalInput(raw: string): string {
  let s = raw.replace(/[^0-9.]/g, '');
  const i = s.indexOf('.');
  if (i !== -1) {
    s = `${s.slice(0, i + 1)}${s.slice(i + 1).replace(/\./g, '')}`;
  }
  if (s.startsWith('.')) s = `0${s}`;
  return s;
}

/** Display string for TextMorph; preserves trailing "." while typing. */
function formatMorphDecimal(raw: string): string {
  if (!raw) return '0.00';
  if (raw === '.') return '0.';
  if (raw.endsWith('.')) {
    const head = raw.slice(0, -1);
    const n = Number(head);
    if (!Number.isFinite(n)) return raw;
    return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 12 }).format(n)}.`;
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  }).format(n);
}

function parsePositiveNumber(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

type BigMorphNumericInputProps = {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  symbol: string;
  inputLabel: string;
};

function BigMorphNumericInput({
  id,
  label,
  value,
  onChange,
  symbol,
  inputLabel,
}: BigMorphNumericInputProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
        {label}
      </label>
      <div
        className={cn(
          'relative min-h-[4.5rem] rounded-xl border border-trade-shell bg-muted/60 px-3 py-2.5',
          'dark:bg-muted/35'
        )}
      >
        <div className="pointer-events-none flex min-h-[2.75rem] max-w-[calc(100%-4rem)] items-center">
          <TextMorph
            className="text-2xl font-semibold tabular-nums tracking-tight text-foreground"
            respectReducedMotion
          >
            {formatMorphDecimal(value)}
          </TextMorph>
        </div>
        <input
          id={id}
          value={value}
          inputMode="decimal"
          autoComplete="off"
          aria-label={inputLabel}
          className={cn(
            'absolute inset-0 z-[1] w-full cursor-text rounded-xl border-0 bg-transparent px-3 py-2.5',
            'text-2xl font-semibold tabular-nums tracking-tight text-transparent caret-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
          )}
          onChange={(e) => onChange(sanitizeDecimalInput(e.target.value))}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 z-[2] -translate-y-1/2 text-sm font-semibold text-[var(--muted-foreground)]">
          {symbol}
        </span>
      </div>
    </div>
  );
}

type ReadOnlyMorphRowProps = {
  label: string;
  valueStr: string;
  symbol: string;
};

function ReadOnlyMorphRow({ label, valueStr, symbol }: ReadOnlyMorphRowProps) {
  return (
    <div className="space-y-1.5">
      <span className="block text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">{label}</span>
      <div
        className={cn(
          'relative flex min-h-[3.75rem] items-center rounded-xl border border-trade-shell bg-muted/45 px-3 py-2.5',
          'dark:bg-muted/28'
        )}
      >
        <TextMorph
          className="max-w-[calc(100%-3.5rem)] text-xl font-semibold tabular-nums tracking-tight text-foreground/90"
          respectReducedMotion
        >
          {formatMorphDecimal(valueStr)}
        </TextMorph>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-[var(--muted-foreground)]">
          {symbol}
        </span>
      </div>
    </div>
  );
}

export type TradeOrderPanelProps = {
  poolName: string;
  side: TradeOrderSide;
  orderType: TradeOrderType;
  className?: string;
};

export function TradeOrderPanel({ poolName, side, orderType, className }: TradeOrderPanelProps) {
  const { currentNetwork } = useNetwork();
  const { baseSymbol, quoteSymbol } = useMemo(() => {
    const t = poolTickerForKey(currentNetwork, poolName);
    return { baseSymbol: t.base, quoteSymbol: t.quote };
  }, [currentNetwork, poolName]);
  const baseId = useId();
  const amountInputId = `${baseId}-amount`;
  const priceInputId = `${baseId}-price`;

  const [amount, setAmount] = useState('0');
  const [limitPrice, setLimitPrice] = useState(() => String(MOCK_PRICE_QUOTE_PER_BASE));

  const amountNum = parsePositiveNumber(amount);
  const limitPriceNum = parsePositiveNumber(limitPrice);

  const spendSymbol = side === 'buy' ? quoteSymbol : baseSymbol;
  const availableMock = side === 'buy' ? AVAILABLE_QUOTE_MOCK : AVAILABLE_BASE_MOCK;

  const applyPercent = useCallback(
    (pct: number) => {
      if (availableMock <= 0) return;
      const v = availableMock * (pct / 100);
      const s = v >= 1 ? v.toFixed(6).replace(/\.?0+$/, '') : v.toFixed(8).replace(/\.?0+$/, '');
      setAmount(s);
    },
    [availableMock]
  );

  /** Market: estimated asset received. Limit: same formula using limit price. */
  const effectivePrice =
    orderType === 'market' ? MOCK_PRICE_QUOTE_PER_BASE : limitPriceNum > 0 ? limitPriceNum : MOCK_PRICE_QUOTE_PER_BASE;

  const estimatedReceiveStr = useMemo(() => {
    if (amountNum <= 0 || effectivePrice <= 0) return '0';
    if (side === 'buy') {
      const base = amountNum / effectivePrice;
      return base.toFixed(8).replace(/\.?0+$/, '') || '0';
    }
    const quote = amountNum * effectivePrice;
    return quote.toFixed(6).replace(/\.?0+$/, '') || '0';
  }, [amountNum, effectivePrice, side]);

  const estReceiveSymbol = side === 'buy' ? baseSymbol : quoteSymbol;

  const limitTotalLine = useMemo(() => {
    if (orderType !== 'limit' || amountNum <= 0 || limitPriceNum <= 0) return '—';
    if (side === 'buy') {
      return `${formatMorphDecimal(amount)} ${quoteSymbol}`;
    }
    const quote = amountNum * limitPriceNum;
    const formatted = new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 }).format(quote);
    return `${formatted} ${quoteSymbol}`;
  }, [orderType, amountNum, limitPriceNum, side, amount, quoteSymbol]);

  const pctDisabled = availableMock <= 0;

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-3', className)}>
      <div className="mb-3 flex items-start justify-between gap-2 text-[11px] text-[var(--muted-foreground)]">
        <span>
          Available{' '}
          <span className="font-medium text-foreground/80">
            ({spendSymbol})
          </span>
        </span>
        <span className="tabular-nums font-medium text-foreground">
          {new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 }).format(availableMock)}
        </span>
      </div>

      {orderType === 'limit' ? (
        <BigMorphNumericInput
          id={priceInputId}
          label="Limit price"
          value={limitPrice}
          onChange={setLimitPrice}
          symbol={quoteSymbol}
          inputLabel={`Limit price in ${quoteSymbol} per ${baseSymbol}`}
        />
      ) : null}

      <div className={orderType === 'limit' ? 'mt-3' : ''}>
        <BigMorphNumericInput
          id={amountInputId}
          label="Amount"
          value={amount}
          onChange={setAmount}
          symbol={spendSymbol}
          inputLabel={`Order amount in ${spendSymbol}`}
        />
      </div>

      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {[25, 50, 75, 100].map((pct) => (
          <Button
            key={pct}
            type="button"
            variant="outline"
            size="sm"
            disabled={pctDisabled}
            className="h-9 rounded-lg px-0 text-[11px] font-semibold"
            onClick={() => applyPercent(pct)}
          >
            {pct}%
          </Button>
        ))}
      </div>

      {orderType === 'market' ? (
        <div className="mt-4">
          <ReadOnlyMorphRow label="Estimated output" valueStr={estimatedReceiveStr} symbol={estReceiveSymbol} />
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          <ReadOnlyMorphRow label="Estimated fill" valueStr={estimatedReceiveStr} symbol={estReceiveSymbol} />
          <div className="flex items-center justify-between border-t border-trade-shell/80 pt-2 text-xs">
            <span className="border-b border-dotted border-muted-foreground/60 font-medium text-[var(--muted-foreground)]">
              Total
            </span>
            <span className="font-semibold tabular-nums text-foreground">{limitTotalLine}</span>
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between text-xs">
        <span className="border-b border-dotted border-muted-foreground/60 text-[var(--muted-foreground)]">Max fee</span>
        <span className="tabular-nums text-[var(--muted-foreground)]">— {quoteSymbol}</span>
      </div>

      <div className="mt-5">
        <Button
          type="button"
          className={cn(
            'h-12 w-full rounded-xl text-base font-bold hover:opacity-90',
            side === 'buy'
              ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
              : 'bg-[var(--destructive)] text-[var(--destructive-foreground)]'
          )}
        >
          {side === 'buy' ? 'Buy' : 'Sell'} {baseSymbol}
        </Button>
        <p className="mt-2 text-center text-xs leading-snug text-[var(--muted-foreground)]">
          Estimates use a mock price until live quotes are connected.
        </p>
      </div>
    </div>
  );
}
