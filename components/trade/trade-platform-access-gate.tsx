'use client';

import { X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useMySocialAuth } from '@/hooks/useMySocialAuth';
import { useTradingSetupStatus } from '@/hooks/useTradingSetupStatus';
import {
  fetchPlatformUserAccessGate,
  type PlatformUserAccess,
  type PlatformUserAccessGateResult,
} from '@/lib/graphql/profile-portfolio-overview';
import {
  SOFISWAP_PROFILE_REVALIDATE_EVENT,
  clearCachedProfilePortfolioOverview,
} from '@/lib/graphql-profile-cache';
import { useNetwork } from '@/lib/network-provider';
import type { NetworkType } from '@/lib/network-utils';
import { getSofiSwapPlatformConfig } from '@/lib/platform-config';
import { signAndExecuteJoinPlatform } from '@/lib/tx/join-platform';
import { cn } from '@/lib/utils';
import { signAndExecuteTradingSetup } from '@/lib/tx/trading-setup';
import {
  clearTradeGateOkForPrefix,
  readAndConsumePrefetchedAccess,
  readCachedPlatformAccess,
  readTradeGateOk,
  setTradeGateOk,
  writeCachedPlatformAccess,
} from '@/lib/trade-platform-gate-storage';
import { pollRegisteredBalanceManagerIdsAfterTx } from '@/lib/trading-setup-poll';

type GateMode = 'idle' | 'blocked' | 'join' | 'repair' | 'hidden';

const tradeGateDialogOverlayClassName = 'bg-black/45 backdrop-blur-md';
const tradeGateDialogContentClassName = cn(
  'border border-trade-shell bg-background/88 backdrop-blur-xl supports-[backdrop-filter]:bg-background/72 shadow-2xl',
  '[&>button:last-child]:hidden'
);

function classifyMembership(access: PlatformUserAccess | null): 'join' | 'blocked' | 'member' {
  if (!access) return 'join';
  if (access.isBlocked) return 'blocked';
  if (access.isModerator || access.isMember) return 'member';
  return 'join';
}

function resolveGateMode(
  access: PlatformUserAccess | null,
  trading: {
    orderbookSkipped: boolean;
    bmLoading: boolean;
    bmError: string | null;
    bmIds: string[];
  }
): GateMode {
  const m = classifyMembership(access);
  if (m === 'blocked') return 'blocked';
  if (m === 'join') return 'join';
  if (trading.orderbookSkipped) return 'hidden';
  if (trading.bmLoading) return 'idle';
  if (trading.bmError) return 'idle';
  if (trading.bmIds.length === 0) return 'repair';
  return 'hidden';
}

/** After a successful on-chain join, GraphQL may lag; poll until access is no longer "join" or we time out. */
async function pollPlatformUserAccessAfterJoin(
  displayAddress: string,
  platformGraphqlId: string,
  network: NetworkType,
  maxWaitMs = 90_000
): Promise<{ timedOut: boolean; result: PlatformUserAccessGateResult }> {
  const started = Date.now();
  let delayMs = 750;
  let last: PlatformUserAccessGateResult = { access: null };

  while (Date.now() - started < maxWaitMs) {
    last = await fetchPlatformUserAccessGate(displayAddress, platformGraphqlId, network);
    if (last.errors?.length) {
      return { timedOut: false, result: last };
    }
    if (classifyMembership(last.access) !== 'join') {
      return { timedOut: false, result: last };
    }
    await new Promise((r) => setTimeout(r, delayMs));
    delayMs = Math.min(Math.floor(delayMs * 1.45), 8_000);
  }

  return { timedOut: true, result: last };
}

