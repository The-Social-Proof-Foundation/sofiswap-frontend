'use client';

import type { Ed25519Keypair } from '@socialproof/myso/keypairs/ed25519';
import {
  isWalletOnlySession,
  PopupBlockedError,
  RateLimitError,
  SessionRevokedError,
  type AuthProvider,
  type Session,
} from '@socialproof/mysocial-auth';
import { useCallback, useEffect, useState } from 'react';

import {
  getMySocialAuthOrNull,
  isMySocialAuthConfigured,
  MYSOCIAL_AUTH_BROADCAST_SESSION_EVENT,
} from '@/lib/mysocial-auth-client';
import {
  generateKeypairFromSalt,
  getSaltFromMySocialAuth,
  resolveDisplayAddress,
} from '@/lib/mysocial-oauth-utils';

/**
 * Mobile, tablet, and coarse-pointer environments should use full-page redirect (no OAuth popup).
 */
export function shouldUseRedirect(): boolean {
  if (typeof window === 'undefined') return false;
  if (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    )
  ) {
    return true;
  }
  // iPadOS 13+ desktop mode: MacIntel + touch
  const maxTouchPoints =
    (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints ?? 0;
  if (navigator.platform === 'MacIntel' && maxTouchPoints > 1) {
    return true;
  }
  if (window.matchMedia?.('(pointer: coarse)').matches) return true;
  const ud = (
    navigator as Navigator & { userAgentData?: { mobile?: boolean } }
  ).userAgentData;
  if (ud?.mobile) return true;
  return false;
}

/**
 * Set `NEXT_PUBLIC_MYSOCIAL_AUTH_USE_POPUP=false` to always use redirect (e.g. strict COOP / SES).
 * Default: popup on desktop when `shouldUseRedirect()` is false; redirect on mobile/tablet.
 */
function mySocialAuthForceRedirect(): boolean {
  return process.env.NEXT_PUBLIC_MYSOCIAL_AUTH_USE_POPUP === 'false';
}

export function useMySocialAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [displayAddress, setDisplayAddress] = useState<string | null>(null);
  const [keypair, setKeypair] = useState<Ed25519Keypair | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const configured = isMySocialAuthConfigured();

  const syncSession = useCallback(async () => {
    const auth = getMySocialAuthOrNull();
    if (!auth) {
      setSession(null);
      setDisplayAddress(null);
      setKeypair(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setRateLimited(false);
    setAuthError(null);

    try {
      const s = await auth.getSession();
      setSession(s);

      if (!s) {
        setDisplayAddress(null);
        setKeypair(null);
        return;
      }

      const addr = resolveDisplayAddress(s);

      if (isWalletOnlySession(s)) {
        setDisplayAddress(addr);
        setKeypair(null);
        return;
      }

      let salt = s.salt;
      if (!salt) {
        try {
          salt = await getSaltFromMySocialAuth(auth);
        } catch (e) {
          console.warn('[useMySocialAuth] salt fetch failed:', e);
          setDisplayAddress(addr);
          setKeypair(null);
          return;
        }
      }

      const sub =
        s.sub ||
        (typeof s.user?.sub === 'string' ? s.user.sub : '') ||
        (typeof s.user?.id === 'string' ? s.user.id : '');

      if (!sub || !salt) {
        setDisplayAddress(addr);
        setKeypair(null);
        return;
      }

      const kp = await generateKeypairFromSalt(sub, salt);
      const derived = kp.getPublicKey().toMySoAddress();

      if (addr) {
        if (derived.toLowerCase() !== addr.toLowerCase()) {
          console.warn('[useMySocialAuth] derived address does not match session');
          setKeypair(null);
          setDisplayAddress(addr);
          return;
        }
        setDisplayAddress(addr);
      } else {
        setDisplayAddress(derived);
      }

      setKeypair(kp);
    } catch (e) {
      if (e instanceof SessionRevokedError) {
        const a = getMySocialAuthOrNull();
        await a?.signOut().catch(() => {});
        setSession(null);
        setDisplayAddress(null);
        setKeypair(null);
      } else if (e instanceof RateLimitError) {
        setRateLimited(true);
      } else {
        setAuthError(e instanceof Error ? e.message : 'Auth sync failed');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const auth = getMySocialAuthOrNull();
    if (!auth) {
      setIsLoading(false);
      return;
    }
    void syncSession();
    const off = auth.onAuthStateChange(() => {
      void syncSession();
    });
    const onBroadcast = () => void syncSession();
    window.addEventListener(MYSOCIAL_AUTH_BROADCAST_SESSION_EVENT, onBroadcast);
    return () => {
      off();
      window.removeEventListener(MYSOCIAL_AUTH_BROADCAST_SESSION_EVENT, onBroadcast);
    };
  }, [syncSession]);

  const signIn = useCallback(
    async (provider: AuthProvider = 'none') => {
      const auth = getMySocialAuthOrNull();
      if (!auth) throw new Error('MySocial Auth is not configured');
      setIsSigningIn(true);
      setAuthError(null);
      try {
        if (shouldUseRedirect() || mySocialAuthForceRedirect()) {
          await auth.signIn({ provider, mode: 'redirect' });
          return;
        }

        try {
          await auth.signIn({ provider, mode: 'popup' });
          await syncSession();
        } catch (e) {
          if (e instanceof PopupBlockedError) {
            await auth.signIn({ provider, mode: 'redirect' });
            return;
          }
          throw e;
        }
      } finally {
        setIsSigningIn(false);
      }
    },
    [syncSession]
  );

  const signOut = useCallback(async () => {
    const auth = getMySocialAuthOrNull();
    if (auth) {
      await auth.signOut().catch(() => {});
    }
    setSession(null);
    setDisplayAddress(null);
    setKeypair(null);
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }, []);

  return {
    isConfigured: configured,
    session,
    displayAddress,
    keypair,
    isAuthenticated: Boolean(session && displayAddress),
    isLoading,
    isSigningIn,
    rateLimited,
    authError,
    signIn,
    signOut,
    syncSession,
  };
}
