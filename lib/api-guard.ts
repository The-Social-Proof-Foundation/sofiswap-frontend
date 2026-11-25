/**
 * Shared guards for the server-side API routes.
 *
 * These routes proxy privileged upstream services (sponsored gas, the fullnode, the Salt
 * signing API) using server-held credentials, so they must not behave as open relays.
 *
 * Layering, weakest to strongest:
 *  - `corsHeaders` stops *browser* callers from other origins reading responses.
 *  - `enforceRateLimit` bounds how much any single client can consume.
 *  - Per-route schema validation and server-side clamping bound the *value* of a request.
 *
 * Note: the rate limiter is per server instance (in-memory). It is a real bound on abuse
 * but not a distributed one; put a shared limiter at the edge when one is available.
 */

import { NextResponse } from 'next/server';

/** How the app may be reached; used to build the browser-facing allowlist. */
function configuredOrigins(): string[] {
  const raw = [
    process.env.NEXT_PUBLIC_BASE_URL,
    process.env.NEXT_PUBLIC_APP_ORIGIN,
  ];
  const origins: string[] = [];
  for (const value of raw) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    try {
      origins.push(new URL(trimmed).origin);
    } catch {
      /* ignore malformed configuration rather than throwing at request time */
    }
  }
  return origins;
}

function isDev(): boolean {
  return process.env.NODE_ENV !== 'production';
}

/**
 * Origins permitted to call these routes from a browser. Same-origin requests either
 * omit `Origin` (same-origin GET/navigation) or send the app's own origin.
 */
export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true; // same-origin fetches may omit Origin entirely
  const allowed = new Set(configuredOrigins());
  if (allowed.has(origin)) return true;
  if (isDev() && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return false;
}

/**
 * CORS headers for a request. Echoes the caller's origin only when it is allowlisted, so
 * a third-party site cannot read a sponsored-gas or RPC response.
 */
export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin');
  const headers: Record<string, string> = {
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
  if (origin && isAllowedOrigin(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

export function preflightResponse(request: Request): Response {
  const origin = request.headers.get('origin');
  if (origin && !isAllowedOrigin(origin)) {
    return new Response(null, { status: 403, headers: corsHeaders(request) });
  }
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

/** Best-effort client identity for rate limiting. */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Drops expired buckets so the map cannot grow without bound. */
function sweep(now: number): void {
  if (buckets.size < 5_000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

/** Fixed-window limiter. `limit` requests per `windowMs` per `key`. */
export function enforceRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (existing.count >= limit) {
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
  }
  existing.count += 1;
  return { ok: true };
}

/** Test seam: clears all rate-limit state. */
export function resetRateLimits(): void {
  buckets.clear();
}

/**
 * Rejects a body larger than `maxBytes` before it is buffered. Route handlers do not
 * inherit `experimental.serverActions.bodySizeLimit`, so this must be checked per route.
 */
export function enforceBodyLimit(request: Request, maxBytes: number): boolean {
  const declared = request.headers.get('content-length');
  if (declared) {
    const size = Number(declared);
    if (Number.isFinite(size) && size > maxBytes) return false;
  }
  return true;
}

export type ApiErrorCode =
  | 'origin_not_allowed'
  | 'rate_limited'
  | 'body_too_large'
  | 'invalid_request'
  | 'not_configured'
  | 'upstream_error';

const STATUS: Record<ApiErrorCode, number> = {
  origin_not_allowed: 403,
  rate_limited: 429,
  body_too_large: 413,
  invalid_request: 400,
  not_configured: 503,
  upstream_error: 502,
};

/**
 * A stable, client-safe error envelope. Upstream response bodies and internal endpoint
 * URLs are never included — callers get a code and a message meant for end users.
 */
export function jsonError(
  request: Request,
  code: ApiErrorCode,
  message: string,
  extra?: Record<string, unknown>
): NextResponse {
  const headers = corsHeaders(request);
  if (code === 'rate_limited' && typeof extra?.retryAfterSeconds === 'number') {
    headers['Retry-After'] = String(extra.retryAfterSeconds);
  }
  return NextResponse.json(
    { error: message, code, ...(extra ?? {}) },
    { status: STATUS[code], headers }
  );
}

export function jsonOk(request: Request, data: unknown): NextResponse {
  return NextResponse.json(data, { headers: corsHeaders(request) });
}

export const GAS_POOL_MAX_BODY_BYTES = 128 * 1024;
/** One reservation per sponsored transaction; 60/min leaves room for shared NATs. */
export const GAS_POOL_RESERVE_LIMIT = 60; // per client per minute
export const GAS_POOL_EXECUTE_LIMIT = 120; // per client per minute
export const RPC_MAX_BODY_BYTES = 512 * 1024;
export const RPC_LIMIT = 240; // per client per minute
export const SALT_MAX_BODY_BYTES = 256 * 1024;
export const SALT_LIMIT = 120; // per client per minute
