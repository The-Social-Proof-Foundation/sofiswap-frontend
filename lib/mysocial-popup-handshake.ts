/**
 * Popup sign-in handshake.
 *
 * Popup auth normally completes by `postMessage` to the opener, which the SDK verifies
 * against the `state`/`nonce` it generated. When that channel is unavailable, the popup
 * window loads `/auth/callback` with the result in the URL and relays it over a
 * `BroadcastChannel` instead.
 *
 * That relay is same-origin only, but without a check it would accept a result from *any*
 * page load — so a crafted `/auth/callback?_popup_fallback=1&…` link could hand an already
 * signed-in visitor someone else's session. The opener therefore records its intent here
 * (localStorage, which same-origin tabs share) before opening the popup, and the relay
 * consumes that marker exactly once. A callback that nobody initiated relays nothing.
 */

const INTENT_KEY = 'mysocial_popup_intent_v1';

/** Long enough to finish a sign-in, short enough that a stale marker is not a standing grant. */
const INTENT_TTL_MS = 5 * 60 * 1000;

function storage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    /* storage disabled (private mode / blocked cookies) */
    return null;
  }
}

/** Records that this browser just initiated a popup sign-in. */
export function markPopupIntent(): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(INTENT_KEY, String(Date.now()));
  } catch {
    /* quota */
  }
}

export function clearPopupIntent(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(INTENT_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Returns true at most once per initiated popup sign-in, and only while the intent is
 * still fresh. Consuming deletes the marker so a replayed callback URL is rejected.
 */
export function consumePopupIntent(): boolean {
  const store = storage();
  if (!store) return false;
  let raw: string | null = null;
  try {
    raw = store.getItem(INTENT_KEY);
  } catch {
    return false;
  }
  if (!raw) return false;
  clearPopupIntent();
  const startedAt = Number(raw);
  if (!Number.isFinite(startedAt)) return false;
  return Date.now() - startedAt <= INTENT_TTL_MS;
}
