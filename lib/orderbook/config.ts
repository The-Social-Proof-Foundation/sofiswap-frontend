/**
 * Orderbook deployment + network policy (single entry for env resolution and messaging).
 *
 * **Runtime network** (`orderbookRuntimeNetwork`): maps app `NetworkType` → gRPC / SDK reads,
 * including `localnet` against a local fullnode.
 *
 * **Trading network** (`orderbookTradingNetwork`): all supported networks, including localnet.
 *
 * **Deployment** (`getResolvedOrderbookDeployment`): orderbook Move package + registry object
 * from env, localnet manifest, or `@socialproof/orderbook` network defaults.
 */

import {
  localnetPackageIds,
  mainnetPackageIds,
  testnetPackageIds,
} from '@socialproof/orderbook';

import type { NetworkType } from '@/lib/network-utils';
import { isUsableOnchainObjectId } from '@/lib/platform-config';
import {
  registryIdFromLocalnetManifest,
  tryReadLocalnetManifestFromEnv,
} from '@/lib/orderbook/localnet-manifest';

export type OrderbookRuntimeNetwork = 'mainnet' | 'testnet' | 'localnet';

/**
 * @deprecated Prefer {@link getResolvedOrderbookDeployment}. Kept as the short-form id some
 * local genesis notes still mention; live networks use the SDK registry object, not `0x10`.
 */
export const ORDERBOOK_REGISTRY_OBJECT_ID =
  '0x0000000000000000000000000000000000000000000000000000000000000010';

/** Single troubleshooting line for mismatched / missing deployment env (use in thrown errors and hints). */
export const ORDERBOOK_DEPLOYMENT_ENV_HINT =
  'Use NEXT_PUBLIC_ORDERBOOK_PACKAGE_ID and NEXT_PUBLIC_ORDERBOOK_REGISTRY_ID (or *_MAINNET / *_TESTNET / *_LOCALNET) to match the published orderbook. Localnet can also take the Registry object from NEXT_PUBLIC_ORDERBOOK_LOCALNET_MANIFEST_JSON.';

function trimPublic(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isCanonicalMysoHexId(value: string): boolean {
  if (!value.startsWith('0x') && !value.startsWith('0X')) return false;
  const hex = value.slice(2);
  return /^[0-9a-fA-F]{1,64}$/.test(hex);
}

function usableCanonicalId(value: string | undefined): string | undefined {
  const v = trimPublic(value);
  if (!v) return undefined;
  if (!isCanonicalMysoHexId(v) || !isUsableOnchainObjectId(v)) return undefined;
  return v;
}

function sdkPackageIds(network: OrderbookRuntimeNetwork) {
  if (network === 'mainnet') return mainnetPackageIds;
  if (network === 'localnet') return localnetPackageIds;
  return testnetPackageIds;
}

/**
 * Next only inlines `NEXT_PUBLIC_*` on static `process.env.NEXT_PUBLIC_*` reads.
 * `process.env[name]` is empty in the browser, which used to drop the localnet
 * registry and submit `0x0` / a stale SDK object to `get_balance_manager_ids`.
 */
function packageIdForNetwork(network: OrderbookRuntimeNetwork): string | undefined {
  const tier =
    network === 'localnet'
      ? usableCanonicalId(process.env.NEXT_PUBLIC_ORDERBOOK_PACKAGE_ID_LOCALNET)
      : network === 'mainnet'
        ? usableCanonicalId(process.env.NEXT_PUBLIC_ORDERBOOK_PACKAGE_ID_MAINNET)
        : usableCanonicalId(process.env.NEXT_PUBLIC_ORDERBOOK_PACKAGE_ID_TESTNET);
  return tier || usableCanonicalId(process.env.NEXT_PUBLIC_ORDERBOOK_PACKAGE_ID);
}

function registryIdForNetwork(network: OrderbookRuntimeNetwork): string | undefined {
  const tier =
    network === 'localnet'
      ? usableCanonicalId(process.env.NEXT_PUBLIC_ORDERBOOK_REGISTRY_ID_LOCALNET)
      : network === 'mainnet'
        ? usableCanonicalId(process.env.NEXT_PUBLIC_ORDERBOOK_REGISTRY_ID_MAINNET)
        : usableCanonicalId(process.env.NEXT_PUBLIC_ORDERBOOK_REGISTRY_ID_TESTNET);
  return tier || usableCanonicalId(process.env.NEXT_PUBLIC_ORDERBOOK_REGISTRY_ID);
}

export interface ResolvedOrderbookDeployment {
  orderbookPackageId: string;
  registryId: string;
}

export function getResolvedOrderbookDeployment(
  network: OrderbookRuntimeNetwork
): ResolvedOrderbookDeployment {
  const defaults = sdkPackageIds(network);
  const manifest = network === 'localnet' ? tryReadLocalnetManifestFromEnv() : null;
  const pkg =
    packageIdForNetwork(network) ??
    usableCanonicalId(manifest?.packages.orderbook.packageId) ??
    usableCanonicalId(defaults.ORDERBOOK_PACKAGE_ID) ??
    defaults.ORDERBOOK_PACKAGE_ID;
  const registry =
    registryIdForNetwork(network) ??
    usableCanonicalId(manifest ? registryIdFromLocalnetManifest(manifest) : undefined) ??
    (network === 'localnet' ? ORDERBOOK_REGISTRY_OBJECT_ID : undefined) ??
    usableCanonicalId(defaults.REGISTRY_ID) ??
    defaults.REGISTRY_ID;

  return { orderbookPackageId: pkg, registryId: registry };
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

/**
 * `get_balance_manager_ids` looks up the owner in the registry map. Missing child / missing owner
 * aborts `dynamic_field::borrow_child_object` (not `_mut`) with code 1 — that means “no managers”,
 * not a broken deployment.
 */
export function isBalanceManagerLookupMissingAbort(message: string): boolean {
  if (/borrow_child_object_mut/.test(message)) return false;
  return /dynamic_field::borrow_child_object|function_name: Some\("borrow_child_object"\)/.test(
    message
  );
}

/** Dev-inspect / registry errors: same hint as read errors. */
export function augmentOrderbookRegistryInspectError(message: string): string {
  if (!/borrow_child_object|dynamic_field::borrow/i.test(message)) return message;
  return `${message} — ${ORDERBOOK_DEPLOYMENT_ENV_HINT} Check network selection.`;
}
