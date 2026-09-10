/**
 * Optional localnet deployment manifest (same shape as sandbox `deployments/localnet.json`).
 * When set via env, gRPC orderbook reads use manifest-derived coin Move types + pool ids so the
 * app matches `createReadOnlyClient()` in orderbook-sandbox — not SDK `testnetCoins` (wrong genesis).
 */

import type { CoinMap, OrderbookPackageIds, PoolMap } from '@socialproof/orderbook';
import {
  localnetPackageIds,
  testnetCoins,
  testnetPackageIds,
  testnetPools,
} from '@socialproof/orderbook';
import { MYSO_FRAMEWORK_ADDRESS, normalizeMySoAddress } from '@socialproof/myso/utils';

import { localnetPoolsFromTestnetDefaults } from '@/lib/orderbook/localnet-pool-map';

export interface LocalnetDeploymentManifest {
  packages: {
    orderbook: {
      packageId: string;
      objects: Array<{ objectId: string; objectType: string }>;
    };
    token: {
      packageId: string;
      objects?: Array<{ objectId: string; objectType: string }>;
    };
    usdc?: { packageId: string };
  };
  pools: {
    MYUSD_MYSO: { poolId: string; baseCoinType: string; quoteCoinType: string };
    MYSO_USDC?: { poolId: string; baseCoinType: string; quoteCoinType: string };
  };
}

let warnedInvalidManifest = false;

function stripEnvQuotes(raw: string): string {
  let t = raw.trim();
  if ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"'))) {
    t = t.slice(1, -1);
  }
  return t;
}

export function registryIdFromLocalnetManifest(manifest: LocalnetDeploymentManifest): string {
  const row = manifest.packages.orderbook.objects?.find((object) =>
    /::registry::Registry\b/.test(object.objectType)
  );
  if (row?.objectId?.trim()) return normalizeMySoAddress(row.objectId.trim());
  return localnetPackageIds.REGISTRY_ID;
}

export function buildPackageIdsFromManifest(manifest: LocalnetDeploymentManifest): OrderbookPackageIds {
  const orderbookPkg = manifest.packages.orderbook;
  let myusdTreasury = testnetPackageIds.MYUSD_TREASURY_ID;
  const tokenObjs = manifest.packages.token.objects;
  if (Array.isArray(tokenObjs)) {
    const treasury = tokenObjs.find(
      (o) =>
        o.objectType.includes('ProtectedTreasury') ||
        o.objectType.includes('TreasuryCap')
    );
    if (treasury) {
      myusdTreasury = normalizeMySoAddress(treasury.objectId);
    }
  }

  return {
    ...testnetPackageIds,
    ORDERBOOK_PACKAGE_ID: normalizeMySoAddress(orderbookPkg.packageId.trim()),
    REGISTRY_ID: registryIdFromLocalnetManifest(manifest),
    MYUSD_TREASURY_ID: myusdTreasury,
  };
}

export function buildCoinMapFromManifest(manifest: LocalnetDeploymentManifest): CoinMap {
  const tokenPkg = manifest.packages.token.packageId.trim();
  const p = manifest.pools.MYUSD_MYSO;
  const coins: CoinMap = {
    MYUSD: {
      address: normalizeMySoAddress(tokenPkg),
      type: p.quoteCoinType.trim(),
      scalar: 1_000_000,
    },
    MYSO: {
      address: MYSO_FRAMEWORK_ADDRESS,
      type: p.baseCoinType.trim(),
      scalar: 1_000_000_000,
    },
  };
  const usdcPkg = manifest.packages.usdc?.packageId?.trim();
  const usdcPool = manifest.pools.MYSO_USDC;
  if (usdcPkg && usdcPool?.quoteCoinType) {
    coins.USDC = {
      address: normalizeMySoAddress(usdcPkg),
      type: usdcPool.quoteCoinType.trim(),
      scalar: 1_000_000,
    };
  }
  return coins;
}

export function buildPoolMapFromManifest(manifest: LocalnetDeploymentManifest): PoolMap {
  const p = manifest.pools.MYUSD_MYSO;
  const pools: PoolMap = {
    MYUSD_MYSO: {
      address: normalizeMySoAddress(p.poolId.trim()),
      baseCoin: 'MYSO',
      quoteCoin: 'MYUSD',
    },
  };
  const m = manifest.pools.MYSO_USDC;
  if (m?.poolId) {
    pools.MYSO_USDC = {
      address: normalizeMySoAddress(m.poolId.trim()),
      baseCoin: 'MYSO',
      quoteCoin: 'USDC',
    };
  }
  return pools;
}

/** Merge manifest pool rows over testnet-derived localnet map (+ optional LOCALNET_POOLS_JSON). */
export function mergeLocalnetPoolsWithManifest(
  manifest: LocalnetDeploymentManifest
): typeof testnetPools {
  const base = localnetPoolsFromTestnetDefaults<typeof testnetPools>();
  const overlay = buildPoolMapFromManifest(manifest);
  return { ...base, ...overlay } as typeof testnetPools;
}

export function mergeCoinsForLocalnetManifest(manifest: LocalnetDeploymentManifest): CoinMap {
  return {
    ...testnetCoins,
    ...buildCoinMapFromManifest(manifest),
  } as CoinMap;
}

export function tryReadLocalnetManifestFromEnv(): LocalnetDeploymentManifest | null {
  const raw = process.env.NEXT_PUBLIC_ORDERBOOK_LOCALNET_MANIFEST_JSON?.trim();
  if (!raw) return null;

  let jsonText = stripEnvQuotes(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    if (!warnedInvalidManifest) {
      warnedInvalidManifest = true;
      console.warn(
        '[orderbook] Invalid NEXT_PUBLIC_ORDERBOOK_LOCALNET_MANIFEST_JSON — must be JSON (e.g. sandbox/deployments/localnet.json).'
      );
    }
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;

  try {
    const m = parsed as LocalnetDeploymentManifest;
    if (!m.packages?.orderbook?.packageId || !m.packages?.token?.packageId) return null;
    if (!m.pools?.MYUSD_MYSO?.poolId) return null;
    buildPackageIdsFromManifest(m);
    return m;
  } catch (e) {
    if (!warnedInvalidManifest) {
      warnedInvalidManifest = true;
      console.warn('[orderbook] NEXT_PUBLIC_ORDERBOOK_LOCALNET_MANIFEST_JSON parse failed:', e);
    }
    return null;
  }
}
