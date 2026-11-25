import https from 'https';

import axios from 'axios';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import {
  GAS_POOL_MAX_BODY_BYTES,
  GAS_POOL_RESERVE_LIMIT,
  clientKey,
  corsHeaders,
  enforceBodyLimit,
  enforceRateLimit,
  isAllowedOrigin,
  jsonError,
  preflightResponse,
} from '@/lib/api-guard';
import {
  buildGasPoolReserveHttpUrl,
  getCurrentNetworkFromCookies,
  getGasPoolBaseUrlForNetwork,
  getGasPoolBearerTokenForNetwork,
  isSponsoredGasAllowed,
  isNetworkType,
  normalizeGasPoolBaseUrl,
} from '@/lib/network-utils';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Server-enforced ceilings. A caller controls these fields, so they must be bounded here:
 * a huge `gas_budget` or `reserve_duration_secs` would otherwise let one anonymous request
 * tie up an arbitrary slice of the sponsor's pool.
 */
const MAX_GAS_BUDGET = 200_000_000;
const MAX_RESERVE_DURATION_SECS = 3_600;

const reserveRequestSchema = z
  .object({
    gas_budget: z.number().int().positive().max(MAX_GAS_BUDGET),
    reserve_duration_secs: z.number().int().positive().max(MAX_RESERVE_DURATION_SECS),
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
    `gas-reserve:${clientKey(request)}`,
    GAS_POOL_RESERVE_LIMIT,
    60_000
  );
  if (!limit.ok) {
    return jsonError(request, 'rate_limited', 'Too many gas reservations. Please slow down.', {
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

  const parsed = reserveRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      request,
      'invalid_request',
      `Invalid reservation request. gas_budget must be a positive integer up to ${MAX_GAS_BUDGET} and reserve_duration_secs up to ${MAX_RESERVE_DURATION_SECS}.`
    );
  }

  const baseRaw = getGasPoolBaseUrlForNetwork(network);
  if (!baseRaw?.trim()) {
    console.error('[Gas Pool Reserve] Gas pool URL is not configured for this network.');
    return jsonError(request, 'not_configured', 'The gas pool service is not configured.');
  }

  const token = getGasPoolBearerTokenForNetwork(network);
  if (!token) {
    console.error('[Gas Pool Reserve] Gas pool token is not configured for this network.');
    return jsonError(request, 'not_configured', 'The gas pool service is not configured.');
  }

  const reserveUrl = buildGasPoolReserveHttpUrl(normalizeGasPoolBaseUrl(baseRaw));
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  try {
    const axiosResponse = await axios.post(reserveUrl, parsed.data, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      httpsAgent: createHttpsAgent(),
      timeout: 30_000,
      signal: controller.signal,
      validateStatus: (status) => status < 500,
    });

    clearTimeout(timeoutId);

    if (axiosResponse.status >= 400) {
      // Log the upstream cause server-side; never echo it to the caller.
      const upstreamText =
        typeof axiosResponse.data === 'string'
          ? axiosResponse.data
          : JSON.stringify(axiosResponse.data);
      console.error('[Gas Pool Reserve] Upstream rejected the reservation:', {
        status: axiosResponse.status,
        body: upstreamText.slice(0, 500),
      });
      return jsonError(
        request,
        'upstream_error',
        'The gas pool declined this reservation. Please try again.'
      );
    }

    return NextResponse.json(axiosResponse.data, { headers: corsHeaders(request) });
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    const err = error as { name?: string; code?: string; message?: string };
    const timedOut = err.name === 'AbortError' || err.code === 'ECONNABORTED';
    console.error('[Gas Pool Reserve] Request failed:', {
      name: err.name,
      code: err.code,
      message: err.message,
    });
    return jsonError(
      request,
      timedOut ? 'upstream_error' : 'upstream_error',
      timedOut
        ? 'The gas pool request timed out. Please try again.'
        : 'Could not reach the gas pool service. Please try again.'
    );
  }
}
