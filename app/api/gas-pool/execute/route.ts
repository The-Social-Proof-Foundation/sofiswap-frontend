import https from 'https';

import axios from 'axios';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import {
  GAS_POOL_EXECUTE_LIMIT,
  GAS_POOL_MAX_BODY_BYTES,
  clientKey,
  corsHeaders,
  enforceBodyLimit,
  enforceRateLimit,
  isAllowedOrigin,
  jsonError,
  preflightResponse,
} from '@/lib/api-guard';
import {
  buildGasPoolExecuteHttpUrl,
  getCurrentNetworkFromCookies,
  getGasPoolBaseUrlForNetwork,
  getGasPoolBearerTokenForNetwork,
  isSponsoredGasAllowed,
  isNetworkType,
  normalizeGasPoolBaseUrl,
} from '@/lib/network-utils';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** A sponsored transaction is bounded client-side; cap it so this proxy cannot be used as a bulk relay. */
const MAX_TX_BYTES_CHARS = 96 * 1024;

const executeRequestSchema = z
  .object({
    reservation_id: z.number().int().nonnegative(),
    tx_bytes: z.string().min(1).max(MAX_TX_BYTES_CHARS),
    user_sig: z.string().min(1).max(8 * 1024),
  })
  .strict();

function createHttpsAgent(): https.Agent {
  const isProduction = process.env.NODE_ENV === 'production';
  const allowInsecure = process.env.GAS_POOL_ALLOW_INSECURE_SSL === 'true';
  const rejectUnauthorized = isProduction ? !allowInsecure : false;

  const secureOptions: https.AgentOptions = {
    rejectUnauthorized,
    keepAlive: true,
    keepAliveMsecs: 1000,
    maxSockets: 50,
    minVersion: 'TLSv1.2',
    ...(rejectUnauthorized === false && {
      checkServerIdentity: () => undefined,
    }),
  };

  return new https.Agent(secureOptions);
}

export async function OPTIONS(request: NextRequest) {
  return preflightResponse(request);
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!isAllowedOrigin(origin)) {
    return jsonError(request, 'origin_not_allowed', 'This origin is not allowed to use the gas pool.');
  }

  if (!enforceBodyLimit(request, GAS_POOL_MAX_BODY_BYTES)) {
    return jsonError(request, 'body_too_large', 'Request body is too large.');
  }

  const limit = enforceRateLimit(
    `gas-execute:${clientKey(request)}`,
    GAS_POOL_EXECUTE_LIMIT,
    60_000
  );
  if (!limit.ok) {
    return jsonError(request, 'rate_limited', 'Too many sponsored submissions. Please slow down.', {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const selected = request.nextUrl.searchParams.get('network');
  if (selected != null && !isNetworkType(selected)) {
    return jsonError(request, 'invalid_request', 'Unsupported network.');
  }
  const network = isNetworkType(selected)
    ? selected
    : getCurrentNetworkFromCookies(request.headers.get('cookie'));

  if (!isSponsoredGasAllowed(network)) {
    const message =
      'Sponsored transactions are not available on localnet. Please ensure you have sufficient MySo balance to pay for gas.';
    return jsonError(request, 'invalid_request', message);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(request, 'invalid_request', 'Invalid request body.');
  }

  const parsed = executeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      request,
      'invalid_request',
      'Invalid sponsored submission. reservation_id, tx_bytes and user_sig are required.'
    );
  }

  const baseRaw = getGasPoolBaseUrlForNetwork(network);
  if (!baseRaw?.trim()) {
    console.error('[Gas Pool Execute] Gas pool URL is not configured for this network.');
    return jsonError(request, 'not_configured', 'The gas pool service is not configured.');
  }

  const token = getGasPoolBearerTokenForNetwork(network);
  if (!token) {
    console.error('[Gas Pool Execute] Gas pool token is not configured for this network.');
    return jsonError(request, 'not_configured', 'The gas pool service is not configured.');
  }

  const executeUrl = buildGasPoolExecuteHttpUrl(normalizeGasPoolBaseUrl(baseRaw));

  try {
    const axiosResponse = await axios.post(executeUrl, parsed.data, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      httpsAgent: createHttpsAgent(),
      timeout: 30_000,
      validateStatus: (status) => status < 500,
    });

    if (axiosResponse.status >= 400) {
      // Log upstream detail server-side; return a stable message to the caller.
      const upstreamText =
        typeof axiosResponse.data === 'string'
          ? axiosResponse.data
          : JSON.stringify(axiosResponse.data);
      console.error('[Gas Pool Execute] Upstream rejected the submission:', {
        status: axiosResponse.status,
        body: upstreamText.slice(0, 500),
      });
      return jsonError(
        request,
        'upstream_error',
        'The gas pool could not submit this transaction. Please try again.'
      );
    }

    return NextResponse.json(axiosResponse.data, { headers: corsHeaders(request) });
  } catch (error: unknown) {
    const err = error as { name?: string; code?: string; message?: string };
    const timedOut = err.name === 'AbortError' || err.code === 'ECONNABORTED';
    console.error('[Gas Pool Execute] Request failed:', {
      name: err.name,
      code: err.code,
      message: err.message,
    });
    return jsonError(
      request,
      'upstream_error',
      timedOut
        ? 'The gas pool request timed out. Please try again.'
        : 'Could not reach the gas pool service. Please try again.'
    );
  }
}
