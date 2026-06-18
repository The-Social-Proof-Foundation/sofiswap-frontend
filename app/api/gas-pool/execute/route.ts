import https from 'https';

import axios from 'axios';
import { type NextRequest, NextResponse } from 'next/server';

import {
  buildGasPoolExecuteHttpUrl,
  getCurrentNetworkFromCookies,
  getGasPoolBaseUrlForNetwork,
  getGasPoolBearerTokenForNetwork,
  isSponsoredGasAllowedFromCookies,
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
    if (!isSponsoredGasAllowedFromCookies(cookieHeader)) {
      const msg =
        'Sponsored transactions are not available on localnet. Please ensure you have sufficient MySo balance to pay for gas.';
      console.warn('🚀 [Gas Pool Execute] Sponsored transactions not allowed on localnet');
      return NextResponse.json(
        { error: msg, message: msg },
        { status: 400, headers: { ...jsonHeaders } }
      );
    }

    const body = await request.json();
    const network = getCurrentNetworkFromCookies(cookieHeader);

    console.log('🚀 [Gas Pool Execute] Request Details:');
    console.log('  Reservation ID:', (body as { reservation_id?: unknown }).reservation_id);
    console.log('  TX Bytes Length:', (body as { tx_bytes?: string }).tx_bytes?.length || 0);
    console.log('  User Sig Length:', (body as { user_sig?: string }).user_sig?.length || 0);
    console.log('  Network:', network);

    const baseRaw = getGasPoolBaseUrlForNetwork(network);
    if (!baseRaw) {
      console.error(
        `❌ [Gas Pool Execute] No gas pool URL for network="${network}". Set NEXT_PUBLIC_GAS_POOL_URL or NEXT_PUBLIC_GAS_POOL_URL_${network === 'mainnet' ? 'MAINNET' : 'TESTNET'}.`
      );
      return NextResponse.json(
        { error: 'Gas pool URL configuration error' },
        { status: 500, headers: { ...jsonHeaders } }
      );
    }

    const token = getGasPoolBearerTokenForNetwork(network);
    if (!token) {
      console.error(
        `❌ [Gas Pool Execute] Missing gas pool token for network="${network}"`
      );
      return NextResponse.json(
        { error: 'Gas pool authentication token is not configured.' },
        { status: 500, headers: { ...jsonHeaders } }
      );
    }

    const executeUrl = buildGasPoolExecuteHttpUrl(normalizeGasPoolBaseUrl(baseRaw));

    const httpsAgent = createHttpsAgent();

    const axiosResponse = await axios.post(executeUrl, body, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      httpsAgent,
      timeout: 30_000,
      validateStatus: (status) => status < 500,
    });

    console.log('🚀 [Gas Pool Execute] Response status:', axiosResponse.status);

    if (axiosResponse.status >= 400) {
      const errorText =
        typeof axiosResponse.data === 'string'
          ? axiosResponse.data
          : JSON.stringify(axiosResponse.data);
      console.error('❌ [Gas Pool Execute] HTTP Error Response:');
      console.error('  Status:', axiosResponse.status);
      console.error('  Status Text:', axiosResponse.statusText);
      console.error('  Body:', errorText);
      throw new Error(`HTTP error! status: ${axiosResponse.status}, response: ${errorText}`);
    }

    const data = axiosResponse.data;

    console.log('✅ [Gas Pool Execute] Success:', {
      digest: data.result?.digest,
      effectsStatus: data.result?.effects?.status?.status,
    });

    return NextResponse.json(data, { headers: { ...jsonHeaders } });
  } catch (error: unknown) {
    const err = error as {
      message?: string;
      stack?: string;
      code?: string;
      cause?: unknown;
    };

    console.error('❌ [Gas Pool Execute] Exception occurred:');
    console.error('  Error:', err.message);
    console.error('  Stack:', err.stack);

    let errorMessage = err.message || 'Unknown error occurred';
    let errorDetails = String(error);

    if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
      errorMessage =
        'Gas pool service request timed out. The service may be temporarily unavailable. Please try again.';
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
    }

    if (axios.isAxiosError(error)) {
      const underlyingError = error.cause || error;
      if (underlyingError && underlyingError !== error) {
        errorDetails = `${errorDetails}. Underlying error: ${String(underlyingError)}`;
      }
    }

    return NextResponse.json(
      {
        error: 'Gas pool execute request failed',
        details: errorDetails,
        message: errorMessage,
      },
      { status: 500, headers: { ...jsonHeaders } }
    );
  }
}
