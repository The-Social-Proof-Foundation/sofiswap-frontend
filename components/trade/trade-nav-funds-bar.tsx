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

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

/** Match reference: secondary controls (charcoal in dark). */
const tradeNavWalletSecondaryClass = cn(
  'rounded-xl border border-trade-shell font-semibold shadow-sm',
  'dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-800/90'
);

function ManageFundsMenuRow({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
}) {
  return (
    <DropdownMenuItem
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

export function TradeNavFundsBar() {
  return (
    <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
      <Button
        type="button"
        size="sm"
        aria-label="Deposit"
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
            <p className="text-xs font-medium text-[var(--muted-foreground)]">Total balance</p>
            <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="text-2xl font-bold tabular-nums tracking-tight text-foreground">
                $83.14
              </span>
              <span
                className="text-xs font-medium tabular-nums text-rose-500 dark:text-rose-400"
                aria-label="One day change down 10 cents, 0.12 percent"
              >
                ↘ $0.10 (0.12%) 1D
              </span>
            </div>
          </div>
          <div className="p-1.5">
            <ManageFundsMenuRow
              icon={CreditCard}
              title="Withdraw cash"
              subtitle="Transfer funds to your bank"
            />
            <ManageFundsMenuRow
              icon={ArrowUpRight}
              title="Withdraw crypto"
              subtitle="To a crypto address, email or phone number"
            />
            <ManageFundsMenuRow
              icon={CreditCard}
              title="Convert cash"
              subtitle="Convert between cash and crypto"
            />
            <ManageFundsMenuRow
              icon={ArrowLeftRight}
              title="Convert crypto"
              subtitle="Convert crypto to crypto"
            />
            <ManageFundsMenuRow
              icon={SquareArrowOutUpRight}
              title="Transfer futures excess"
              subtitle="Move funds from CFM futures to CBI spot"
            />
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

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
