'use client';

import {
  RateLimitError,
  SessionRevokedError,
} from '@socialproof/mysocial-auth';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';

import {
  getMySocialAuth,
  getMySocialAuthOrNull,
  isMySocialAuthConfigured,
  MYSOCIAL_AUTH_BROADCAST_CHANNEL,
} from '@/lib/mysocial-auth-client';

function paramFromUrl(url: URL, key: string): string | null {
  const q = url.searchParams.get(key);
  if (q !== null && q !== '') return q;
  return new URLSearchParams(url.hash.slice(1)).get(key);
}

function runPopupFallback(): void {
  const url = new URL(window.location.href);
  const channel = new BroadcastChannel(MYSOCIAL_AUTH_BROADCAST_CHANNEL);
  const oauthError = paramFromUrl(url, 'error');
  if (oauthError) {
    channel.postMessage({
      type: 'MYSOCIAL_AUTH_ERROR',
      error: oauthError,
      error_description: paramFromUrl(url, 'error_description'),
      state: paramFromUrl(url, 'state'),
      clientId: paramFromUrl(url, 'client_id'),
      requestId: paramFromUrl(url, 'request_id'),
    });
    channel.close();
    window.close();
    return;
  }

  let user: Record<string, unknown> = {};
  const userParam = paramFromUrl(url, 'user');
  if (userParam) {
    try {
      const parsed = JSON.parse(decodeURIComponent(userParam)) as unknown;
      if (parsed && typeof parsed === 'object') {
        user = parsed as Record<string, unknown>;
      }
    } catch {
      user = {};
    }
  }
  const addressParam = paramFromUrl(url, 'address');
  if (addressParam) user.address = addressParam;
  const subParam = paramFromUrl(url, 'sub');
  if (subParam) user.sub = subParam;

  const message: Record<string, unknown> = {
    type: 'MYSOCIAL_AUTH_RESULT',
    code: paramFromUrl(url, 'code'),
    state: paramFromUrl(url, 'state'),
    nonce: paramFromUrl(url, 'nonce'),
    clientId: paramFromUrl(url, 'client_id'),
    requestId: paramFromUrl(url, 'request_id'),
    access_token: paramFromUrl(url, 'access_token'),
    session_access_token: paramFromUrl(url, 'session_access_token'),
    id_token: paramFromUrl(url, 'id_token'),
    refresh_token: paramFromUrl(url, 'refresh_token'),
    salt: paramFromUrl(url, 'salt'),
    user,
  };
  const expAt = paramFromUrl(url, 'expires_at');
  const expIn = paramFromUrl(url, 'expires_in');
  if (expAt) message.expires_at = Number(expAt);
  if (expIn) message.expires_in = Number(expIn);
  if (subParam) message.sub = subParam;

  channel.postMessage(message);
  channel.close();
  window.close();
}

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [note, setNote] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    if (!isMySocialAuthConfigured()) {
      setNote('Auth is not configured. Set NEXT_PUBLIC_MYSOCIAL_AUTH_CLIENT_ID.');
      return;
    }

    const popupFallback = searchParams.get('_popup_fallback') === '1';

    if (popupFallback) {
      try {
        runPopupFallback();
      } catch (e) {
        console.error('[auth/callback] popup fallback', e);
      }
      return;
    }

    void (async () => {
      try {
        const href = window.location.href;
        const parsed = new URL(href);
        const state = parsed.searchParams.get('state');
        if (state) {
          const guardKey = `mysocial_cb_state_${state}`;
          if (sessionStorage.getItem(guardKey)) {
            router.replace('/trade');
            return;
          }
          sessionStorage.setItem(guardKey, '1');
        }

        const auth = getMySocialAuth();
        await auth.handleRedirectCallback(href);
        if (window.opener && !window.opener.closed) {
          window.close();
          return;
        }
        router.replace('/trade');
      } catch (e) {
        console.error('[auth/callback]', e);
        try {
          const st = new URL(window.location.href).searchParams.get('state');
          if (st) sessionStorage.removeItem(`mysocial_cb_state_${st}`);
        } catch {
          /* ignore */
        }
        if (e instanceof SessionRevokedError) {
          await getMySocialAuthOrNull()?.signOut().catch(() => {});
        }
        const dest =
          e instanceof RateLimitError
            ? '/trade?error=rate_limit'
            : '/trade?error=auth_failed';
        router.replace(dest);
      }
    })();
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background font-sans text-foreground">
      <p className="text-sm text-muted-foreground">{note ?? 'Completing sign-in…'}</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background font-sans">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}
