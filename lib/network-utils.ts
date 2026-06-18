/**
 * Universal MySocial / MySo network configuration.
 * Single source for localnet, testnet, and mainnet (GraphQL, JSON-RPC, labels).
 */

import Cookies from 'js-cookie';

export type NetworkType = 'mainnet' | 'testnet' | 'localnet';

export const NETWORK_COOKIE_NAME = 'selectedNetwork';

export const VALID_NETWORKS: readonly NetworkType[] = [
  'mainnet',
  'testnet',
  'localnet',
] as const;

export function isNetworkType(value: string | undefined | null): value is NetworkType {
  return (
    value === 'mainnet' || value === 'testnet' || value === 'localnet'
  );
}

/** Human-readable labels for UI (toasts, selectors). */
export const NETWORK_LABELS: Record<NetworkType, string> = {
  mainnet: 'Mainnet',
  testnet: 'Testnet',
  localnet: 'Localnet',
};

export interface NetworkEndpoints {
  graphqlHttpUrl: string;
  /** Direct JSON-RPC base URL (fullnode). Used by server proxy and tooling. */
  fullnodeJsonRpcUrl: string;
}

const DEFAULT_MAINNET_GRAPHQL =
  'https://graphql.mainnet.mysocial.network/graphql';
const DEFAULT_TESTNET_GRAPHQL =
  'https://graphql.testnet.mysocial.network/graphql';
const DEFAULT_LOCALNET_GRAPHQL = 'http://127.0.0.1:9125/graphql';

const DEFAULT_MAINNET_RPC = 'http://fullnode.mainnet.mysocial.network:9000';
const DEFAULT_TESTNET_RPC = 'http://fullnode.testnet.mysocial.network:9000';
const DEFAULT_LOCALNET_RPC = 'http://127.0.0.1:9000';

/**
 * Built-in defaults; overridden by `getNetworkEndpoints()` using env vars.
 */
const BASE_REGISTRY: Record<NetworkType, NetworkEndpoints> = {
  mainnet: {
    graphqlHttpUrl: DEFAULT_MAINNET_GRAPHQL,
    fullnodeJsonRpcUrl: DEFAULT_MAINNET_RPC,
  },
  testnet: {
    graphqlHttpUrl: DEFAULT_TESTNET_GRAPHQL,
    fullnodeJsonRpcUrl: DEFAULT_TESTNET_RPC,
  },
  localnet: {
    graphqlHttpUrl: DEFAULT_LOCALNET_GRAPHQL,
    fullnodeJsonRpcUrl: DEFAULT_LOCALNET_RPC,
  },
};

/**
 * Default when no cookie / SSR. Set `NEXT_PUBLIC_DEFAULT_NETWORK=localnet|testnet|mainnet`.
 */
export function getDefaultNetwork(): NetworkType {
  const v = process.env.NEXT_PUBLIC_DEFAULT_NETWORK?.trim().toLowerCase();
  if (isNetworkType(v)) return v;
  return 'testnet';
}

/**
 * Resolved URLs for a network (env overrides per tier).
 */
export function getNetworkEndpoints(network: NetworkType): NetworkEndpoints {
  const base = BASE_REGISTRY[network];

  const graphqlOverride =
    network === 'mainnet'
      ? process.env.NEXT_PUBLIC_MYSO_GRAPHQL_MAINNET_URL
      : network === 'testnet'
        ? process.env.NEXT_PUBLIC_MYSO_GRAPHQL_TESTNET_URL
        : process.env.NEXT_PUBLIC_MYSO_GRAPHQL_LOCALNET_URL;

  const rpcOverride =
    network === 'mainnet'
      ? process.env.NEXT_PUBLIC_MYSO_JSON_RPC_MAINNET_URL
      : network === 'testnet'
        ? process.env.NEXT_PUBLIC_MYSO_JSON_RPC_TESTNET_URL
        : process.env.NEXT_PUBLIC_MYSO_JSON_RPC_LOCALNET_URL;

  return {
    graphqlHttpUrl: (graphqlOverride?.trim() || base.graphqlHttpUrl).replace(
      /\/$/,
      ''
    ),
    fullnodeJsonRpcUrl: (rpcOverride?.trim() || base.fullnodeJsonRpcUrl).replace(
      /\/$/,
      ''
    ),
  };
}

export function getGraphqlHttpUrl(network: NetworkType): string {
  return getNetworkEndpoints(network).graphqlHttpUrl;
}

export function getFullnodeJsonRpcUrl(network: NetworkType): string {
  return getNetworkEndpoints(network).fullnodeJsonRpcUrl;
}

