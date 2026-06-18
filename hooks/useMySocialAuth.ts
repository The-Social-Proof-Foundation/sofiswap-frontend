'use client';

import type { Ed25519Keypair } from '@socialproof/myso/keypairs/ed25519';
import {
  PopupBlockedError,
  RateLimitError,
  SessionRevokedError,
  WALLET_ONLY_ACCESS_TOKEN,
  type AuthProvider,
  type Session,
  type WalletCredentials,
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
import {
  clearAllWalletSigningKeys,
  loadWalletSigningKeypair,
  storeWalletSigningKey,
} from '@/lib/mysocial-wallet-signing-storage';
import { clearGraphqlProfileCacheForPrefix } from '@/lib/graphql-profile-cache';
import { clearTradeGateOkForPrefix } from '@/lib/trade-platform-gate-storage';
import { keypairFromWalletCredentials } from '@/lib/wallet-credentials-keypair';
import {
  SOFISWAP_SELECTED_NETWORK_CHANGE_EVENT,
} from '@/lib/network-utils';

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

      if (!addr) {
        setDisplayAddress(null);
        setKeypair(null);
        return;
      }

      /**
       * Local Create/Import wallet sessions use the sentinel access token; there is no salt API.
       * Signing relies on `onWalletCredentials` + sessionStorage (see `signIn`).
       */
      if (s.access_token === WALLET_ONLY_ACCESS_TOKEN) {
        setDisplayAddress(addr);
        const kp = loadWalletSigningKeypair(addr);
        setKeypair(kp);
        if (!kp) {
          console.warn(
            '[useMySocialAuth] wallet-only session but no tab-stored signing key. Use Create/Import in the auth popup (same tab) so credentials can be saved for this session.'
          );
        }
        return;
      }

      /**
       * Do not use `isWalletOnlySession()` to skip salt: that only checks session_access_token +
       * refresh_token. Many social redirects still have `id_token` / `access_token` for `POST /salt`.
       */
      let salt = s.salt;
      if (!salt) {
        try {
          salt = await getSaltFromMySocialAuth(auth);
        } catch (e) {
          console.warn('[useMySocialAuth] salt fetch failed; trying stored wallet signing key:', e);
          setDisplayAddress(addr);
          setKeypair(loadWalletSigningKeypair(addr));
          return;
        }
      }

      const sub =
        s.sub ||
        (typeof s.user?.sub === 'string' ? s.user.sub : '') ||
        (typeof s.user?.id === 'string' ? s.user.id : '');

      if (!sub || !salt) {
        setDisplayAddress(addr);
        setKeypair(loadWalletSigningKeypair(addr));
        console.warn(
          '[useMySocialAuth] missing sub or salt after fetch; keypair only if wallet storage exists'
        );
        return;
      }

      const kp = await generateKeypairFromSalt(sub, salt);
      const derived = kp.getPublicKey().toMySoAddress();

      if (addr) {
        if (derived.toLowerCase() !== addr.toLowerCase()) {
          console.warn(
            '[useMySocialAuth] derived address does not match session; trying stored wallet signing key'
          );
          setDisplayAddress(addr);
          setKeypair(loadWalletSigningKeypair(addr));
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
    const onNetworkChange = () => void syncSession();
    window.addEventListener(MYSOCIAL_AUTH_BROADCAST_SESSION_EVENT, onBroadcast);
    window.addEventListener(SOFISWAP_SELECTED_NETWORK_CHANGE_EVENT, onNetworkChange);
    return () => {
      off();
      window.removeEventListener(MYSOCIAL_AUTH_BROADCAST_SESSION_EVENT, onBroadcast);
      window.removeEventListener(SOFISWAP_SELECTED_NETWORK_CHANGE_EVENT, onNetworkChange);
    };
  }, [syncSession]);

  const onWalletCredentials = useCallback((credentials: WalletCredentials) => {
    try {
      const kp = keypairFromWalletCredentials(credentials);
      storeWalletSigningKey(credentials.address, kp.getSecretKey());
    } catch (e) {
      console.warn('[useMySocialAuth] onWalletCredentials:', e);
    }
  }, []);

  const signIn = useCallback(
    async (provider: AuthProvider = 'none') => {
      const auth = getMySocialAuthOrNull();
      if (!auth) throw new Error('MySocial Auth is not configured');
      setIsSigningIn(true);
      setAuthError(null);
      const signInOpts = { provider, onWalletCredentials } satisfies {
        provider: AuthProvider;
        onWalletCredentials: typeof onWalletCredentials;
      };
      try {
        if (shouldUseRedirect() || mySocialAuthForceRedirect()) {
          await auth.signIn({ ...signInOpts, mode: 'redirect' });
          return;
        }

        try {
          await auth.signIn({ ...signInOpts, mode: 'popup' });
          await syncSession();
        } catch (e) {
          if (e instanceof PopupBlockedError) {
            await auth.signIn({ ...signInOpts, mode: 'redirect' });
            return;
          }
          throw e;
        }
      } finally {
        setIsSigningIn(false);
      }
    },
    [onWalletCredentials, syncSession]
  );

  const signOut = useCallback(async (options?: { redirectTo?: string }) => {
    const auth = getMySocialAuthOrNull();
    if (auth) {
      await auth.signOut().catch(() => {});
    }
    clearAllWalletSigningKeys();
    clearTradeGateOkForPrefix();
    clearGraphqlProfileCacheForPrefix();
    setSession(null);
    setDisplayAddress(null);
    setKeypair(null);
    if (typeof window !== 'undefined') {
      if (options?.redirectTo) {
        window.location.assign(options.redirectTo);
      } else {
        window.location.reload();
      }
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
