'use client';

import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpRight,
  Bell,
  CreditCard,
  SquareArrowOutUpRight,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

import { useMySocialAuth } from '@/hooks/useMySocialAuth';
import { useTradingSetupStatus } from '@/hooks/useTradingSetupStatus';
import {
  BALANCE_MANAGER_SAMPLE_COIN_KEYS,
  type BalanceManagerSampleCoinEntry,
} from '@/lib/orderbook/runtime';
import { useNetwork } from '@/lib/network-provider';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  TradeDepositDialog,
  type DepositDialogMode,
} from '@/components/trade/trade-deposit-dialog';
import { cn } from '@/lib/utils';
import { useState } from 'react';

/** Match reference: secondary controls (charcoal in dark). */
const tradeNavWalletSecondaryClass = cn(
  'rounded-xl border border-trade-shell font-semibold shadow-sm',
  'dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-800/90'
);

function ManageFundsMenuRow({
  icon: Icon,
  title,
  subtitle,
  onClick,
  disabled,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <DropdownMenuItem
      onSelect={(e) => {
        if (disabled) {
          e.preventDefault();
          return;
        }
        onClick?.();
      }}
      disabled={disabled}
      className={cn(
        'cursor-pointer gap-3 rounded-lg px-3 py-3 outline-none',
        'focus:bg-muted/80 data-[highlighted]:bg-muted/80'
      )}
    >
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
          'bg-muted/70 dark:bg-zinc-700/60'
        )}
      >
        <Icon className="h-4 w-4 text-foreground/90" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-tight text-foreground">{title}</p>
        <p className="mt-0.5 text-xs leading-snug text-[var(--muted-foreground)]">{subtitle}</p>
      </div>
    </DropdownMenuItem>
  );
}

function formatSpotEntryLine(coinKey: string, entry: BalanceManagerSampleCoinEntry | undefined): string {
  if (!entry) return `${coinKey}: —`;
  if (entry.ok) return `${coinKey} ${entry.humanBalance}`;
  return `${coinKey}: unavailable`;
}

