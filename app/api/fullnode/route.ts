import {
  RPC_LIMIT,
  RPC_MAX_BODY_BYTES,
  clientKey,
  corsHeaders,
  enforceBodyLimit,
  enforceRateLimit,
  isAllowedOrigin,
  preflightResponse,
} from '@/lib/api-guard';
import { getCurrentNetworkFromCookies, getFullnodeJsonRpcUrl, isNetworkType } from '@/lib/network-utils';

export const runtime = 'nodejs';
export const maxDuration = 60;

function rpcError(
  request: Request,
  id: unknown,
  code: number,
  message: string,
  status: number
) {
  return Response.json(
    { jsonrpc: '2.0', id: id ?? null, error: { code, message } },
    { status, headers: { ...corsHeaders(request), 'Cache-Control': 'no-store' } }
  );
}

/**
 * Same-origin JSON-RPC relay to the network-pinned fullnode.
 *
 * The upstream is chosen server-side from `?network=` (validated) or the `selectedNetwork`
 * cookie, so it is not an SSRF surface. It is rate limited and size capped so it cannot
 * double as an anonymous bulk RPC endpoint.
 */
export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (!isAllowedOrigin(origin)) {
    return rpcError(request, null, -32000, 'This origin is not allowed to use the RPC relay.', 403);
  }

  if (!enforceBodyLimit(request, RPC_MAX_BODY_BYTES)) {
    return rpcError(request, null, -32600, 'Request body is too large.', 413);
  }

  const limit = enforceRateLimit(`rpc:${clientKey(request)}`, RPC_LIMIT, 60_000);
  if (!limit.ok) {
    return rpcError(request, null, -32000, 'Too many RPC requests. Please slow down.', 429);
  }

  let body: { id?: unknown; method?: unknown; params?: unknown };
  try {
    body = await request.json();
  } catch {
    return rpcError(request, null, -32700, 'Invalid JSON request.', 400);
  }
  if (!body || typeof body !== 'object' || typeof body.method !== 'string' ||
      (body.params != null && !Array.isArray(body.params))) {
    return rpcError(request, body?.id, -32600, 'Invalid JSON-RPC request.', 400);
  }

  const selected = new URL(request.url).searchParams.get('network');
  if (selected != null && !isNetworkType(selected)) {
    return rpcError(request, body.id, -32602, 'Unsupported network.', 400);
  }
  const network = isNetworkType(selected)
    ? selected
    : getCurrentNetworkFromCookies(request.headers.get('cookie'));
  const upstream = process.env.NEXT_PUBLIC_MYSO_FULLNODE?.trim() || getFullnodeJsonRpcUrl(network);
  const responseHeaders = { ...corsHeaders(request), 'Cache-Control': 'no-store' };

  try {
    const response = await fetch(upstream, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(45_000)]),
    });
    if (!response.ok) {
      return rpcError(
        request,
        body.id,
        -32000,
        `The ${network} fullnode returned HTTP ${response.status}.`,
        502
      );
    }
    const data = await response.json();
    return Response.json(data, { headers: responseHeaders });
  } catch (error) {
    const timeout =
      error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    return rpcError(
      request,
      body.id,
      -32000,
      timeout ? 'The fullnode request timed out.' : `Could not reach the ${network} fullnode.`,
      timeout ? 504 : 502
    );
  }
}

export async function OPTIONS(request: Request) {
  return preflightResponse(request);
}