/** gRPC-web base URL for `MySoGrpcClient` from `@socialproof/myso/grpc` (HTTPS :443 on hosted networks). */
const DEFAULT_MAINNET_GRPC = 'http://fullnode.mainnet.mysocial.network:9000';
const DEFAULT_TESTNET_GRPC = 'http://fullnode.testnet.mysocial.network:9000';
const DEFAULT_LOCALNET_GRPC = 'http://127.0.0.1:9000';

/**
 * Resolves MySo gRPC-web endpoint for simulations / orderbook reads.
 * Override per tier with `NEXT_PUBLIC_MYSO_GRPC_*_URL` when needed.
 */
export function getMySoGrpcBaseUrl(network: NetworkType): string {
  const trimmed = (v: string | undefined) =>
    typeof v === 'string' ? v.trim().replace(/\/$/, '') : '';

  const override =
    network === 'mainnet'
      ? trimmed(process.env.NEXT_PUBLIC_MYSO_GRPC_MAINNET_URL)
      : network === 'testnet'
        ? trimmed(process.env.NEXT_PUBLIC_MYSO_GRPC_TESTNET_URL)
        : trimmed(process.env.NEXT_PUBLIC_MYSO_GRPC_LOCALNET_URL);

  if (override) return override;

  if (network === 'mainnet') return DEFAULT_MAINNET_GRPC;
  if (network === 'testnet') return DEFAULT_TESTNET_GRPC;
  return DEFAULT_LOCALNET_GRPC;
}

/**
 * Selected network in the browser from the `selectedNetwork` cookie.
 */
export function getClientSelectedNetwork(): NetworkType {
  if (typeof window === 'undefined') {
    return getDefaultNetwork();
  }
  try {
    const saved = Cookies.get(NETWORK_COOKIE_NAME);
    if (isNetworkType(saved)) return saved;
  } catch {
    /* ignore */
  }
  return getDefaultNetwork();
}

/**
 * Current network: cookie on client, default on server (no Request).
 */
export function getCurrentNetwork(): NetworkType {
  if (typeof window !== 'undefined') {
    return getClientSelectedNetwork();
  }
  return getDefaultNetwork();
}

/**
 * Parse `Cookie` header (API routes, middleware).
 */
export function getCurrentNetworkFromCookies(
  cookieHeader: string | null | undefined
): NetworkType {
  if (!cookieHeader) {
    return getDefaultNetwork();
  }

  const cookies: Record<string, string> = {};
  cookieHeader.split(';').forEach((cookie) => {
    const [name, value] = cookie.trim().split('=');
    if (name && value) {
      cookies[name] = decodeURIComponent(value);
    }
  });

  const saved = cookies[NETWORK_COOKIE_NAME];
  if (isNetworkType(saved)) return saved;
  return getDefaultNetwork();
}

export function isSponsoredGasAllowed(network?: NetworkType): boolean {
  const current = network ?? getCurrentNetwork();
  return current !== 'localnet';
}

export function isSponsoredGasAllowedFromCookies(
  cookieHeader: string | null | undefined
): boolean {
  return getCurrentNetworkFromCookies(cookieHeader) !== 'localnet';
}

/** Dispatched on `window` after the profile Environment picker changes tier. */
export const SOFISWAP_SELECTED_NETWORK_CHANGE_EVENT =
  'sofiswap-selected-network-change';

const DEFAULT_MAINNET_AUTH_ORIGIN = 'https://auth.mainnet.mysocial.network';
const DEFAULT_MAINNET_SALT_ORIGIN = 'https://salt.mainnet.mysocial.network';
const DEFAULT_TESTNET_AUTH_ORIGIN = 'https://auth.testnet.mysocial.network';
const DEFAULT_TESTNET_SALT_ORIGIN = 'https://salt.testnet.mysocial.network';

function trimTrailingSlash(url: string | undefined): string {
  return typeof url === 'string' ? url.trim().replace(/\/$/, '') : '';
}

