import type { MySocialAuth, Session } from '@socialproof/mysocial-auth';
import { WALLET_ONLY_ACCESS_TOKEN } from '@socialproof/mysocial-auth';
import { Ed25519Keypair } from '@socialproof/myso/keypairs/ed25519';

import { getMySocialAuthConfig } from '@/lib/mysocial-auth-client';

/** Salt API expects a concrete JSON variant (not `{}`); we send the provider OIDC JWT, matching `useGoogleAuth`. */
export async function fetchSaltWithBearer(
  apiBaseUrl: string,
  bearerToken: string,
  providerJwt: string
): Promise<string> {
  const base = apiBaseUrl.replace(/\/$/, '');
  const res = await fetch(`${base}/salt`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bearerToken}`,
    },
    body: JSON.stringify({ jwt: providerJwt.trim() }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Salt request failed: ${res.status} ${text}`);
  }
  const data: unknown = await res.json();
  if (typeof data === 'object' && data !== null && 'salt' in data) {
    const salt = (data as { salt: unknown }).salt;
    if (typeof salt === 'string') return salt;
  }
  throw new Error('Unexpected salt response shape');
}

function tokenLooksLikeJwt(token: string): boolean {
  return token.split('.').length === 3 && token.length > 20;
}

function resolveProviderJwtForSalt(session: Session, apiBearer: string): string | undefined {
  if (session.id_token?.trim()) return session.id_token.trim();
  if (
    session.access_token &&
    session.access_token !== WALLET_ONLY_ACCESS_TOKEN &&
    tokenLooksLikeJwt(session.access_token)
  ) {
    return session.access_token.trim();
  }
  if (tokenLooksLikeJwt(apiBearer)) return apiBearer.trim();
  return undefined;
}

export async function getSaltFromMySocialAuth(auth: MySocialAuth): Promise<string> {
  const session = await auth.getSession();
  if (!session) {
    throw new Error('No session for salt');
  }

  let apiBearer: string | undefined;
  try {
    apiBearer = await auth.getAccessTokenForApi();
  } catch {
    apiBearer = undefined;
  }
  if (!apiBearer) {
    if (session.access_token !== WALLET_ONLY_ACCESS_TOKEN) {
      apiBearer = session.session_access_token ?? session.access_token;
    } else {
      apiBearer = session.session_access_token;
    }
  }
  if (!apiBearer) {
    throw new Error('No bearer token available for salt');
  }

  const providerJwt = resolveProviderJwtForSalt(session, apiBearer);
  if (!providerJwt) {
    throw new Error(
      'No JWT for salt request body (need id_token or JWT-shaped access/session token)'
    );
  }

  const { apiBaseUrl } = getMySocialAuthConfig();
  return fetchSaltWithBearer(apiBaseUrl, apiBearer, providerJwt);
}

/**
 * MySocial / MySo addresses are typically `0x` + 64 hex chars (32 bytes).
 * Ethereum-style `0x` + 40 hex is accepted for compatibility.
 */
export function mySoAddressFromString(s: string | undefined): string | null {
  if (!s) return null;
  const t = String(s).trim();
  if (!/^0x[0-9a-fA-F]+$/i.test(t)) return null;
  const nibbles = t.length - 2;
  if (nibbles !== 40 && nibbles !== 64) return null;
  return t;
}

export function parseJwtPayload(jwt: string): Record<string, unknown> | null {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3 || !parts[1]) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
    if (typeof globalThis.atob !== 'function') return null;
    const decoded = globalThis.atob(padded);
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function resolveDisplayAddress(session: Session): string | null {
  const fromUser = mySoAddressFromString(session.user?.address as string | undefined);
  if (fromUser) return fromUser;
  if (session.id_token) {
    const payload = parseJwtPayload(session.id_token);
    const addr = payload?.address;
    if (typeof addr === 'string') {
      const h = mySoAddressFromString(addr);
      if (h) return h;
    }
    const sub = payload?.sub;
    if (typeof sub === 'string') {
      const h = mySoAddressFromString(sub);
      if (h) return h;
    }
  }
  return null;
}

export async function generateKeypairFromSalt(
  providerSub: string,
  salt: string
): Promise<Ed25519Keypair> {
  const combined = `${providerSub}_${salt}`;
  const data = new TextEncoder().encode(combined);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const seed = new Uint8Array(hashBuffer).slice(0, 32);
  return Ed25519Keypair.fromSecretKey(seed);
}

/** Build a session object from popup/Broadcast `MYSOCIAL_AUTH_RESULT` style payloads. */
export function sessionFromAuthResultFields(msg: Record<string, unknown>): Session {
  const userRaw = msg.user;
  let user: Session['user'] =
    typeof userRaw === 'object' && userRaw !== null
      ? (userRaw as Session['user'])
      : {};
  if (!user.sub && !user.id && typeof msg.sub === 'string') {
    user = { ...user, sub: msg.sub };
  }
  if (typeof msg.address === 'string' && !user.address) {
    user = { ...user, address: msg.address };
  }

  const effectiveToken =
    (msg.session_access_token as string | undefined) ??
    (msg.access_token as string | undefined) ??
    (msg.code as string | undefined);
  if (!effectiveToken) {
    throw new Error('Auth result missing token');
  }

  const expiresAt =
    msg.expires_at != null
      ? Number(msg.expires_at)
      : msg.expires_in != null
        ? Date.now() + Number(msg.expires_in) * 1000
        : Date.now() + 3600_000;

  const sub =
    (typeof user.sub === 'string' && user.sub) ||
    (typeof user.id === 'string' && user.id) ||
    (typeof msg.sub === 'string' ? msg.sub : '') ||
    '';

  const session: Session = {
    access_token: effectiveToken,
    expires_at: expiresAt,
    sub,
    user,
  };

  if (typeof msg.session_access_token === 'string') {
    session.session_access_token = msg.session_access_token;
  }
  if (typeof msg.refresh_token === 'string') {
    session.refresh_token = msg.refresh_token;
  }
  if (typeof msg.id_token === 'string') {
    session.id_token = msg.id_token;
  }
  if (typeof msg.salt === 'string') {
    session.salt = msg.salt;
  }

  return session;
}