export function TradeNavFundsBar({ poolName }: { poolName?: string }) {
  const { currentNetwork } = useNetwork();
  const { isAuthenticated, displayAddress, isLoading: authLoading } = useMySocialAuth();
  const trading = useTradingSetupStatus({
    isAuthenticated,
    displayAddress,
    authLoading,
    network: currentNetwork,
    enabled: isAuthenticated && !authLoading,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<DepositDialogMode>('deposit');

  const openDialog = (mode: DepositDialogMode) => {
    setDialogMode(mode);
    setDialogOpen(true);
  };

  const depositDisabled = !poolName || !trading.primaryBalanceManagerId || Boolean(trading.error);

  const spotHeaderContent = (() => {
    if (displayAddress == null) {
      return { primary: '—' as string, secondary: 'Sign in to view balances' };
    }
    if (trading.orderbookSkipped) {
      return {
        primary: '—',
        secondary: 'Spot balances require mainnet or testnet',
      };
    }
    if (trading.isLoading && trading.balanceManagerIds.length === 0) {
      return { primary: '…', secondary: 'Checking registry…' };
    }
    if (trading.error) {
      return { primary: '—', secondary: trading.error };
    }
    if (!trading.primaryBalanceManagerId) {
      return {
        primary: '—',
        secondary: 'No balance manager on the orderbook registry yet',
      };
    }
    if (trading.balanceManagerBalancesLoading && !trading.balanceManagerBalances) {
      return { primary: '…', secondary: 'Loading spot balances…' };
    }
    if (trading.balanceManagerBalancesError) {
      return { primary: '—', secondary: trading.balanceManagerBalancesError };
    }
    const byCoin = trading.balanceManagerBalances?.byCoin;
    const lines = BALANCE_MANAGER_SAMPLE_COIN_KEYS.map((k) => formatSpotEntryLine(k, byCoin?.[k]));
    return {
      primary: lines.join(' · '),
      secondary: 'Balance manager spot balances',
    };
  })();

  return (
    <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
      <Button
        type="button"
        size="sm"
        aria-label="Deposit"
        disabled={depositDisabled}
        onClick={() => openDialog('deposit')}
        className={cn(
          'h-9 shrink-0 gap-2 rounded-xl px-3.5 font-semibold shadow-sm md:gap-3',
          'dark:bg-zinc-200 dark:text-zinc-900 dark:hover:bg-zinc-300'
        )}
      >
        <ArrowDownToLine
          className="hidden h-4 w-4 shrink-0 md:block"
          strokeWidth={2}
          aria-hidden
        />
        Deposit
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            aria-label="Manage funds"
            className={cn(
              'h-9 shrink-0 gap-2 px-2.5 sm:gap-3 sm:px-3 lg:gap-3 lg:px-3.5',
              tradeNavWalletSecondaryClass
            )}
          >
            <Wallet className="h-4 w-4 shrink-0 text-foreground/90" strokeWidth={2} aria-hidden />
            <span className="hidden whitespace-nowrap lg:inline">Manage funds</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={8}
          className={cn(
            'w-[min(calc(100vw-2rem),20rem)] rounded-xl border border-trade-shell bg-popover/90 p-0 shadow-lg backdrop-blur-xl',
            'supports-[backdrop-filter]:bg-popover/78'
          )}
        >
          <div
            className={cn(
              'border-b border-trade-shell px-4 py-3',
              'bg-muted/40 dark:bg-zinc-800/75'
            )}
          >
            <p className="text-xs font-medium text-[var(--muted-foreground)]">Spot balances</p>
            <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="min-w-0 flex-1 text-lg font-bold tabular-nums tracking-tight text-foreground sm:text-xl">
                {spotHeaderContent.primary}
              </span>
              <span
                className="text-xs font-medium tabular-nums text-[var(--muted-foreground)]"
                aria-hidden
              >
                —
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-snug text-[var(--muted-foreground)]">
              {spotHeaderContent.secondary}
            </p>
          </div>
          <div className="p-1.5">
            <ManageFundsMenuRow
              icon={CreditCard}
              title="Withdraw cash"
              subtitle="Transfer funds to your bank"
              disabled
            />
            <ManageFundsMenuRow
              icon={ArrowUpRight}
              title="Withdraw crypto"
              subtitle="Move funds from your BalanceManager to your wallet"
              onClick={() => openDialog('withdraw')}
              disabled={depositDisabled}
            />
            <ManageFundsMenuRow
              icon={CreditCard}
              title="Convert cash"
              subtitle="Convert between cash and crypto"
              disabled
            />
            <ManageFundsMenuRow
              icon={ArrowLeftRight}
              title="Convert crypto"
              subtitle="Convert crypto to crypto"
              disabled
            />
            <ManageFundsMenuRow
              icon={SquareArrowOutUpRight}
              title="Transfer futures excess"
              subtitle="Move funds from CFM futures to CBI spot"
              disabled
            />
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {poolName ? (
        <TradeDepositDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          poolName={poolName}
          mode={dialogMode}
          onComplete={() => {
            void trading.refresh();
          }}
        />
      ) : null}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className={cn('h-9 w-9 shrink-0', tradeNavWalletSecondaryClass)}
            aria-label="Notifications"
          >
            <Bell className="h-[18px] w-[18px] text-foreground/90" strokeWidth={1.75} aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={8}
          className={cn(
            'w-[min(calc(100vw-2rem),20rem)] rounded-xl border border-trade-shell bg-popover/90 p-0 shadow-lg backdrop-blur-xl',
            'supports-[backdrop-filter]:bg-popover/78'
          )}
        >
          <div className="px-4 py-10 text-center text-sm text-[var(--muted-foreground)]">
            No notifications yet
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
