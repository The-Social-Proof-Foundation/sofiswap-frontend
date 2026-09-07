/**
 * Orderbook deployment + network policy (single entry for env resolution and messaging).
 *
 * **Runtime network** (`orderbookRuntimeNetwork`): maps app `NetworkType` → gRPC / SDK reads,
 * including `localnet` against a local fullnode.
 *
 * **Trading network** (`orderbookTradingNetwork`): all supported networks, including localnet.
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
  return /^[0-9a-fA-F]{1,64}$/.test(hex);
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
  if (network === 'localnet') {
    const v = trimPublic(process.env.NEXT_PUBLIC_ORDERBOOK_PACKAGE_ID_LOCALNET);
    if (!v) return undefined;
    if (isCanonicalMysoHexId(v)) return v;
    warnInvalidCanonical('NEXT_PUBLIC_ORDERBOOK_PACKAGE_ID_LOCALNET');
    return undefined;
  }
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
  const pkg = fromTierPkg ?? fromUniversalPkg ??
    (network === 'localnet' ? '0x0b0c' : defaults.ORDERBOOK_PACKAGE_ID);

  return { orderbookPackageId: pkg, registryId: ORDERBOOK_REGISTRY_OBJECT_ID };
}

export function orderbookRuntimeNetwork(network: NetworkType): OrderbookRuntimeNetwork {
  return network;
}

export function orderbookTradingNetwork(
  network: NetworkType
): OrderbookRuntimeNetwork {
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
