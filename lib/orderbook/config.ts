/**
 * Orderbook deployment + network policy (single entry for env resolution and messaging).
 *
 * **Runtime network** (`orderbookRuntimeNetwork`): maps app `NetworkType` → gRPC / SDK reads,
 * including `localnet` against a local fullnode.
 *
 * **Trading network** (`orderbookTradingNetwork`): mainnet/testnet only — BalanceManager PTBs and
 * registry-backed setup are disabled on localnet (`null`).
 *
 * **Deployment** (`getResolvedOrderbookDeployment`): orderbook Move package id + registry object id,
 * resolved once per call from env (universal → per-tier overrides → localnet platform fallback for
 * package only → `@socialproof/orderbook` defaults). Package and registry must be from the same publish.
 */

import { mainnetPackageIds, testnetPackageIds } from '@socialproof/orderbook';

import type { NetworkType } from '@/lib/network-utils';

export type OrderbookRuntimeNetwork = 'mainnet' | 'testnet' | 'localnet';

/** Single troubleshooting line for mismatched / missing deployment env (use in thrown errors and hints). */
export const ORDERBOOK_DEPLOYMENT_ENV_HINT =
  'Use NEXT_PUBLIC_ORDERBOOK_PACKAGE_ID and NEXT_PUBLIC_ORDERBOOK_REGISTRY_ID from the same orderbook publish (not the platform package). Optional per-tier overrides: *_MAINNET / *_TESTNET / NEXT_PUBLIC_ORDERBOOK_REGISTRY_ID_LOCALNET. Localnet (same as sandbox check-order-book): paste sandbox/deployments/localnet.json into NEXT_PUBLIC_ORDERBOOK_LOCALNET_MANIFEST_JSON so coin Move types match genesis; optional pool id patches: NEXT_PUBLIC_ORDERBOOK_LOCALNET_POOLS_JSON.';

