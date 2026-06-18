import { createMySocialAuth, type MySocialAuth } from '@socialproof/mysocial-auth';

import {
  getClientSelectedNetwork,
  getMySocialAuthOrigin,
  getMySocialSaltApiBaseUrl,
  type NetworkType,
} from '@/lib/network-utils';

/** Must match `SESSION_KEY` in `@socialproof/mysocial-auth` storage (sessionStorage). */
export const SESSION_KEY = 'mysocial_auth_session';

/** Must match `BroadcastChannel` name used on `/auth/callback` popup fallback. */
export const MYSOCIAL_AUTH_BROADCAST_CHANNEL = 'mysocial-auth';

/** Dispatched on `window` after popup fallback writes session to sessionStorage. */
export const MYSOCIAL_AUTH_BROADCAST_SESSION_EVENT = 'mysocial-auth-broadcast-session';

let authInstance: MySocialAuth | null = null;
let cachedAuthNetwork: NetworkType | null = null;

function readClientId(): string {
  return (
    process.env.NEXT_PUBLIC_MYSOCIAL_AUTH_CLIENT_ID ||
    process.env.NEXT_PUBLIC_DEV_CLIENT_ID ||
    ''
  );
}

/**
 * Same resolution as the MySocial reference client, evaluated when the auth instance
 * is created (client-side), not at module import — avoids a wrong redirect_uri baked in during SSR/build.
 */
function resolveAuthOptions(): {
  clientId: string;
  apiBaseUrl: string;
  authOrigin: string;
  redirectUri: string;
  baseUrl: string;
} {
  const clientId = readClientId();

  const envBase = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  let baseUrlRaw =
    envBase ||
    (typeof window !== 'undefined'
      ? window.location.origin
      : 'http://localhost:3000');

  if (typeof window !== 'undefined' && envBase) {
    try {
      const envHost = new URL(envBase).host;
      if (envHost !== window.location.host) {
        baseUrlRaw = window.location.origin;
      }
    } catch {
      baseUrlRaw = window.location.origin;
    }
  }

  const baseUrl = baseUrlRaw.replace(/\/$/, '');

  const override = process.env.NEXT_PUBLIC_MYSOCIAL_AUTH_REDIRECT_URI?.trim();
  let redirectUri = `${baseUrl}/auth/callback`;
  if (override) {
    if (typeof window !== 'undefined') {
      try {
        const o = new URL(override);
        if (o.host === window.location.host) {
          const path = o.pathname.replace(/\/$/, '') || '/';
          redirectUri =
            path === '/' ? `${o.origin}/auth/callback` : `${o.origin}${path}`;
        }
      } catch {
        // keep `${baseUrl}/auth/callback`
      }
    } else {
      try {
        const o = new URL(override);
        const path = o.pathname.replace(/\/$/, '') || '/';
        redirectUri =
          path === '/' ? `${o.origin}/auth/callback` : `${o.origin}${path}`;
      } catch {
        redirectUri = override;
      }
    }
  }

  const network = getClientSelectedNetwork();
  const authOrigin = getMySocialAuthOrigin(network);

  /**
   * The browser calls same-origin `/api/mysocial/*`; the server forwards to tier-specific Salt
   * (`getMySocialSaltApiBaseUrl`).
   */
  const apiBaseUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin.replace(/\/$/, '')}/api/mysocial`
      : getMySocialSaltApiBaseUrl(network);

  return { clientId, apiBaseUrl, authOrigin, redirectUri, baseUrl };
}

export function getMySocialAuthConfig() {
  return resolveAuthOptions();
}

export function resetMySocialAuthInstance() {
  authInstance = null;
  cachedAuthNetwork = null;
}

/**
 * clientId must be the MySocial auth console app id (Login with MySocial), not a raw Google OAuth client id.
 */
export function getMySocialAuth(): MySocialAuth {
  if (typeof window === 'undefined') {
    throw new Error('getMySocialAuth is only available in the browser');
  }

  const network = getClientSelectedNetwork();
  const { clientId, apiBaseUrl, authOrigin, redirectUri } = resolveAuthOptions();

  if (!clientId) {
    throw new Error(
      'MySocial Auth clientId is required. Set NEXT_PUBLIC_MYSOCIAL_AUTH_CLIENT_ID or NEXT_PUBLIC_DEV_CLIENT_ID in .env'
    );
  }

  if (!authInstance || cachedAuthNetwork !== network) {
    authInstance = createMySocialAuth({
      apiBaseUrl,
      authOrigin,
      clientId,
      redirectUri,
      storage: 'session',
    });
    cachedAuthNetwork = network;
  }

  return authInstance;
}

export function getMySocialAuthOrNull(): MySocialAuth | null {
  try {
    return getMySocialAuth();
  } catch {
    return null;
  }
}

export function isMySocialAuthConfigured(): boolean {
  return Boolean(readClientId());
}
