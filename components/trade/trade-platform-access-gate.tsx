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
import {
  fetchPlatformUserAccessGate,
  type PlatformUserAccess,
  type PlatformUserAccessGateResult,
} from '@/lib/graphql/profile-portfolio-overview';
import { useMySocialAuth } from '@/hooks/useMySocialAuth';
import { useNetwork } from '@/lib/network-provider';
import type { NetworkType } from '@/lib/network-utils';
import { getSofiSwapPlatformConfig } from '@/lib/platform-config';
import { signAndExecuteJoinPlatform } from '@/lib/tx/join-platform';
import {
  SOFISWAP_PROFILE_REVALIDATE_EVENT,
  clearCachedProfilePortfolioOverview2,
} from '@/lib/graphql-profile-cache';
import {
  clearTradeGateOkForPrefix,
  readAndConsumePrefetchedAccess,
  readCachedPlatformAccess,
  readTradeGateOk,
  setTradeGateOk,
  writeCachedPlatformAccess,
} from '@/lib/trade-platform-gate-storage';

type GateMode = 'idle' | 'blocked' | 'join' | 'hidden';

function classifyAccess(access: PlatformUserAccess | null): GateMode {
  if (!access) return 'join';
  if (access.isBlocked) return 'blocked';
  if (access.isModerator || access.isMember) return 'hidden';
  return 'join';
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
    if (classifyAccess(last.access) !== 'join') {
      return { timedOut: false, result: last };
    }
    await new Promise((r) => setTimeout(r, delayMs));
    delayMs = Math.min(Math.floor(delayMs * 1.45), 8_000);
  }

  return { timedOut: true, result: last };
}

export function TradePlatformAccessGate() {
  const { currentNetwork } = useNetwork();
  const {
    isAuthenticated,
    displayAddress,
    keypair,
    isLoading,
    signOut,
  } = useMySocialAuth();

  /** Stable reference — `getSofiSwapPlatformConfig()` returns a new object each call; without this, effect deps change every render and runCheck loops forever. */
  const config = useMemo(() => getSofiSwapPlatformConfig(), []);
  const [mode, setMode] = useState<GateMode>('idle');
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinPending, setJoinPending] = useState(false);
  const checkInFlight = useRef(false);
  const joinPromptDismissedRef = useRef(false);

  const runCheck = useCallback(async () => {
    if (!config || !displayAddress) {
      return;
    }
    if (checkInFlight.current) {
      return;
    }
    checkInFlight.current = true;

    let hydratedFromCache = false;

    try {
      if (readTradeGateOk(currentNetwork, config.platformGraphqlId, displayAddress)) {
        setMode('hidden');
        setJoinOpen(false);
        return;
      }

      let stale =
        readCachedPlatformAccess(currentNetwork, config.platformGraphqlId, displayAddress) ??
        readAndConsumePrefetchedAccess(currentNetwork, config.platformGraphqlId, displayAddress);

      if (stale) {
        hydratedFromCache = true;
        const m = classifyAccess(stale.access);
        if (m === 'hidden') {
          setTradeGateOk(currentNetwork, config.platformGraphqlId, displayAddress);
          setMode('hidden');
          setJoinOpen(false);
        } else if (m === 'blocked') {
          setMode('blocked');
          setJoinOpen(false);
        } else if (m === 'join') {
          if (!joinPromptDismissedRef.current) {
            setMode('join');
            setJoinOpen(true);
          } else {
            setMode('idle');
            setJoinOpen(false);
          }
        }
      }

      // No cache: assume member until GraphQL proves otherwise (no blocking “checking” dialog).
      if (!hydratedFromCache) {
        setMode('hidden');
        setJoinOpen(false);
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

      const next = classifyAccess(res.access);
      if (next === 'hidden') {
        setTradeGateOk(currentNetwork, config.platformGraphqlId, displayAddress);
        setMode('hidden');
        setJoinOpen(false);
        return;
      }
      if (next === 'blocked') {
        setMode('blocked');
        setJoinOpen(false);
        return;
      }
      if (!joinPromptDismissedRef.current) {
        setMode('join');
        setJoinOpen(true);
      } else {
        setMode('idle');
        setJoinOpen(false);
      }
    } finally {
      checkInFlight.current = false;
    }
  }, [config, currentNetwork, displayAddress]);

  useEffect(() => {
    joinPromptDismissedRef.current = false;
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
      joinPromptDismissedRef.current = false;
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

      clearCachedProfilePortfolioOverview2(
        currentNetwork,
        config.platformGraphqlId,
        displayAddress
      );
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(SOFISWAP_PROFILE_REVALIDATE_EVENT));
      }

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

      const next = classifyAccess(res.access);
      if (next === 'hidden') {
        setTradeGateOk(currentNetwork, config.platformGraphqlId, displayAddress);
        setJoinOpen(false);
        setMode('hidden');
        clearCachedProfilePortfolioOverview2(
          currentNetwork,
          config.platformGraphqlId,
          displayAddress
        );
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent(SOFISWAP_PROFILE_REVALIDATE_EVENT));
        }
        toast.success('You have joined the platform.');
        return;
      }
      if (next === 'blocked') {
        setMode('blocked');
        setJoinOpen(false);
        toast.error('Your access status changed. This account cannot use the platform.');
        return;
      }

      if (timedOut) {
        clearCachedProfilePortfolioOverview2(
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
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Join transaction failed';
      toast.error(msg);
    } finally {
      setJoinPending(false);
    }
  }, [config, currentNetwork, displayAddress, keypair, runCheck]);

  const onJoinDismissSignOut = useCallback(async () => {
    setJoinOpen(false);
    setMode('idle');
    await signOut({ redirectTo: '/' });
  }, [signOut]);

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
          className="[&>button:last-child]:hidden"
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

  return (
    <Dialog
      open={joinOpen}
      onOpenChange={(open) => {
        if (open) setJoinOpen(true);
      }}
    >
      <DialogContent
        className="[&>button:last-child]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-4 top-4 z-10 text-muted-foreground hover:bg-transparent hover:text-foreground"
          aria-label="Sign out and return home"
          disabled={joinPending}
          onClick={() => void onJoinDismissSignOut()}
        >
          <X className="h-4 w-4" />
        </Button>
        <DialogHeader>
          <DialogTitle>Join SofiSwap platform</DialogTitle>
          <DialogDescription>
            Join this platform on-chain to use trading features. This requires a signed transaction from
            your MySocial-linked wallet.
          </DialogDescription>
        </DialogHeader>
        {!keypair ? (
          <p className="text-sm text-muted-foreground">
            Signing is unavailable for this session. Use full MySocial sign-in (not wallet-only) so your
            keys can sign the join transaction.
          </p>
        ) : null}
        <DialogFooter className="sm:justify-stretch">
          <Button
            type="button"
            className="w-full"
            disabled={!keypair || joinPending}
            onClick={() => void onJoin()}
          >
            {joinPending ? 'Joining…' : 'Join platform'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
