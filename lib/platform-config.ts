/**
 * SofiSwap platform gate: GraphQL platform id and on-chain objects for `join_platform`.
 */

import type { NetworkType } from '@/lib/network-utils';

export interface SofiSwapPlatformConfig {
  platformGraphqlId: string;
  platformPackageId: string;
  platformRegistryObjectId: string;
  blockListRegistryObjectId: string;
}

/**
 * Next.js only inlines `NEXT_PUBLIC_*` for client bundles when each key is read with a
 * **static** `process.env.NEXT_PUBLIC_*` expression. Dynamic `process.env[name]` stays
 * empty in the browser, which made `hasPlatformConfig` always false.
 */
function trimPublic(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Reject empty ids and the all-zero object the chain reports as nonexistent. */
export function isUsableOnchainObjectId(value: string | null | undefined): boolean {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return false;
  const hex = raw.toLowerCase().replace(/^0x/, '');
  if (!hex || !/^[0-9a-f]+$/.test(hex)) return false;
  return !/^0+$/.test(hex);
}

export function pickUsableOnchainObjectId(
  ...candidates: Array<string | null | undefined>
): string | null {
  for (const candidate of candidates) {
    if (isUsableOnchainObjectId(candidate)) return String(candidate).trim();
  }
  return null;
}

function usableEnvId(value: string | undefined): string | undefined {
  const trimmed = trimPublic(value);
  return isUsableOnchainObjectId(trimmed) ? trimmed : undefined;
}

/**
 * Per-network public env overrides. Next.js inlines each static `NEXT_PUBLIC_*` key.
 * Prefer `*_MAINNET` / `*_TESTNET` / `*_LOCALNET`; unprefixed vars apply when the tier is unset.
 */
export function readSofiSwapPlatformEnv(
  network: NetworkType
): Partial<SofiSwapPlatformConfig> {
  const legacyGraphqlId = usableEnvId(process.env.NEXT_PUBLIC_SOFISWAP_PLATFORM_ID);
  const legacyPkg = usableEnvId(process.env.NEXT_PUBLIC_MYSO_PLATFORM_PACKAGE_ID);
  const legacyReg = usableEnvId(process.env.NEXT_PUBLIC_MYSO_PLATFORM_REGISTRY_OBJECT_ID);
  const legacyBlk = usableEnvId(process.env.NEXT_PUBLIC_MYSO_BLOCK_LIST_REGISTRY_OBJECT_ID);

  if (network === 'mainnet') {
    return {
      platformGraphqlId:
        usableEnvId(process.env.NEXT_PUBLIC_SOFISWAP_PLATFORM_ID_MAINNET) || legacyGraphqlId,
      platformPackageId:
        usableEnvId(process.env.NEXT_PUBLIC_MYSO_PLATFORM_PACKAGE_ID_MAINNET) || legacyPkg,
      platformRegistryObjectId:
        usableEnvId(process.env.NEXT_PUBLIC_MYSO_PLATFORM_REGISTRY_OBJECT_ID_MAINNET) ||
        legacyReg,
      blockListRegistryObjectId:
        usableEnvId(process.env.NEXT_PUBLIC_MYSO_BLOCK_LIST_REGISTRY_OBJECT_ID_MAINNET) ||
        legacyBlk,
    };
  }
  if (network === 'testnet') {
    return {
      platformGraphqlId:
        usableEnvId(process.env.NEXT_PUBLIC_SOFISWAP_PLATFORM_ID_TESTNET) || legacyGraphqlId,
      platformPackageId:
        usableEnvId(process.env.NEXT_PUBLIC_MYSO_PLATFORM_PACKAGE_ID_TESTNET) || legacyPkg,
      platformRegistryObjectId:
        usableEnvId(process.env.NEXT_PUBLIC_MYSO_PLATFORM_REGISTRY_OBJECT_ID_TESTNET) ||
        legacyReg,
      blockListRegistryObjectId:
        usableEnvId(process.env.NEXT_PUBLIC_MYSO_BLOCK_LIST_REGISTRY_OBJECT_ID_TESTNET) ||
        legacyBlk,
    };
  }
  return {
    platformGraphqlId:
      usableEnvId(process.env.NEXT_PUBLIC_SOFISWAP_PLATFORM_ID_LOCALNET) || legacyGraphqlId,
    platformPackageId:
      usableEnvId(process.env.NEXT_PUBLIC_MYSO_PLATFORM_PACKAGE_ID_LOCALNET) || legacyPkg,
    platformRegistryObjectId:
      usableEnvId(process.env.NEXT_PUBLIC_MYSO_PLATFORM_REGISTRY_OBJECT_ID_LOCALNET) ||
      legacyReg,
    blockListRegistryObjectId:
      usableEnvId(process.env.NEXT_PUBLIC_MYSO_BLOCK_LIST_REGISTRY_OBJECT_ID_LOCALNET) ||
      legacyBlk,
  };
}

/** Live GraphQL ids win. Env fills only 0x0 / missing holes (stale env must not override a reset localnet). */
export function mergeSofiSwapPlatformConfig(
  discovered: Partial<SofiSwapPlatformConfig> | null | undefined,
  env: Partial<SofiSwapPlatformConfig> | null | undefined
): SofiSwapPlatformConfig | null {
  const platformGraphqlId = pickUsableOnchainObjectId(
    discovered?.platformGraphqlId,
    env?.platformGraphqlId
  );
  const platformPackageId = pickUsableOnchainObjectId(
    discovered?.platformPackageId,
    env?.platformPackageId
  );
  const platformRegistryObjectId = pickUsableOnchainObjectId(
    discovered?.platformRegistryObjectId,
    env?.platformRegistryObjectId
  );
  const blockListRegistryObjectId = pickUsableOnchainObjectId(
    discovered?.blockListRegistryObjectId,
    env?.blockListRegistryObjectId
  );
  if (
    !platformGraphqlId ||
    !platformPackageId ||
    !platformRegistryObjectId ||
    !blockListRegistryObjectId
  ) {
    return null;
  }
  return {
    platformGraphqlId,
    platformPackageId,
    platformRegistryObjectId,
    blockListRegistryObjectId,
  };
}

export function sofiSwapPlatformConfigFromChain(
  network: NetworkType,
  chain: {
    platformId?: string | null;
    packageId: string;
    platformRegistryId: string;
    blockListRegistryId: string;
  }
): SofiSwapPlatformConfig | null {
  return mergeSofiSwapPlatformConfig(
    {
      platformGraphqlId: chain.platformId ?? undefined,
      platformPackageId: chain.packageId,
      platformRegistryObjectId: chain.platformRegistryId,
      blockListRegistryObjectId: chain.blockListRegistryId,
    },
    readSofiSwapPlatformEnv(network)
  );
}

export function missingSofiSwapPlatformConfigMessage(
  network: NetworkType,
  chain: { platformId?: string | null }
): string {
  const env = readSofiSwapPlatformEnv(network);
  if (!pickUsableOnchainObjectId(env.platformGraphqlId, chain.platformId)) {
    const tierKey =
      network === 'mainnet'
        ? 'NEXT_PUBLIC_SOFISWAP_PLATFORM_ID_MAINNET'
        : network === 'testnet'
          ? 'NEXT_PUBLIC_SOFISWAP_PLATFORM_ID_TESTNET'
          : 'NEXT_PUBLIC_SOFISWAP_PLATFORM_ID_LOCALNET';
    return (
      `SofiSwap platform object is missing on ${network}. GraphQL returned 0x0 or no approved SofiSwap platform. ` +
      `Set ${tierKey} or NEXT_PUBLIC_SOFISWAP_PLATFORM_ID to the real Platform object id, then restart the Next.js process.`
    );
  }
  return (
    `SofiSwap join objects are incomplete on ${network}. Set NEXT_PUBLIC_MYSO_PLATFORM_PACKAGE_ID, ` +
    `NEXT_PUBLIC_MYSO_PLATFORM_REGISTRY_OBJECT_ID, and NEXT_PUBLIC_MYSO_BLOCK_LIST_REGISTRY_OBJECT_ID ` +
    `(or the matching _LOCALNET / _TESTNET / _MAINNET vars).`
  );
}

/**
 * Returns full config if every required public env is set to a usable id; otherwise null.
 */
export function getSofiSwapPlatformConfig(
  network: NetworkType
): SofiSwapPlatformConfig | null {
  return mergeSofiSwapPlatformConfig(null, readSofiSwapPlatformEnv(network));
}

export function getJoinPlatformMoveTarget(packageId: string): string {
  return `${packageId}::platform::join_platform`;
}

export function assertJoinPlatformObjectIds(config: SofiSwapPlatformConfig): void {
  if (
    !isUsableOnchainObjectId(config.platformGraphqlId) ||
    !isUsableOnchainObjectId(config.platformPackageId) ||
    !isUsableOnchainObjectId(config.platformRegistryObjectId) ||
    !isUsableOnchainObjectId(config.blockListRegistryObjectId)
  ) {
    throw new Error(
      'join_platform cannot use a zero object id. Set NEXT_PUBLIC_SOFISWAP_PLATFORM_ID to the real Platform object.'
    );
  }
}

/** Public default MySocial profile address for the SPT tab when not signed in and no `?profile=`. */
export function getDefaultSptProfileAddress(): string | null {
  const v = trimPublic(process.env.NEXT_PUBLIC_DEFAULT_SPT_PROFILE_ADDRESS);
  return v || null;
}
