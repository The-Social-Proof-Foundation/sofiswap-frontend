/**
 * Pools + coin metadata passed into `@socialproof/orderbook` for gRPC clients.
 * Localnet: optional `NEXT_PUBLIC_ORDERBOOK_LOCALNET_MANIFEST_JSON` (sandbox `localnet.json`) so
 * coin Move types match genesis; otherwise pools use testnet map + LOCALNET_POOLS_JSON and coins
 * fall back to SDK testnet (often wrong for local genesis).
 */

import type { OrderbookPackageIds } from '@socialproof/orderbook';
import { getDiscoveredOrderbookMarkets } from '@/lib/orderbook/discovered-markets';
import {
  localnetPackageIds,
  mainnetCoins,
  mainnetPackageIds,
  mainnetPools,
  testnetCoins,
  testnetPackageIds,
  testnetPools,
} from '@socialproof/orderbook';

import {
  getResolvedOrderbookDeployment,
  type OrderbookRuntimeNetwork,
} from '@/lib/orderbook/config';
import { localnetPoolsFromTestnetDefaults } from '@/lib/orderbook/localnet-pool-map';
import {
  buildPackageIdsFromManifest,
  mergeCoinsForLocalnetManifest,
  mergeLocalnetPoolsWithManifest,
  tryReadLocalnetManifestFromEnv,
} from '@/lib/orderbook/localnet-manifest';

let warnedLocalnetCoinsWithoutManifest = false;

function packageIdsForPlugin(
  obNet: OrderbookRuntimeNetwork,
  orderbookPackageId: string
): OrderbookPackageIds {
  const base =
    obNet === 'mainnet'
      ? mainnetPackageIds
      : obNet === 'localnet'
        ? localnetPackageIds
        : testnetPackageIds;
  const { registryId } = getResolvedOrderbookDeployment(obNet);
  return {
    ...base,
    ORDERBOOK_PACKAGE_ID: orderbookPackageId,
    REGISTRY_ID: registryId,
  };
}

export function orderbookPoolsForSdkNetwork(
  obNet: OrderbookRuntimeNetwork
): typeof mainnetPools | typeof testnetPools {
  const discovered = getDiscoveredOrderbookMarkets(obNet);
  if (discovered) return discovered.pools;
  if (obNet === 'mainnet') return mainnetPools;
  if (obNet === 'localnet') {
    const m = tryReadLocalnetManifestFromEnv();
    if (m) return mergeLocalnetPoolsWithManifest(m);
    return localnetPoolsFromTestnetDefaults<typeof testnetPools>();
  }
  return testnetPools;
}

export function orderbookCoinsForSdkNetwork(
  obNet: OrderbookRuntimeNetwork
): typeof mainnetCoins | typeof testnetCoins {
  const discovered = getDiscoveredOrderbookMarkets(obNet);
  if (discovered) return discovered.coins;
  if (obNet === 'mainnet') return mainnetCoins;
  if (obNet === 'localnet') {
    const m = tryReadLocalnetManifestFromEnv();
    if (m) return mergeCoinsForLocalnetManifest(m);
    if (process.env.NODE_ENV === 'development' && !warnedLocalnetCoinsWithoutManifest) {
      warnedLocalnetCoinsWithoutManifest = true;
      console.warn(
        '[orderbook] localnet: NEXT_PUBLIC_ORDERBOOK_LOCALNET_MANIFEST_JSON is unset — using SDK testnet coin types. ' +
          'If gRPC fails with “Dependent package not found”, paste sandbox/deployments/localnet.json into that env var.'
      );
    }
    return testnetCoins;
  }
  return testnetCoins;
}

/**
 * Arguments for `orderbook({ ... })` registration (depth + user clients).
 * Local manifest, when present, overrides package ids + coins for the plugin the same way sandbox `setup.ts` does.
 */
export function orderbookPluginOptionsForNetwork(obNet: OrderbookRuntimeNetwork): {
  address: string;
  coins: ReturnType<typeof orderbookCoinsForSdkNetwork>;
  pools: ReturnType<typeof orderbookPoolsForSdkNetwork>;
  deployment: { packageIds: OrderbookPackageIds } | undefined;
} {
  const m = obNet === 'localnet' ? tryReadLocalnetManifestFromEnv() : null;
  if (m) {
    const packageIds = buildPackageIdsFromManifest(m);
    return {
      address: packageIds.ORDERBOOK_PACKAGE_ID,
      coins: orderbookCoinsForSdkNetwork(obNet),
      pools: orderbookPoolsForSdkNetwork(obNet),
      deployment: { packageIds },
    };
  }
  const { orderbookPackageId } = getResolvedOrderbookDeployment(obNet);
  const packageIds = packageIdsForPlugin(obNet, orderbookPackageId);
  return {
    address: orderbookPackageId,
    coins: orderbookCoinsForSdkNetwork(obNet),
    pools: orderbookPoolsForSdkNetwork(obNet),
    deployment: { packageIds },
  };
}