function trimPublic(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isCanonicalMysoHexId(value: string): boolean {
  if (!value.startsWith('0x') && !value.startsWith('0X')) return false;
  const hex = value.slice(2);
  return /^[0-9a-fA-F]{64}$/.test(hex);
}

function warnInvalidCanonical(name: string): void {
  console.warn(`[orderbook] Ignoring ${name}: must be a canonical MySo id (0x + 64 hex).`);
}

function packageIdUniversal(): string | undefined {
  const v = trimPublic(process.env.NEXT_PUBLIC_ORDERBOOK_PACKAGE_ID);
  if (!v) return undefined;
  if (isCanonicalMysoHexId(v)) return v;
  warnInvalidCanonical('NEXT_PUBLIC_ORDERBOOK_PACKAGE_ID');
  return undefined;
}

function registryIdUniversal(): string | undefined {
  const v = trimPublic(process.env.NEXT_PUBLIC_ORDERBOOK_REGISTRY_ID);
  if (!v) return undefined;
  if (isCanonicalMysoHexId(v)) return v;
  warnInvalidCanonical('NEXT_PUBLIC_ORDERBOOK_REGISTRY_ID');
  return undefined;
}

function packageIdTier(network: OrderbookRuntimeNetwork): string | undefined {
  if (network === 'mainnet') {
    const v = trimPublic(process.env.NEXT_PUBLIC_ORDERBOOK_PACKAGE_ID_MAINNET);
    if (!v) return undefined;
    if (isCanonicalMysoHexId(v)) return v;
    warnInvalidCanonical('NEXT_PUBLIC_ORDERBOOK_PACKAGE_ID_MAINNET');
    return undefined;
  }
  const v = trimPublic(process.env.NEXT_PUBLIC_ORDERBOOK_PACKAGE_ID_TESTNET);
  if (!v) return undefined;
  if (isCanonicalMysoHexId(v)) return v;
  warnInvalidCanonical('NEXT_PUBLIC_ORDERBOOK_PACKAGE_ID_TESTNET');
  return undefined;
}

function registryIdTier(network: OrderbookRuntimeNetwork): string | undefined {
  if (network === 'mainnet') {
    const v = trimPublic(process.env.NEXT_PUBLIC_ORDERBOOK_REGISTRY_ID_MAINNET);
    if (!v) return undefined;
    if (isCanonicalMysoHexId(v)) return v;
    warnInvalidCanonical('NEXT_PUBLIC_ORDERBOOK_REGISTRY_ID_MAINNET');
    return undefined;
  }
  if (network === 'testnet') {
    const v = trimPublic(process.env.NEXT_PUBLIC_ORDERBOOK_REGISTRY_ID_TESTNET);
    if (!v) return undefined;
    if (isCanonicalMysoHexId(v)) return v;
    warnInvalidCanonical('NEXT_PUBLIC_ORDERBOOK_REGISTRY_ID_TESTNET');
    return undefined;
  }
  const local = trimPublic(process.env.NEXT_PUBLIC_ORDERBOOK_REGISTRY_ID_LOCALNET);
  if (local && isCanonicalMysoHexId(local)) return local;
  if (local) warnInvalidCanonical('NEXT_PUBLIC_ORDERBOOK_REGISTRY_ID_LOCALNET');
  const v = trimPublic(process.env.NEXT_PUBLIC_ORDERBOOK_REGISTRY_ID_TESTNET);
  if (!v) return undefined;
  if (isCanonicalMysoHexId(v)) return v;
  warnInvalidCanonical('NEXT_PUBLIC_ORDERBOOK_REGISTRY_ID_TESTNET');
  return undefined;
}

function packageIdPlatformFallback(): string | undefined {
  const v =
    trimPublic(process.env.NEXT_PUBLIC_MYSO_PLATFORM_PACKAGE_ID_LOCALNET) ||
    trimPublic(process.env.NEXT_PUBLIC_MYSO_PLATFORM_PACKAGE_ID);
  if (!v) return undefined;
  if (isCanonicalMysoHexId(v)) return v;
  console.warn(
    '[orderbook] localnet: platform package id is not canonical — prefer NEXT_PUBLIC_ORDERBOOK_PACKAGE_ID. Using raw value.'
  );
  return v;
}

export interface ResolvedOrderbookDeployment {
  orderbookPackageId: string;
  registryId: string;
}

export function getResolvedOrderbookDeployment(
  network: OrderbookRuntimeNetwork
): ResolvedOrderbookDeployment {
  const defaults = network === 'mainnet' ? mainnetPackageIds : testnetPackageIds;

  const fromUniversalPkg = packageIdUniversal();
  const fromTierPkg = packageIdTier(network);
  const fromPlatformPkg = network === 'localnet' ? packageIdPlatformFallback() : undefined;

  const pkg =
    fromUniversalPkg ?? fromTierPkg ?? fromPlatformPkg ?? defaults.ORDERBOOK_PACKAGE_ID;

  const reg = registryIdUniversal() ?? registryIdTier(network) ?? defaults.REGISTRY_ID;

  if (network === 'localnet' && !fromUniversalPkg && !fromTierPkg && fromPlatformPkg != null) {
    console.warn(
      '[orderbook] localnet: using platform package id for orderbook calls — usually wrong. ' +
        'Set NEXT_PUBLIC_ORDERBOOK_PACKAGE_ID to the orderbook Move package.'
    );
  }

  return { orderbookPackageId: pkg, registryId: reg };
}

export function orderbookRuntimeNetwork(network: NetworkType): OrderbookRuntimeNetwork {
  return network;
}

export function orderbookTradingNetwork(
  network: NetworkType
): Exclude<OrderbookRuntimeNetwork, 'localnet'> | null {
  if (network === 'localnet') return null;
  return network;
}

export function tradingSetupBundledWithJoin(): boolean {
  return process.env.NEXT_PUBLIC_TRADING_SETUP_WITH_JOIN !== 'false';
}

/** Append standard deployment hint when gRPC/SDK errors look like missing pool or package on localnet. */
export function augmentOrderbookReadErrorMessage(
  obNet: OrderbookRuntimeNetwork,
  message: string
): string {
  if (obNet !== 'localnet') return message;
  if (
    !/not\s+found|could\s+not\s+find|does\s+not\s+exist|package|Object\s*0x[0-9a-f]+/i.test(message)
  ) {
    return message;
  }
  return `${message} ${ORDERBOOK_DEPLOYMENT_ENV_HINT}`;
}

/** Dev-inspect / registry errors: same hint as read errors. */
export function augmentOrderbookRegistryInspectError(message: string): string {
  if (!/borrow_child_object|dynamic_field::borrow/i.test(message)) return message;
  return `${message} — ${ORDERBOOK_DEPLOYMENT_ENV_HINT} Check network selection.`;
}
