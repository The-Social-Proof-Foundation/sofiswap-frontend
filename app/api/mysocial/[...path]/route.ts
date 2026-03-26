import type { NextRequest } from 'next/server';

/**
 * Same-origin proxy: browser calls `/api/mysocial/salt`, `/api/mysocial/auth/refresh`, etc.
 * Server forwards to Salt at `NEXT_PUBLIC_MYSOCIAL_AUTH_API_BASE_URL` (default testnet salt host).
 */
const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
  'Access-Control-Max-Age': '86400',
};

export const runtime = 'nodejs';
export const maxDuration = 60;

function saltApiOrigin(): string {
  return (
    process.env.MYSOCIAL_AUTH_API_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_MYSOCIAL_AUTH_API_BASE_URL?.trim() ||
    'https://salt.testnet.mysocial.network'
  ).replace(/\/$/, '');
}

async function forward(
  request: NextRequest,
  pathSegments: string[]
): Promise<Response> {
  if (pathSegments.length === 0) {
    return Response.json(
      { error: 'Missing path' },
      { status: 404, headers: corsHeaders }
    );
  }

  const path = pathSegments.join('/');
  const upstream = new URL(`${saltApiOrigin()}/${path}`);
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
    if (buf.byteLength > 0) {
      body = buf;
    }
  }

  const res = await fetch(upstream, {
    method: request.method,
    headers,
    body,
  });

  const out = new Headers(corsHeaders);
  const rct = res.headers.get('content-type');
  if (rct) out.set('Content-Type', rct);

  const payload = await res.arrayBuffer();
  return new Response(payload, { status: res.status, headers: out });
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

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
