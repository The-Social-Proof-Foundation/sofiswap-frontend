import { getCurrentNetworkFromCookies, getFullnodeJsonRpcUrl, isNetworkType } from '@/lib/network-utils';

export const runtime = 'nodejs';
export const maxDuration = 60;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
};

function rpcError(id: unknown, code: number, message: string, status: number) {
  return Response.json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }, { status, headers });
}

/** Pin the request to its originating network, even if the browser changes its cookie mid-flight. */
export async function POST(request: Request) {
  let body: { id?: unknown; method?: unknown; params?: unknown };
  try {
    body = await request.json();
  } catch {
    return rpcError(null, -32700, 'Invalid JSON request.', 400);
  }
  if (!body || typeof body !== 'object' || typeof body.method !== 'string' ||
      (body.params != null && !Array.isArray(body.params))) {
    return rpcError(body?.id, -32600, 'Invalid JSON-RPC request.', 400);
  }
  const selected = new URL(request.url).searchParams.get('network');
  if (selected != null && !isNetworkType(selected)) return rpcError(body.id, -32602, 'Unsupported network.', 400);
  const network = isNetworkType(selected) ? selected : getCurrentNetworkFromCookies(request.headers.get('cookie'));
  const upstream = process.env.NEXT_PUBLIC_MYSO_FULLNODE?.trim() || getFullnodeJsonRpcUrl(network);
  try {
    const response = await fetch(upstream, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), cache: 'no-store',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(45_000)]),
    });
    if (!response.ok) return rpcError(body.id, -32000, `The ${network} fullnode returned HTTP ${response.status}.`, 502);
    const data = await response.json();
    return Response.json(data, { headers });
  } catch (error) {
    const timeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    return rpcError(body.id, -32000, timeout ? 'The fullnode request timed out.' : `Could not reach the ${network} fullnode.`, timeout ? 504 : 502);
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers });
}