function trimEnv(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Login-with-MySocial authorize host. When `NEXT_PUBLIC_MYSOCIAL_AUTH_ORIGIN` is set, it pins
 * all tiers (legacy single-network deploys).
 */
export function getMySocialAuthOrigin(network: NetworkType): string {
  const globalOrigin = trimTrailingSlash(process.env.NEXT_PUBLIC_MYSOCIAL_AUTH_ORIGIN);
  if (globalOrigin) return globalOrigin;

  if (network === 'mainnet') {
    return (
      trimTrailingSlash(process.env.NEXT_PUBLIC_MYSOCIAL_AUTH_ORIGIN_MAINNET) ||
      DEFAULT_MAINNET_AUTH_ORIGIN
    );
  }
  if (network === 'testnet') {
    return (
      trimTrailingSlash(process.env.NEXT_PUBLIC_MYSOCIAL_AUTH_ORIGIN_TESTNET) ||
      DEFAULT_TESTNET_AUTH_ORIGIN
    );
  }
  return (
    trimTrailingSlash(process.env.NEXT_PUBLIC_MYSOCIAL_AUTH_ORIGIN_LOCALNET) ||
    DEFAULT_TESTNET_AUTH_ORIGIN
  );
}

/**
 * Salt REST API origin for `/api/mysocial/*` forwarding. Same global pin rules:
 * `MYSOCIAL_AUTH_API_BASE_URL` or `NEXT_PUBLIC_MYSOCIAL_AUTH_API_BASE_URL` overrides all tiers.
 * Localnet defaults to testnet Salt unless `NEXT_PUBLIC_MYSOCIAL_AUTH_API_LOCALNET_URL` etc. set.
 */
export function getMySocialSaltApiBaseUrl(network: NetworkType): string {
  const globalSalt =
    trimTrailingSlash(process.env.MYSOCIAL_AUTH_API_BASE_URL) ||
    trimTrailingSlash(process.env.NEXT_PUBLIC_MYSOCIAL_AUTH_API_BASE_URL);
  if (globalSalt) return globalSalt;

  if (network === 'mainnet') {
    return (
      trimTrailingSlash(process.env.NEXT_PUBLIC_MYSOCIAL_AUTH_API_MAINNET_URL) ||
      DEFAULT_MAINNET_SALT_ORIGIN
    );
  }
  if (network === 'testnet') {
    return (
      trimTrailingSlash(process.env.NEXT_PUBLIC_MYSOCIAL_AUTH_API_TESTNET_URL) ||
      DEFAULT_TESTNET_SALT_ORIGIN
    );
  }
  return (
    trimTrailingSlash(process.env.NEXT_PUBLIC_MYSOCIAL_AUTH_API_LOCALNET_URL) ||
    DEFAULT_TESTNET_SALT_ORIGIN
  );
}

/** Gas pool REST base URL (no path). Mainnet/testnet only; returns null on localnet. */
export function getGasPoolBaseUrlForNetwork(network: NetworkType): string | null {
  const legacy = trimEnv(process.env.NEXT_PUBLIC_GAS_POOL_URL);
  if (network === 'mainnet') {
    const v = trimEnv(process.env.NEXT_PUBLIC_GAS_POOL_URL_MAINNET);
    return v || legacy || null;
  }
  if (network === 'testnet') {
    const v = trimEnv(process.env.NEXT_PUBLIC_GAS_POOL_URL_TESTNET);
    return v || legacy || null;
  }
  return null;
}

export function getGasPoolBearerTokenForNetwork(network: NetworkType): string | null {
  const legacy = trimEnv(process.env.GAS_POOL_TOKEN);
  if (network === 'mainnet') {
    const t = trimEnv(process.env.GAS_POOL_TOKEN_MAINNET);
    return t || legacy || null;
  }
  if (network === 'testnet') {
    const t = trimEnv(process.env.GAS_POOL_TOKEN_TESTNET);
    return t || legacy || null;
  }
  return null;
}

export function buildGasPoolReserveHttpUrl(normalizedGasPoolBase: string): string {
  const gasPoolUrl = normalizedGasPoolBase.trim();
  const hasV1 = gasPoolUrl.includes('/v1/') || gasPoolUrl.endsWith('/v1');
  const apiPath = hasV1 ? '/reserve_gas' : '/v1/reserve_gas';
  return `${gasPoolUrl}${apiPath}`;
}

export function buildGasPoolExecuteHttpUrl(normalizedGasPoolBase: string): string {
  const gasPoolUrl = normalizedGasPoolBase.trim();
  const hasV1 = gasPoolUrl.includes('/v1/') || gasPoolUrl.endsWith('/v1');
  const apiPath = hasV1 ? '/execute_tx' : '/v1/execute_tx';
  return `${gasPoolUrl}${apiPath}`;
}

export function normalizeGasPoolBaseUrl(url: string): string {
  let gasPoolUrl = url.trim();
  if (!gasPoolUrl.startsWith('http://') && !gasPoolUrl.startsWith('https://')) {
    gasPoolUrl = `https://${gasPoolUrl}`;
  }
  return gasPoolUrl.replace(/\/$/, '');
}
