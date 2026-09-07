'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useMySocialAuth } from '@/hooks/useMySocialAuth';
import { usePoolBalanceManagerBalances } from '@/hooks/usePoolBalanceManagerBalances';
import { useTradingSetupStatus } from '@/hooks/useTradingSetupStatus';
import { orderbookTradingNetwork } from '@/lib/orderbook/config';
import { useNetwork } from '@/lib/network-provider';
import { poolTickerForKey, spotAssetSymbolDisplay } from '@/lib/trade/trade-pool-catalog';
import { executeDepositIntoBalanceManager } from '@/lib/tx/deposit-balance-manager';
import { executeWithdrawFromBalanceManager } from '@/lib/tx/withdraw-balance-manager';
import { cn } from '@/lib/utils';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

export type DepositDialogMode = 'deposit' | 'withdraw';

export type TradeDepositDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  poolName: string;
  mode: DepositDialogMode;
  /** Called after a successful deposit/withdraw so parents can refresh balances. */
  onComplete?: () => void;
};

function sanitizeDecimalInput(raw: string): string {
  let s = raw.replace(/[^0-9.]/g, '');
  const i = s.indexOf('.');
  if (i !== -1) {
    s = `${s.slice(0, i + 1)}${s.slice(i + 1).replace(/\./g, '')}`;
  }
  if (s.startsWith('.')) s = `0${s}`;
  return s;
}

export function TradeDepositDialog({
  open,
  onOpenChange,
  poolName,
  mode,
  onComplete,
}: TradeDepositDialogProps) {
  const { currentNetwork } = useNetwork();
  const tradeOb = orderbookTradingNetwork(currentNetwork);
  const { isAuthenticated, isLoading: authLoading, displayAddress, keypair } = useMySocialAuth();
  const tradingSetup = useTradingSetupStatus({
    isAuthenticated,
    displayAddress,
    authLoading,
    network: currentNetwork,
    enabled: isAuthenticated && !authLoading,
  });

  const managerId = tradingSetup.primaryBalanceManagerId;
  const { base, quote } = useMemo(() => poolTickerForKey(currentNetwork, poolName), [currentNetwork, poolName]);
  const baseSymbol = spotAssetSymbolDisplay(base);
  const quoteSymbol = spotAssetSymbolDisplay(quote);

  const [coinKey, setCoinKey] = useState<'base' | 'quote'>('quote');
  const [amount, setAmount] = useState('0');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitLock = useRef(false);

  // Reset amount when the dialog opens.
  useEffect(() => {
    if (open) setAmount('0');
  }, [open]);

  const balances = usePoolBalanceManagerBalances({
    network: currentNetwork,
    obNet: tradeOb,
    poolName,
    primaryBalanceManagerId: managerId,
    displayAddress,
    enabled: open && Boolean(managerId) && Boolean(displayAddress) && Boolean(tradeOb),
    pollIntervalMs: 0,
  });

  const activeCoinKey = coinKey === 'base' ? base : quote;
  const activeSymbol = coinKey === 'base' ? baseSymbol : quoteSymbol;
  const walletBalance = mode === 'deposit' ? null : (coinKey === 'base' ? balances.baseBalance : balances.quoteBalance);
  const managerBalance = mode === 'withdraw' ? null : (coinKey === 'base' ? balances.baseBalance : balances.quoteBalance);

  const amountNum = Number(amount);
  const canSubmit =
    !isSubmitting &&
    !tradingSetup.isLoading &&
    !tradingSetup.error &&
    Number.isFinite(amountNum) &&
    amountNum > 0 &&
    Boolean(tradeOb) &&
    Boolean(managerId) &&
    Boolean(displayAddress) &&
    Boolean(keypair);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || submitLock.current) return;
    if (!displayAddress || !keypair || !managerId) {
      toast.error('Wallet not ready', {
        description: 'Sign in and complete trading setup first.',
      });
      return;
    }
    submitLock.current = true;
    setIsSubmitting(true);
    try {
      if (mode === 'deposit') {
        await executeDepositIntoBalanceManager({
          network: currentNetwork,
          obNet: tradeOb,
          balanceManagerObjectId: managerId,
          coinKey: activeCoinKey,
          amount: amountNum,
          sender: displayAddress,
          signer: keypair,
        });
        toast.success(`Deposited ${amountNum} ${activeSymbol}`);
      } else {
        await executeWithdrawFromBalanceManager({
          network: currentNetwork,
          obNet: tradeOb,
          balanceManagerObjectId: managerId,
          coinKey: activeCoinKey,
          amount: amountNum,
          recipient: displayAddress,
          sender: displayAddress,
          signer: keypair,
        });
        toast.success(`Withdrew ${amountNum} ${activeSymbol}`);
      }
      onComplete?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(mode === 'deposit' ? 'Deposit failed' : 'Withdraw failed', {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      submitLock.current = false;
      setIsSubmitting(false);
    }
  }, [
    canSubmit,
    tradeOb,
    displayAddress,
    keypair,
    managerId,
    mode,
    currentNetwork,
    activeCoinKey,
    amountNum,
    activeSymbol,
    onComplete,
    onOpenChange,
  ]);

  const isDisabled = isSubmitting || tradingSetup.isLoading || tradingSetup.error != null;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!submitLock.current) onOpenChange(next); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === 'deposit' ? 'Deposit' : 'Withdraw'} {activeSymbol}
          </DialogTitle>
          <DialogDescription>
            {mode === 'deposit'
              ? `Move ${activeSymbol} from your wallet into your BalanceManager for trading on ${poolName}.`
              : `Move ${activeSymbol} from your BalanceManager back to your wallet.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setCoinKey('quote')}
              disabled={isDisabled}
              aria-pressed={coinKey === 'quote'}
              className={cn(
                'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                coinKey === 'quote'
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-trade-shell bg-muted/40 text-[var(--muted-foreground)] hover:bg-muted/70'
              )}
            >
              {quoteSymbol}
            </button>
            <button
              type="button"
              onClick={() => setCoinKey('base')}
              disabled={isDisabled}
              aria-pressed={coinKey === 'base'}
              className={cn(
                'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                coinKey === 'base'
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-trade-shell bg-muted/40 text-[var(--muted-foreground)] hover:bg-muted/70'
              )}
            >
              {baseSymbol}
            </button>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="deposit-amount">Amount</Label>
              <span className="text-[11px] text-[var(--muted-foreground)]">
                {mode === 'deposit'
                  ? managerBalance != null
                    ? `Manager: ${managerBalance} ${activeSymbol}`
                    : 'Manager: —'
                  : walletBalance != null
                    ? `Available: ${walletBalance} ${activeSymbol}`
                    : 'Available: —'}
              </span>
            </div>
            <Input
              id="deposit-amount"
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(e) => setAmount(sanitizeDecimalInput(e.target.value))}
              placeholder="0.0"
              disabled={isDisabled}
            />
          </div>

          {tradingSetup.error ? (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {tradingSetup.error}
            </p>
          ) : null}

          <Button
            type="button"
            className="h-11 w-full font-bold"
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {isSubmitting
              ? 'Submitting…'
              : `${mode === 'deposit' ? 'Deposit' : 'Withdraw'} ${activeSymbol}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
