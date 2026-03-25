'use client';

import { useEffect } from 'react';

import {
  MYSOCIAL_AUTH_BROADCAST_CHANNEL,
  MYSOCIAL_AUTH_BROADCAST_SESSION_EVENT,
  resetMySocialAuthInstance,
  SESSION_KEY,
} from '@/lib/mysocial-auth-client';
import { sessionFromAuthResultFields } from '@/lib/mysocial-oauth-utils';

export const MYSOCIAL_AUTH_BROADCAST_ERROR_EVENT = 'mysocial-auth-broadcast-error';

/**
 * Listens for `MYSOCIAL_AUTH_RESULT` / `MYSOCIAL_AUTH_ERROR` on BroadcastChannel `mysocial-auth`
 * (popup fallback from `/auth/callback`) and syncs sessionStorage with the SDK shape.
 */
export function MySocialAuthBroadcastListener() {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
      return;
    }

    const channel = new BroadcastChannel(MYSOCIAL_AUTH_BROADCAST_CHANNEL);

    channel.onmessage = (event: MessageEvent<unknown>) => {
      const data = event.data;
      if (!data || typeof data !== 'object' || !('type' in data)) return;
      const msg = data as { type?: string; error?: string };

      if (msg.type === 'MYSOCIAL_AUTH_RESULT') {
        try {
          const session = sessionFromAuthResultFields(msg as Record<string, unknown>);
          sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
          resetMySocialAuthInstance();
          window.dispatchEvent(new Event(MYSOCIAL_AUTH_BROADCAST_SESSION_EVENT));
        } catch (e) {
          console.error('[MySocialAuthBroadcastListener] Failed to persist session:', e);
        }
        return;
      }

      if (msg.type === 'MYSOCIAL_AUTH_ERROR') {
        window.dispatchEvent(
          new CustomEvent(MYSOCIAL_AUTH_BROADCAST_ERROR_EVENT, {
            detail: msg,
          })
        );
      }
    };

    return () => channel.close();
  }, []);

  return null;
}
