import https from 'https';

import axios from 'axios';
import { type NextRequest, NextResponse } from 'next/server';

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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
} as const;

const jsonHeaders = {
  ...corsHeaders,
  'Content-Type': 'application/json',
} as const;

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
    maxVersion: 'TLSv1.2',
    ...(rejectUnauthorized === false && {
      checkServerIdentity: () => undefined,
    }),
  };

  return new https.Agent(secureOptions);
}

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: { ...corsHeaders },
  });
}

export async function POST(request: NextRequest) {
  try {
    const cookieHeader = request.headers.get('cookie');
    const selected = request.nextUrl.searchParams.get('network');
    if (selected != null && !isNetworkType(selected)) return NextResponse.json({ error: 'Unsupported network.' }, { status: 400 });
    const network = isNetworkType(selected) ? selected : getCurrentNetworkFromCookies(cookieHeader);
    if (!isSponsoredGasAllowed(network)) {
      const msg =
        'Sponsored transactions are not available on localnet. Please ensure you have sufficient MySo balance to pay for gas.';
      console.warn('🛢️ [Gas Pool Reserve] Sponsored transactions not allowed on localnet');
      return NextResponse.json(
        { error: msg, message: msg },
        { status: 400, headers: { ...jsonHeaders } }
      );
    }

    const body = await request.json();

    console.log('🛢️ [Gas Pool Reserve] Request Details:');
    console.log('  Gas Budget:', (body as { gas_budget?: unknown }).gas_budget);
    console.log(
      '  Reserve Duration:',
      (body as { reserve_duration_secs?: unknown }).reserve_duration_secs
    );
    console.log('  Network:', network);

    const baseRaw = getGasPoolBaseUrlForNetwork(network);
    if (!baseRaw?.trim()) {
      console.error(
        `❌ [Gas Pool Reserve] No URL for network="${network}". Set NEXT_PUBLIC_GAS_POOL_URL or NEXT_PUBLIC_GAS_POOL_URL_${
          network === 'mainnet' ? 'MAINNET' : 'TESTNET'
        }.`
      );
      throw new Error(
        'Gas pool service URL is not configured. Please contact support.'
      );
    }

    const token = getGasPoolBearerTokenForNetwork(network);
    if (!token) {
      console.error(
        `❌ [Gas Pool Reserve] Missing gas pool token for network="${network}"`
      );
      throw new Error(
        'Gas pool authentication token is not configured. Please contact support.'
      );
    }

    const reserveUrl = buildGasPoolReserveHttpUrl(normalizeGasPoolBaseUrl(baseRaw));
    console.log('🛢️ [Gas Pool Reserve] Calling gas pool service:', reserveUrl);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    try {
      const httpsAgent = createHttpsAgent();
      const isProduction = process.env.NODE_ENV === 'production';
      const allowInsecure = process.env.GAS_POOL_ALLOW_INSECURE_SSL === 'true';

      console.log('🔒 [Gas Pool Reserve] SSL Config:', {
        rejectUnauthorized: isProduction ? !allowInsecure : false,
        minVersion: 'TLSv1.2',
        maxVersion: 'TLSv1.2',
        nodeEnv: process.env.NODE_ENV,
      });

      const axiosResponse = await axios.post(reserveUrl, body, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        httpsAgent,
        timeout: 30_000,
        signal: controller.signal,
        validateStatus: (status) => status < 500,
      });

      clearTimeout(timeoutId);

      console.log('🛢️ [Gas Pool Reserve] Response status:', axiosResponse.status);

      if (axiosResponse.status >= 400) {
        const errorText =
          typeof axiosResponse.data === 'string'
            ? axiosResponse.data
            : JSON.stringify(axiosResponse.data);
        console.error('❌ [Gas Pool Reserve] HTTP Error Response:');
        console.error('  Status:', axiosResponse.status);
        console.error('  Status Text:', axiosResponse.statusText);
        console.error('  Body:', errorText);
        console.error('  Request URL:', reserveUrl);

        if (axiosResponse.status === 405) {
          throw new Error(
            `Gas pool endpoint does not accept POST method. Endpoint: ${reserveUrl}. The API endpoint path or method may be incorrect.`
          );
        }

        throw new Error(`HTTP error! status: ${axiosResponse.status}, response: ${errorText}`);
      }

      const data = axiosResponse.data;

      console.log('✅ [Gas Pool Reserve] Success:', {
        reservationId: data.result?.reservation_id,
        sponsorAddress: data.result?.sponsor_address,
      });

      return NextResponse.json(data, { headers: { ...jsonHeaders } });
    } catch (fetchError: unknown) {
      clearTimeout(timeoutId);
      const fe = fetchError as { name?: string; code?: string };
      if (fe.name === 'AbortError' || fe.code === 'ECONNABORTED') {
        throw new Error('Request timed out after 30 seconds');
      }
      throw fetchError;
    }
  } catch (error: unknown) {
    const err = error as {
      message?: string;
      stack?: string;
      name?: string;
      constructor?: { name?: string };
      code?: string;
      cause?: unknown;
    };

    console.error('❌ [Gas Pool Reserve] Exception occurred:');
    console.error('  Error:', err.message);
    console.error('  Stack:', err.stack);
    console.error('  Error type:', err.constructor?.name);

    let errorMessage = err.message || 'Unknown error occurred';
    let errorDetails = String(error);

    if (
      err.name === 'AbortError' ||
      err.code === 'ECONNABORTED' ||
      err.message?.includes('timeout')
    ) {
      errorMessage =
        'Gas pool service request timed out. The service may be temporarily unavailable. Please try again.';
    } else if (
      err.message?.includes('405') ||
      err.message?.includes('Method Not Allowed') ||
      err.message?.includes('does not accept POST')
    ) {
      errorMessage =
        'Gas pool API endpoint does not accept POST method. The endpoint path or method may be incorrect. Please verify the gas pool API configuration.';
      const base = getGasPoolBaseUrlForNetwork(
        getCurrentNetworkFromCookies(request.headers.get('cookie'))
      );
      errorDetails = `Method Not Allowed (405): ${err.message}. Endpoint: ${
        base ? `${normalizeGasPoolBaseUrl(base)}/v1/reserve_gas` : 'unknown'
      }`;
    } else if (
      err.code === 'EPROTO' ||
      err.message?.includes('SSL') ||
      err.message?.includes('TLS') ||
      err.message?.includes('handshake')
    ) {
      errorMessage =
        'SSL/TLS handshake failed with gas pool service. This may be a protocol or certificate issue.';
      errorDetails = `SSL/TLS error: ${err.message}. ${err.code ? `Code: ${err.code}` : ''}`;
      console.error('🔒 SSL/TLS Error Details:', {
        code: err.code,
        message: err.message,
        stack: err.stack,
      });
    } else if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      errorMessage =
        'Unable to connect to gas pool service. Please check if the service is running.';
      errorDetails = `Connection error: ${err.message}. Code: ${err.code}`;
    } else if (err.message?.includes('fetch failed') || err.cause) {
      errorMessage =
        'Unable to connect to gas pool service. Please check your network connection and try again.';
      errorDetails = `Connection failed: ${err.message}. ${err.cause ? `Cause: ${String(err.cause)}` : ''}`;
    } else if (err.message?.includes('not configured')) {
      errorMessage = err.message;
    }

    return NextResponse.json(
      {
        error: 'Gas pool reserve request failed',
        details: errorDetails,
        message: errorMessage,
      },
      { status: 500, headers: { ...jsonHeaders } }
    );
  }
}
