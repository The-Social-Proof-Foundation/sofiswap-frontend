/**
 * Orderbook deployment + network policy (single entry for env resolution and messaging).
 *
 * **Runtime network** (`orderbookRuntimeNetwork`): maps app `NetworkType` → gRPC / SDK reads,
 * including `localnet` against a local fullnode.
 *
 * **Trading network** (`orderbookTradingNetwork`): mainnet/testnet only — BalanceManager PTBs and
 * registry-backed setup are disabled on localnet (`null`).
 *
 * **Deployment** (`getResolvedOrderbookDeployment`): orderbook Move package id from env / SDK defaults;
 * registry object id is fixed on-chain ({@link ORDERBOOK_REGISTRY_OBJECT_ID}) for all networks.
 */

import { mainnetPackageIds, testnetPackageIds } from '@socialproof/orderbook';

import type { NetworkType } from '@/lib/network-utils';

export type OrderbookRuntimeNetwork = 'mainnet' | 'testnet' | 'localnet';

/**
 * On-chain orderbook BalanceManager registry — same fixed object id on every network (genesis / deploy).
 * Short form: `0x10`.
 */
export const ORDERBOOK_REGISTRY_OBJECT_ID =
  '0x0000000000000000000000000000000000000000000000000000000000000010';

/** Single troubleshooting line for mismatched / missing deployment env (use in thrown errors and hints). */
export const ORDERBOOK_DEPLOYMENT_ENV_HINT =
  'Use NEXT_PUBLIC_ORDERBOOK_PACKAGE_ID (or *_MAINNET / *_TESTNET) for the orderbook Move package. Registry is fixed at ORDERBOOK_REGISTRY_OBJECT_ID (0x10). Localnet: NEXT_PUBLIC_ORDERBOOK_LOCALNET_MANIFEST_JSON for coin Move types; optional pool patches: NEXT_PUBLIC_ORDERBOOK_LOCALNET_POOLS_JSON.';

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

  if (network === 'localnet' && !fromUniversalPkg && !fromTierPkg && fromPlatformPkg != null) {
    console.warn(
      '[orderbook] localnet: using platform package id for orderbook calls — usually wrong. ' +
        'Set NEXT_PUBLIC_ORDERBOOK_PACKAGE_ID to the orderbook Move package.'
    );
  }

  return { orderbookPackageId: pkg, registryId: ORDERBOOK_REGISTRY_OBJECT_ID };
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