export function TradePlatformAccessGate({
  verifyOrderbookTradingSetup = true,
}: {
  /**
   * When false (e.g. Social Proof Tokens tab only), skip registry / BalanceManager reads so a bad
   * `NEXT_PUBLIC_ORDERBOOK_*` pair on this chain does not block the gate or toast on every load.
   */
  verifyOrderbookTradingSetup?: boolean;
} = {}) {
  const { currentNetwork } = useNetwork();
  const { isAuthenticated, displayAddress, keypair, isLoading, signOut } = useMySocialAuth();

  const trading = useTradingSetupStatus({
    isAuthenticated,
    displayAddress,
    authLoading: isLoading,
    network: currentNetwork,
    enabled: verifyOrderbookTradingSetup,
  });
  const { refresh: refreshTradingSetup, orderbookSkipped } = trading;
  const effectiveOrderbookSkipped =
    orderbookSkipped || !verifyOrderbookTradingSetup;

  const config = useMemo(() => getSofiSwapPlatformConfig(currentNetwork), [currentNetwork]);
  const [mode, setMode] = useState<GateMode>('idle');
  const [joinOpen, setJoinOpen] = useState(false);
  const [repairOpen, setRepairOpen] = useState(false);
  const [joinPending, setJoinPending] = useState(false);
  const [repairPending, setRepairPending] = useState(false);
  const checkInFlight = useRef(false);
  const joinPromptDismissedRef = useRef(false);
  const repairPromptDismissedRef = useRef(false);

  const runCheck = useCallback(async () => {
    if (!config || !displayAddress) {
      return;
    }
    if (checkInFlight.current) {
      return;
    }
    checkInFlight.current = true;

    let hydratedFromCache = false;

    const tradingCtx = {
      orderbookSkipped: effectiveOrderbookSkipped,
      bmLoading: trading.isLoading,
      bmError: trading.error,
      bmIds: trading.balanceManagerIds,
    };

    try {
      if (readTradeGateOk(currentNetwork, config.platformGraphqlId, displayAddress)) {
        setMode('hidden');
        setJoinOpen(false);
        setRepairOpen(false);
        return;
      }

      let stale =
        readCachedPlatformAccess(currentNetwork, config.platformGraphqlId, displayAddress) ??
        readAndConsumePrefetchedAccess(currentNetwork, config.platformGraphqlId, displayAddress);

      if (stale) {
        hydratedFromCache = true;
        const m = resolveGateMode(stale.access, tradingCtx);
        if (m !== 'repair') {
          repairPromptDismissedRef.current = false;
        }
        if (m === 'hidden') {
          setTradeGateOk(currentNetwork, config.platformGraphqlId, displayAddress);
          setMode('hidden');
          setJoinOpen(false);
          setRepairOpen(false);
        } else if (m === 'blocked') {
          setMode('blocked');
          setJoinOpen(false);
          setRepairOpen(false);
        } else if (m === 'repair') {
          if (!repairPromptDismissedRef.current) {
            setMode('repair');
            setRepairOpen(true);
            setJoinOpen(false);
          } else {
            setMode('idle');
            setRepairOpen(false);
            setJoinOpen(false);
          }
        } else if (m === 'join') {
          if (!joinPromptDismissedRef.current) {
            setMode('join');
            setJoinOpen(true);
            setRepairOpen(false);
          } else {
            setMode('idle');
            setJoinOpen(false);
            setRepairOpen(false);
          }
        } else {
          setMode('idle');
          setJoinOpen(false);
          setRepairOpen(false);
        }
      }

      if (!hydratedFromCache) {
        setMode('idle');
        setJoinOpen(false);
        setRepairOpen(false);
      }

      const res = await fetchPlatformUserAccessGate(
        displayAddress,
        config.platformGraphqlId,
        currentNetwork
      );

      if (res.errors?.length) {
        if (!hydratedFromCache) {
          setMode('idle');
          setJoinOpen(false);
          setRepairOpen(false);
        }
        toast.error(
          res.errors.map((e) => e.message).join('; ') || 'Could not verify platform access'
        );
        return;
      }

      writeCachedPlatformAccess(currentNetwork, config.platformGraphqlId, displayAddress, {
        access: res.access,
        fetchedAt: Date.now(),
      });

      if (
        verifyOrderbookTradingSetup &&
        !trading.orderbookSkipped &&
        !trading.isLoading &&
        trading.error
      ) {
        toast.error(
          trading.error.includes('fetch')
            ? trading.error
            : `Could not verify trading setup: ${trading.error}`
        );
        setMode('idle');
        setJoinOpen(false);
        setRepairOpen(false);
        return;
      }

      const next = resolveGateMode(res.access, tradingCtx);
      if (next !== 'repair') {
        repairPromptDismissedRef.current = false;
      }
      if (next === 'hidden') {
        setTradeGateOk(currentNetwork, config.platformGraphqlId, displayAddress);
        setMode('hidden');
        setJoinOpen(false);
        setRepairOpen(false);
        return;
      }
      if (next === 'blocked') {
        setMode('blocked');
        setJoinOpen(false);
        setRepairOpen(false);
        return;
      }
      if (next === 'repair') {
        if (!repairPromptDismissedRef.current) {
          setMode('repair');
          setRepairOpen(true);
          setJoinOpen(false);
        } else {
          setMode('idle');
          setRepairOpen(false);
          setJoinOpen(false);
        }
        return;
      }
      if (next === 'idle') {
        setMode('idle');
        setJoinOpen(false);
        setRepairOpen(false);
        return;
      }
      if (!joinPromptDismissedRef.current) {
        setMode('join');
        setJoinOpen(true);
        setRepairOpen(false);
      } else {
        setMode('idle');
        setJoinOpen(false);
        setRepairOpen(false);
      }
    } finally {
      checkInFlight.current = false;
    }
  }, [
    config,
    currentNetwork,
    displayAddress,
    trading.balanceManagerIds,
    trading.error,
    trading.isLoading,
    trading.orderbookSkipped,
    verifyOrderbookTradingSetup,
    effectiveOrderbookSkipped,
  ]);

  useEffect(() => {
    joinPromptDismissedRef.current = false;
    repairPromptDismissedRef.current = false;
  }, [displayAddress, currentNetwork]);

  useEffect(() => {
    if (!isAuthenticated || !displayAddress || isLoading) {
      return;
    }
    if (!config) {
      setMode('idle');
      return;
    }
    void runCheck();
  }, [isAuthenticated, displayAddress, isLoading, config, runCheck, currentNetwork]);

  useEffect(() => {
    if (!isAuthenticated) {
      clearTradeGateOkForPrefix();
      setMode('idle');
      setJoinOpen(false);
      setRepairOpen(false);
      joinPromptDismissedRef.current = false;
      repairPromptDismissedRef.current = false;
    }
  }, [isAuthenticated]);

  const onJoin = useCallback(async () => {
    if (!config || !displayAddress || !keypair) return;
    setJoinPending(true);
    try {
      await signAndExecuteJoinPlatform({
        network: currentNetwork,
        config,
        senderAddress: displayAddress,
        signer: keypair,
      });

      clearCachedProfilePortfolioOverview(
        currentNetwork,
        config.platformGraphqlId,
        displayAddress
      );
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(SOFISWAP_PROFILE_REVALIDATE_EVENT));
      }

      await refreshTradingSetup();

      const { timedOut, result: res } = await pollPlatformUserAccessAfterJoin(
        displayAddress,
        config.platformGraphqlId,
        currentNetwork
      );

      if (res.errors?.length) {
        toast.error(res.errors.map((e) => e.message).join('; ') || 'Could not confirm membership');
        setTimeout(() => void runCheck(), 0);
        return;
      }

      writeCachedPlatformAccess(currentNetwork, config.platformGraphqlId, displayAddress, {
        access: res.access,
        fetchedAt: Date.now(),
      });

      const memberNext = classifyMembership(res.access);
      if (memberNext === 'blocked') {
        setMode('blocked');
        setJoinOpen(false);
        toast.error('Your access status changed. This account cannot use the platform.');
        return;
      }

      if (memberNext === 'join') {
        if (timedOut) {
          clearCachedProfilePortfolioOverview(
            currentNetwork,
            config.platformGraphqlId,
            displayAddress
          );
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent(SOFISWAP_PROFILE_REVALIDATE_EVENT));
          }
          toast.message(
            'Transaction succeeded, but membership is not visible yet. Refreshing access in the background.'
          );
          setTimeout(() => void runCheck(), 0);
          return;
        }
        setTimeout(() => void runCheck(), 0);
        return;
      }

      if (!effectiveOrderbookSkipped) {
        const poll = await pollRegisteredBalanceManagerIdsAfterTx(currentNetwork, displayAddress);
        await refreshTradingSetup();
        if (poll.pollError) {
          toast.error(`Trading setup verification failed: ${poll.pollError}`);
          setTimeout(() => void runCheck(), 0);
          return;
        }
        if (poll.timedOut || poll.ids.length === 0) {
          toast.message(
            'You have joined, but the trading registry has not updated yet. We will keep checking…'
          );
          setTimeout(() => void runCheck(), 0);
          return;
        }
      }

      setTradeGateOk(currentNetwork, config.platformGraphqlId, displayAddress);
      setJoinOpen(false);
      setRepairOpen(false);
      setMode('hidden');
      clearCachedProfilePortfolioOverview(currentNetwork, config.platformGraphqlId, displayAddress);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(SOFISWAP_PROFILE_REVALIDATE_EVENT));
      }
      toast.success('You have joined the platform.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Join transaction failed';
      toast.error(msg);
    } finally {
      setJoinPending(false);
    }
  }, [
    config,
    currentNetwork,
    displayAddress,
    keypair,
    runCheck,
    effectiveOrderbookSkipped,
    refreshTradingSetup,
  ]);

  const onRepair = useCallback(async () => {
    if (!displayAddress || !keypair) return;
    setRepairPending(true);
    try {
      const setupResponse = await signAndExecuteTradingSetup({
        network: currentNetwork,
        senderAddress: displayAddress,
        signer: keypair,
      });
      const skippedNewTransactions = setupResponse == null;
      await refreshTradingSetup();
      const poll = await pollRegisteredBalanceManagerIdsAfterTx(currentNetwork, displayAddress);
      await refreshTradingSetup();
      if (poll.pollError) {
        toast.error(`Could not confirm trading setup: ${poll.pollError}`);
        setTimeout(() => void runCheck(), 0);
        return;
      }
      if (poll.timedOut || poll.ids.length === 0) {
        toast.message(
          skippedNewTransactions
            ? 'Could not confirm your balance manager on the registry yet. We will keep checking…'
            : 'Transaction succeeded. Waiting for registry to list your balance manager…'
        );
        setTimeout(() => void runCheck(), 0);
        return;
      }
      if (config) {
        setTradeGateOk(currentNetwork, config.platformGraphqlId, displayAddress);
      }
      setRepairOpen(false);
      setMode('hidden');
      toast.success(
        skippedNewTransactions
          ? 'You already have a registered balance manager.'
          : 'Trading setup complete.'
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Trading setup failed';
      toast.error(msg);
    } finally {
      setRepairPending(false);
    }
  }, [config, currentNetwork, displayAddress, keypair, runCheck, refreshTradingSetup]);

  /** Close join prompt without signing out (e.g. switch network in header). Resets when network or account changes. */
  const onJoinDismiss = useCallback(() => {
    setJoinOpen(false);
    setMode('idle');
    joinPromptDismissedRef.current = true;
  }, []);

  const onRepairDismiss = useCallback(() => {
    setRepairOpen(false);
    setMode('idle');
    repairPromptDismissedRef.current = true;
  }, []);

  if (!config) {
    return null;
  }

  if (mode === 'hidden' || mode === 'idle') {
    return null;
  }

  if (mode === 'blocked') {
    return (
      <Dialog
        open
        onOpenChange={() => {
          /* non-dismissible */
        }}
      >
        <DialogContent
          overlayClassName={tradeGateDialogOverlayClassName}
          className={tradeGateDialogContentClassName}
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Access restricted</DialogTitle>
            <DialogDescription>Sorry, you&apos;re blocked.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              onClick={() => {
                void signOut();
              }}
            >
              Sign out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (mode === 'repair') {
    return (
      <Dialog
        open={repairOpen}
        onOpenChange={(open) => {
          if (open) setRepairOpen(true);
        }}
      >
        <DialogContent
          overlayClassName={tradeGateDialogOverlayClassName}
          className={tradeGateDialogContentClassName}
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-4 top-4 z-10 text-[var(--muted-foreground)] hover:bg-transparent hover:text-foreground"
            aria-label="Close"
            disabled={repairPending}
            onClick={onRepairDismiss}
          >
            <X className="h-4 w-4" />
          </Button>
          <DialogHeader>
            <DialogTitle>Enable trading</DialogTitle>
            <DialogDescription>
              Your account is a platform member, but no balance manager is registered for spot trading yet.
              Create and register one on the orderbook with the button below.
            </DialogDescription>
          </DialogHeader>
          {!keypair ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              Signing is unavailable for this session. Use full MySocial sign-in (not wallet-only) so your
              keys can sign this transaction.
            </p>
          ) : null}
          <DialogFooter className="sm:justify-stretch">
            <Button
              type="button"
              className="w-full"
              disabled={!keypair || repairPending}
              onClick={() => void onRepair()}
            >
              {repairPending ? 'Working…' : 'Enable trading'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={joinOpen}
      onOpenChange={(open) => {
        if (open) setJoinOpen(true);
      }}
    >
      <DialogContent
        overlayClassName={tradeGateDialogOverlayClassName}
        className={tradeGateDialogContentClassName}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-4 top-4 z-10 text-[var(--muted-foreground)] hover:bg-transparent hover:text-foreground"
          aria-label="Close"
          disabled={joinPending}
          onClick={onJoinDismiss}
        >
          <X className="h-4 w-4" />
        </Button>
        <DialogHeader>
          <DialogTitle>Join SofiSwap platform</DialogTitle>
          <DialogDescription>
            Join this platform on-chain to use trading features. This may include creating a balance manager
            for spot trading in the same transaction. A signed transaction from your MySocial-linked wallet
            is required.
          </DialogDescription>
        </DialogHeader>
        {!keypair ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            Signing is unavailable for this session. Use full MySocial sign-in (not wallet-only) so your
            keys can sign the join transaction.
          </p>
        ) : null}
        <DialogFooter className="flex-col gap-2 sm:justify-stretch">
          <Button
            type="button"
            className="w-full"
            disabled={!keypair || joinPending}
            onClick={() => void onJoin()}
          >
            {joinPending ? 'Joining…' : 'Join platform'}
          </Button>
          <Button type="button" variant="ghost" className="w-full" disabled={joinPending} onClick={onJoinDismiss}>
            Not now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
