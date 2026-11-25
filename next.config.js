/** @type {import('next').NextConfig} */

/**
 * Hosts the browser is expected to talk to for data, derived from configuration rather than
 * hardcoded, because endpoints differ per deployment. Used only for the report-only CSP's
 * `connect-src` until a deployment-specific allowlist is confirmed.
 */
function configuredConnectSources() {
  const keys = [
    'NEXT_PUBLIC_MYSO_GRAPHQL_MAINNET_URL',
    'NEXT_PUBLIC_MYSO_GRAPHQL_TESTNET_URL',
    'NEXT_PUBLIC_MYSO_GRAPHQL_LOCALNET_URL',
    'NEXT_PUBLIC_MYSO_JSON_RPC_MAINNET_URL',
    'NEXT_PUBLIC_MYSO_JSON_RPC_TESTNET_URL',
    'NEXT_PUBLIC_MYSO_JSON_RPC_LOCALNET_URL',
    'NEXT_PUBLIC_MYSO_GRPC_MAINNET_URL',
    'NEXT_PUBLIC_MYSO_GRPC_TESTNET_URL',
    'NEXT_PUBLIC_MYSO_GRPC_LOCALNET_URL',
    'NEXT_PUBLIC_ORDERBOOK_INDEXER_MAINNET_URL',
    'NEXT_PUBLIC_ORDERBOOK_INDEXER_TESTNET_URL',
    'NEXT_PUBLIC_ORDERBOOK_INDEXER_LOCALNET_URL',
    'NEXT_PUBLIC_ORDERBOOK_STATUS_URL_MAINNET',
    'NEXT_PUBLIC_ORDERBOOK_STATUS_URL_TESTNET',
    'NEXT_PUBLIC_ORDERBOOK_STATUS_URL_LOCALNET',
    'NEXT_PUBLIC_SOCIAL_INDEXER_MAINNET_URL',
    'NEXT_PUBLIC_SOCIAL_INDEXER_TESTNET_URL',
    'NEXT_PUBLIC_SOCIAL_INDEXER_LOCALNET_URL',
    'NEXT_PUBLIC_MYSOCIAL_AUTH_ORIGIN',
    'NEXT_PUBLIC_MYSOCIAL_AUTH_API_BASE_URL',
    'NEXT_PUBLIC_MYSOCIAL_AUTH_API_MAINNET_URL',
    'NEXT_PUBLIC_MYSOCIAL_AUTH_API_TESTNET_URL',
    'NEXT_PUBLIC_MYSOCIAL_AUTH_API_LOCALNET_URL',
    'NEXT_PUBLIC_MYSO_FULLNODE',
    'NEXT_PUBLIC_MYSO_FULLNODE_URL',
  ];
  const sources = new Set();
  for (const key of keys) {
    const raw = process.env[key]?.trim();
    if (!raw) continue;
    try {
      const url = new URL(raw);
      sources.add(url.origin);
      // gRPC-web endpoints are called over http(s); ws(s) covers any streaming transport.
      sources.add(`${url.protocol === 'https:' ? 'wss:' : 'ws:'}//${url.host}`);
    } catch {
      /* ignore malformed values */
    }
  }
  return Array.from(sources);
}

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Full policy, reported (not yet enforced). `script-src` still needs `'unsafe-inline'`
 * because Next injects its bootstrap inline scripts; tightening it requires a per-request
 * nonce from middleware and must be validated against a real deploy before enforcement.
 */
const reportOnlyCsp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://www.googletagmanager.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  `connect-src 'self' https://www.google-analytics.com https://ipapi.co ${configuredConnectSources().join(' ')}`.trim(),
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  'upgrade-insecure-requests',
].join('; ');

/**
 * Enforced subset. These directives cannot break rendering or data loading, so they are
 * safe to enable immediately: they stop framing (clickjacking on trade/signing surfaces),
 * plugin/object embedding, base-tag rewriting and cross-origin form posts.
 */
const enforcedCsp = [
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack: (config, { dev }) => {
    // Dev chunks for /trade include source maps and the wallet stack. A rebuild
    // can outlast webpack's 120s loader timeout and surface as ChunkLoadError.
    if (dev) config.output.chunkLoadTimeout = 300_000;
    return config;
  },
  images: { unoptimized: true },
  serverExternalPackages: ['resend'],
  experimental: {
    // Avoid incomplete app-path manifests observed when the webpack build worker
    // runs under the local Node toolchain; a single-process build is deterministic.
    webpackBuildWorker: false,
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin-allow-popups',
          },
          { key: 'Content-Security-Policy', value: enforcedCsp },
          { key: 'Content-Security-Policy-Report-Only', value: reportOnlyCsp },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=()',
          },
        ],
      },
      {
        // The OAuth callback URL carries `code`/`state`; never leak it via Referer.
        source: '/auth/callback',
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      },
    ];
  },
}

module.exports = nextConfig
