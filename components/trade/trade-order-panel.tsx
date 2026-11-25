'use client';

/**
 * Order entry for the swap rail. Primary amount uses a transparent text input over
 * TextMorph so the caret and focus ring stay visible while digits morph on change.
 */

import { Button } from '@/components/ui/button';
import { useNetwork } from '@/lib/network-provider';
import { poolTickerForKey, spotAssetSymbolDisplay } from '@/lib/trade/trade-pool-catalog';
import {
  validateOrderForSubmission,
  orderBaseQuantity,
  type OrderKind,
  type OrderSide,
  type PoolBookConstraints,
} from '@/lib/trade/order-placement-utils';
import { tradeDownFillClass, tradeUpFillClass } from '@/lib/trade-shell-styles';
import { cn } from '@/lib/utils';
import { TextMorph } from 'torph/react';
import { useCallback, useId, useMemo, useState } from 'react';

export type TradeOrderSide = OrderSide;
export type TradeOrderType = OrderKind;

function sanitizeDecimalInput(raw: string): string {
  let s = raw.replace(/[^0-9.]/g, '');
  const i = s.indexOf('.');
  if (i !== -1) {
    s = `${s.slice(0, i + 1)}${s.slice(i + 1).replace(/\./g, '')}`;
  }
  if (s.startsWith('.')) s = `0${s}`;
  return s;
}

/**
 * Text used to seed the limit-price field. `String(value)` switches to exponent notation
 * below 1e-6 ("1e-7"), which `sanitizeDecimalInput` then collapses to "17" on the next
 * keystroke — so expand it into plain decimal first.
 */
function seedPriceText(value: number | null): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return '0';
  const plain = String(value);
  if (!plain.includes('e') && !plain.includes('E')) return plain;
  const decimals = Math.min(18, Math.max(0, -Math.floor(Math.log10(value)) + 6));
  return value.toFixed(decimals).replace(/0+$/, '').replace(/\.$/, '');
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

const sideToggleClass = cn(
  'h-9 rounded-md text-[13px] font-semibold tracking-wide transition-colors',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
  'active:brightness-95 disabled:pointer-events-none disabled:opacity-50'
);

/** Filled even when the other side is selected, so neither control reads as an empty outline. */
const buyRestClass = cn(
  'bg-[#2f4a38] text-[#e7f6e9] hover:bg-[#3a5c46] active:bg-[#284232] focus-visible:ring-[#3d6b48]',
  'dark:bg-[#3d6b48] dark:text-[#e7f6e9] dark:hover:bg-[#4a7d56] dark:active:bg-[#345c3e] dark:focus-visible:ring-[#9AE19D]'
);
const buySelectedClass = cn(
  'bg-[#3d6b48] text-[#f3faf4] hover:bg-[#4a7d56] active:bg-[#2f4a38] focus-visible:ring-[#3d6b48]',
  'dark:bg-[#9AE19D] dark:text-[#1c2820] dark:hover:bg-[#b7ebba] dark:active:bg-[#86d48a] dark:focus-visible:ring-[#9AE19D]'
);
const sellRestClass = cn(
  'bg-[#9a3a36] text-[#fde8e6] hover:bg-[#b0443f] active:bg-[#8a312d] focus-visible:ring-[#DC2626]',
  'dark:bg-[#a34a45] dark:text-[#fde8e6] dark:hover:bg-[#c45a54] dark:active:bg-[#8f3f3b] dark:focus-visible:ring-[#f07167]'
);
const sellSelectedClass = cn(
  'bg-[#DC2626] text-white hover:bg-[#ef4444] active:bg-[#b91c1c] focus-visible:ring-[#DC2626]',
  'dark:bg-[#f07167] dark:text-[#2a1210] dark:hover:bg-[#f58b83] dark:active:bg-[#e15d52] dark:focus-visible:ring-[#f07167]'
);

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
  const amount = Number(value);
  const isPlaceholder = !value || !Number.isFinite(amount) || amount === 0;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-medium text-[#1c2820] dark:text-[#e8ece9]">
        {label}
      </label>
      <div className="relative h-16 rounded-md bg-muted/20 focus-within:bg-muted/30">
        <div className="pointer-events-none flex h-full max-w-[calc(100%-4.5rem)] items-center px-3">
          <TextMorph
            className={cn(
              'text-3xl font-semibold tabular-nums tracking-tight',
              isPlaceholder ? 'text-[#8b908e] dark:text-[#9a9e9c]' : 'text-[#1c2820] dark:text-[#e8ece9]'
            )}
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
            'absolute inset-0 z-[1] w-full cursor-text border-0 bg-transparent px-3',
            'text-3xl font-semibold tabular-nums tracking-tight text-transparent',
            'caret-[#1c2820] dark:caret-[#e8ece9]',
            'focus-visible:outline-none focus-visible:ring-0'
          )}
          onChange={(e) => onChange(sanitizeDecimalInput(e.target.value))}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 z-[2] -translate-y-1/2 text-sm font-semibold text-[#1c2820]/70 dark:text-[#e8ece9]/70">
          {symbol}
        </span>
      </div>
    </div>
  );
}

function TicketRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate text-right font-medium tabular-nums text-foreground">{value}</span>
    </div>
  );
}

export type SubmitOrderInput = {
  side: TradeOrderSide;
  orderType: TradeOrderType;
  amount: number;
  limitPrice?: number;
};

export type TradeOrderPanelProps = {
  poolName: string;
  side: TradeOrderSide;
  onSideChange?: (side: TradeOrderSide) => void;
  orderType: TradeOrderType;
  /** Live mid price (quote per base); used to default the limit price. */
  midPrice: number | null;
  bestBid: number | null;
  bestAsk: number | null;
  baseBalance: number | null;
  quoteBalance: number | null;
  bookParams: PoolBookConstraints | null;
  /** Taker fee as a fraction (e.g. 0.001 = 0.1%). */
  takerFee: number | null;
  isSubmitting: boolean;
  /**
   * Failure from a data source that gates order entry (book, chain params or balances).
   * Shown explicitly so a disabled Buy/Sell button always explains itself.
   */
  dataError?: string | null;
  onRetryData?: () => void;
  onSubmitOrder: (input: SubmitOrderInput) => void;
  className?: string;
};

export function TradeOrderPanel({
  poolName,
  side,
  onSideChange,
  orderType,
  midPrice,
  bestBid,
  bestAsk,
  baseBalance,
  quoteBalance,
  bookParams,
  takerFee,
  isSubmitting,
  dataError,
  onRetryData,
  onSubmitOrder,
  className,
}: TradeOrderPanelProps) {
  const { currentNetwork } = useNetwork();
  const { baseSymbol, quoteSymbol } = useMemo(() => {
    const t = poolTickerForKey(currentNetwork, poolName);
    return {
      baseSymbol: spotAssetSymbolDisplay(t.base),
      quoteSymbol: spotAssetSymbolDisplay(t.quote),
    };
  }, [currentNetwork, poolName]);
  const baseId = useId();
  const amountInputId = `${baseId}-amount`;
  const priceInputId = `${baseId}-price`;

  const [amount, setAmount] = useState('0');
  const [limitPrice, setLimitPrice] = useState(() => seedPriceText(midPrice));
  /**
   * True once the trader has edited the price themselves. The book polls every ~2.5s and
   * mid moves on any fill, so re-seeding on every mid change overwrote a typed limit price
   * mid-entry and could submit at the market mid instead of the intended price. Seed on a
   * change of subject (pool/network) or while the field is still untouched — never after.
   */
  const [priceTouched, setPriceTouched] = useState(false);
  const [lastSeededPool, setLastSeededPool] = useState(`${currentNetwork}:${poolName}`);

  const poolIdentity = `${currentNetwork}:${poolName}`;
  if (poolIdentity !== lastSeededPool) {
    setLastSeededPool(poolIdentity);
    setPriceTouched(false);
    setLimitPrice(seedPriceText(midPrice));
  } else if (!priceTouched) {
    const seeded = seedPriceText(midPrice);
    if (seeded !== limitPrice) setLimitPrice(seeded);
  }

  const onPriceChange = useCallback((next: string) => {
    setPriceTouched(true);
    setLimitPrice(next);
  }, []);

  const amountNum = parsePositiveNumber(amount);
  const limitPriceNum = parsePositiveNumber(limitPrice);

  const spendSymbol = side === 'buy' ? quoteSymbol : baseSymbol;
  const available = side === 'buy' ? (quoteBalance ?? 0) : (baseBalance ?? 0);

  const applyPercent = useCallback(
    (pct: number) => {
      if (available <= 0) return;
      const v = available * (pct / 100);
      const s = v >= 1 ? v.toFixed(6).replace(/\.?0+$/, '') : v.toFixed(8).replace(/\.?0+$/, '');
      setAmount(s);
    },
    [available]
  );

  /** Market: estimated asset received using best bid/ask. Limit: uses limit price. */
  const effectivePrice =
    orderType === 'market'
      ? side === 'buy'
        ? (bestAsk ?? midPrice ?? 0)
        : (bestBid ?? midPrice ?? 0)
      : limitPriceNum > 0
        ? limitPriceNum
        : (midPrice ?? 0);

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

  const pctDisabled = available <= 0;

  const validation = useMemo(
    () =>
      validateOrderForSubmission(
        { side, orderType, amount: orderBaseQuantity(side, amountNum, effectivePrice), limitPrice: limitPriceNum || undefined },
        { bookParams, baseBalance, quoteBalance, midPrice, bestBid, bestAsk }
      ),
    [side, orderType, amountNum, effectivePrice, limitPriceNum, bookParams, baseBalance, quoteBalance, midPrice, bestBid, bestAsk]
  );

  const canSubmit = !isSubmitting && validation.ok && amountNum > 0 && bookParams != null &&
    (side === 'buy' ? quoteBalance != null : baseBalance != null) && effectivePrice > 0;

  const handleSubmit = useCallback(() => {
    if (!canSubmit || !validation.ok) return;
    onSubmitOrder({
      side,
      orderType,
      amount: validation.roundedQuantity,
      limitPrice: orderType === 'limit' ? validation.roundedPrice : undefined,
    });
  }, [canSubmit, validation, onSubmitOrder, side, orderType]);

  const feeDisplay = useMemo(() => {
    if (takerFee == null) return '—';
    return `${(takerFee * 100).toFixed(4)}%`;
  }, [takerFee]);

  const youPay =
    amountNum > 0
      ? `${formatMorphDecimal(amount)} ${spendSymbol}`
      : '—';
  const youReceive =
    amountNum > 0 && effectivePrice > 0
      ? `${formatMorphDecimal(estimatedReceiveStr)} ${estReceiveSymbol}`
      : '—';

  const submitLabel = isSubmitting
    ? 'Submitting…'
    : `${side === 'buy' ? 'Buy' : 'Sell'} ${baseSymbol}`;

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-3', className)}>
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Buy or sell">
        <button
          type="button"
          onClick={() => onSideChange?.('buy')}
          aria-pressed={side === 'buy'}
          className={cn(sideToggleClass, side === 'buy' ? buySelectedClass : buyRestClass)}
        >
          Buy
        </button>
        <button
          type="button"
          onClick={() => onSideChange?.('sell')}
          aria-pressed={side === 'sell'}
          className={cn(sideToggleClass, side === 'sell' ? sellSelectedClass : sellRestClass)}
        >
          Sell
        </button>
      </div>

      <div className="mb-3 mt-3 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>Trade balance</span>
        <span className="tabular-nums font-medium text-foreground">
          {available > 0
            ? `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 }).format(available)} ${spendSymbol}`
            : `0 ${spendSymbol}`}
        </span>
      </div>

      {orderType === 'limit' ? (
        <BigMorphNumericInput
          id={priceInputId}
          label="Limit price"
          value={limitPrice}
          onChange={onPriceChange}
          symbol={quoteSymbol}
          inputLabel={`Limit price in ${quoteSymbol} per ${baseSymbol}`}
        />
      ) : null}

      <div className={orderType === 'limit' ? 'mt-3' : ''}>
        <BigMorphNumericInput
          id={amountInputId}
          label="Size"
          value={amount}
          onChange={setAmount}
          symbol={spendSymbol}
          inputLabel={`Order size in ${spendSymbol}`}
        />
      </div>

      <div className="mt-2 grid grid-cols-5 gap-1">
        {[0, 25, 50, 75, 100].map((pct) => (
          <Button
            key={pct}
            type="button"
            variant="outline"
            size="sm"
            disabled={pct !== 0 && pctDisabled}
            className="h-7 rounded-md border-trade-shell bg-transparent px-0 text-[11px] font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            onClick={() => (pct === 0 ? setAmount('0') : applyPercent(pct))}
          >
            {pct === 100 ? 'Max' : `${pct}%`}
          </Button>
        ))}
      </div>

      <div className="mt-4 space-y-2 border-t border-trade-shell pt-3">
        <TicketRow label="You pay" value={youPay} />
        <TicketRow label="You receive" value={youReceive} />
        {orderType === 'limit' ? <TicketRow label="Total" value={limitTotalLine} /> : null}
        <TicketRow label="Taker fee" value={feeDisplay} />
      </div>

      {!validation.ok && amountNum > 0 ? (
        <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {validation.error}
        </p>
      ) : null}

      {dataError ? (
        <div
          role="alert"
          className="mt-3 flex items-start justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2"
        >
          <p className="min-w-0 break-words text-xs leading-relaxed text-destructive">
            {dataError}
          </p>
          {onRetryData ? (
            <button
              type="button"
              onClick={onRetryData}
              className="shrink-0 rounded-md border border-destructive/40 px-2 py-0.5 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Retry
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4">
        <Button
          type="button"
          disabled={!canSubmit}
          onClick={handleSubmit}
          className={cn(
            'h-11 w-full rounded-md text-sm font-semibold',
            side === 'buy' ? tradeUpFillClass : tradeDownFillClass
          )}
        >
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
