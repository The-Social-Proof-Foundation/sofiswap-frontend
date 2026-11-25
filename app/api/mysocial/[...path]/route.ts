import type { NextRequest } from 'next/server';

import {
  SALT_LIMIT,
  SALT_MAX_BODY_BYTES,
  clientKey,
  corsHeaders,
  enforceBodyLimit,
  enforceRateLimit,
  isAllowedOrigin,
  jsonError,
} from '@/lib/api-guard';
import {
  getCurrentNetworkFromCookies,
  getMySocialSaltApiBaseUrl,
} from '@/lib/network-utils';

export const runtime = 'nodejs';
export const maxDuration = 60;

function saltApiOrigin(request: NextRequest): string {
  const cookieHeader = request.headers.get('cookie');
  const net = getCurrentNetworkFromCookies(cookieHeader);
  return getMySocialSaltApiBaseUrl(net);
}

/** Rejects segments that could escape the intended upstream path. */
function isSafePathSegment(segment: string): boolean {
  if (!segment) return false;
  const decoded = decodeURIComponent(segment);
  if (decoded.includes('..') || decoded.includes('/') || decoded.includes('\\')) return false;
  return true;
}

async function forward(
  request: NextRequest,
  pathSegments: string[]
): Promise<Response> {
  const origin = request.headers.get('origin');
  if (!isAllowedOrigin(origin)) {
    return jsonError(request, 'origin_not_allowed', 'This origin is not allowed to use the auth proxy.');
  }

  if (pathSegments.length === 0) {
    return jsonError(request, 'invalid_request', 'Missing path.');
  }
  if (!pathSegments.every(isSafePathSegment)) {
    return jsonError(request, 'invalid_request', 'Invalid path.');
  }

  if (!enforceBodyLimit(request, SALT_MAX_BODY_BYTES)) {
    return jsonError(request, 'body_too_large', 'Request body is too large.');
  }

  const limit = enforceRateLimit(`salt:${clientKey(request)}`, SALT_LIMIT, 60_000);
  if (!limit.ok) {
    return jsonError(request, 'rate_limited', 'Too many auth requests. Please slow down.', {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const path = pathSegments.join('/');
  const upstream = new URL(`${saltApiOrigin(request)}/${path}`);
  upstream.search = request.nextUrl.search;

  const headers = new Headers();
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('Content-Type', contentType);
  const accept = request.headers.get('accept');
  if (accept) headers.set('Accept', accept);
  const authorization = request.headers.get('authorization');
  if (authorization) headers.set('Authorization', authorization);

  let body: BodyInit | undefined;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const buf = await request.arrayBuffer();
    if (buf.byteLength > 0) body = buf;
  }

  try {
    const res = await fetch(upstream, {
      method: request.method,
      headers,
      body,
    });

    // Responses to token-bearing endpoints must never be stored by a shared cache.
    const out = new Headers({ ...corsHeaders(request), 'Cache-Control': 'no-store' });
    const rct = res.headers.get('content-type');
    if (rct) out.set('Content-Type', rct);

    const payload = await res.arrayBuffer();
    return new Response(payload, { status: res.status, headers: out });
  } catch (error) {
    console.error('[mysocial proxy] upstream request failed', error);
    return jsonError(request, 'upstream_error', 'Could not reach the auth service. Please try again.');
  }
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
) {
  const { path = [] } = await ctx.params;
  return forward(request, path);
}

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
) {
  const { path = [] } = await ctx.params;
  return forward(request, path);
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (origin && !isAllowedOrigin(origin)) {
    return new Response(null, { status: 403, headers: corsHeaders(request) });
  }
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}
