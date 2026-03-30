/**
 * Shared Tailwind class groups for `/trade` chrome — rails, SPT surfaces, route empty states.
 * Prefer these over copying long strings so borders, radii, and dark-mode tweaks stay consistent.
 */

import { cn } from '@/lib/utils';

/** Buy/sell + Exchange/SPT-style segment control: bordered inset track (see TradeTopNav, workspace rail). */
export const tradeRailSegmentListClass = cn(
  'grid grid-cols-2 gap-0 rounded-[10px] border border-trade-shell bg-muted/70 p-[3px] shadow-inner',
  'dark:bg-muted/40 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
);

/** Soft segment track inside SPT panels (no outer border — avoids border-on-border). */
export const tradeSptSwapSegmentShellClass = cn(
  'grid gap-0 rounded-[10px] bg-muted/45 p-[3px]',
  'dark:bg-muted/25'
);

/**
 * Default SPT panels: mint-forward gradient + soft top highlight for depth (brand primary).
 */
const tradeSptSurfaceBase = cn(
  'rounded-2xl border border-trade-shell',
  'bg-gradient-to-br from-primary/[0.09] via-muted/30 to-muted/16',
  'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.07)]',
  'dark:from-primary/[0.11] dark:via-muted/14 dark:to-muted/7',
  'dark:shadow-[inset_0_1px_0_0_rgba(154,225,157,0.07)]'
);

/** Default SPT content blocks (stats, about, tables, chart shell). */
export const tradeSptRoundedPanelClass = cn(tradeSptSurfaceBase, 'p-4 sm:p-5');

/**
 * Reserve column: slightly stronger primary wash so it reads apart from the swap card.
 */
export const tradeSptTallCardReserveClass = cn(
  'flex h-full min-h-0 flex-col gap-4 p-4 md:p-5',
  'rounded-2xl border border-trade-shell',
  'bg-gradient-to-br from-primary/[0.13] via-muted/26 to-muted/12',
  'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]',
  'dark:from-primary/[0.15] dark:via-muted/12 dark:to-muted/6',
  'dark:shadow-[inset_0_1px_0_0_rgba(154,225,157,0.09)]'
);

/**
 * Swap column: warm secondary-foreground tint (pairs with mint reserve for clear separation).
 */
export const tradeSptTallCardSwapClass = cn(
  'flex h-full min-h-0 flex-col gap-4 p-4 md:p-5',
  'rounded-2xl border border-trade-shell',
  'bg-gradient-to-br from-secondary-foreground/[0.11] via-muted/26 to-muted/12',
  'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]',
  'dark:from-secondary-foreground/[0.13] dark:via-muted/12 dark:to-muted/6',
  'dark:shadow-[inset_0_1px_0_0_rgba(166,138,100,0.10)]'
);

/** @deprecated Prefer tradeSptTallCardReserveClass or tradeSptTallCardSwapClass. */
export const tradeSptTallCardClass = tradeSptTallCardReserveClass;

/** Compact centered aside when swap/reserve is unavailable. */
export const tradeSptEmptyAsideClass = cn(tradeSptSurfaceBase, 'p-5 text-center');

/**
 * Inset table/list inside an SPT panel — subtle border tint so it lifts off the card.
 */
export const tradeSptTableWellClass = cn(
  'overflow-hidden rounded-lg border border-primary/[0.12]',
  'bg-gradient-to-b from-muted/30 to-muted/14',
  'dark:border-primary/[0.14] dark:from-muted/16 dark:to-muted/6'
);

/**
 * Centered empty / loading shells for full-width trade routes (e.g. SPT gate states).
 * Add `gap-2` or `gap-3` for spacing between title and body copy.
 */
export const tradeWorkspaceRouteEmptyRootClass =
  'flex min-h-[40vh] flex-col items-center justify-center px-6 py-12 text-center font-satoshi';

export const tradeWorkspaceRouteLoadingClass =
  'flex min-h-[40vh] items-center justify-center px-6 font-satoshi text-sm text-[var(--muted-foreground)]';
