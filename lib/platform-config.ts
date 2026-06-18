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

/**
 * Returns full config if every required public env is set; otherwise null (gate / join disabled).
 *
 * Prefer `NEXT_PUBLIC_*_MAINNET` / `_TESTNET` / `_LOCALNET`; legacy unprefixed vars apply when
 * a tier-specific override is absent.
 */
export function getSofiSwapPlatformConfig(
  network: NetworkType
): SofiSwapPlatformConfig | null {
  const legacyGraphqlId = trimPublic(process.env.NEXT_PUBLIC_SOFISWAP_PLATFORM_ID);
  const legacyPkg = trimPublic(process.env.NEXT_PUBLIC_MYSO_PLATFORM_PACKAGE_ID);
  const legacyReg = trimPublic(
    process.env.NEXT_PUBLIC_MYSO_PLATFORM_REGISTRY_OBJECT_ID
  );
  const legacyBlk = trimPublic(
    process.env.NEXT_PUBLIC_MYSO_BLOCK_LIST_REGISTRY_OBJECT_ID
  );

  let platformGraphqlId = '';
  let platformPackageId = '';
  let platformRegistryObjectId = '';
  let blockListRegistryObjectId = '';

  if (network === 'mainnet') {
    platformGraphqlId =
      trimPublic(process.env.NEXT_PUBLIC_SOFISWAP_PLATFORM_ID_MAINNET) ||
      legacyGraphqlId;
    platformPackageId =
      trimPublic(process.env.NEXT_PUBLIC_MYSO_PLATFORM_PACKAGE_ID_MAINNET) ||
      legacyPkg;
    platformRegistryObjectId =
      trimPublic(process.env.NEXT_PUBLIC_MYSO_PLATFORM_REGISTRY_OBJECT_ID_MAINNET) ||
      legacyReg;
    blockListRegistryObjectId =
      trimPublic(
        process.env.NEXT_PUBLIC_MYSO_BLOCK_LIST_REGISTRY_OBJECT_ID_MAINNET
      ) || legacyBlk;
  } else if (network === 'testnet') {
    platformGraphqlId =
      trimPublic(process.env.NEXT_PUBLIC_SOFISWAP_PLATFORM_ID_TESTNET) ||
      legacyGraphqlId;
    platformPackageId =
      trimPublic(process.env.NEXT_PUBLIC_MYSO_PLATFORM_PACKAGE_ID_TESTNET) ||
      legacyPkg;
    platformRegistryObjectId =
      trimPublic(process.env.NEXT_PUBLIC_MYSO_PLATFORM_REGISTRY_OBJECT_ID_TESTNET) ||
      legacyReg;
    blockListRegistryObjectId =
      trimPublic(
        process.env.NEXT_PUBLIC_MYSO_BLOCK_LIST_REGISTRY_OBJECT_ID_TESTNET
      ) || legacyBlk;
  } else {
    platformGraphqlId =
      trimPublic(process.env.NEXT_PUBLIC_SOFISWAP_PLATFORM_ID_LOCALNET) ||
      legacyGraphqlId;
    platformPackageId =
      trimPublic(process.env.NEXT_PUBLIC_MYSO_PLATFORM_PACKAGE_ID_LOCALNET) ||
      legacyPkg;
    platformRegistryObjectId =
      trimPublic(process.env.NEXT_PUBLIC_MYSO_PLATFORM_REGISTRY_OBJECT_ID_LOCALNET) ||
      legacyReg;
    blockListRegistryObjectId =
      trimPublic(
        process.env.NEXT_PUBLIC_MYSO_BLOCK_LIST_REGISTRY_OBJECT_ID_LOCALNET
      ) || legacyBlk;
  }

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

export function getJoinPlatformMoveTarget(packageId: string): string {
  return `${packageId}::platform::join_platform`;
}

/** Public default MySocial profile address for the SPT tab when not signed in and no `?profile=`. */
export function getDefaultSptProfileAddress(): string | null {
  const v = trimPublic(process.env.NEXT_PUBLIC_DEFAULT_SPT_PROFILE_ADDRESS);
  return v || null;
}
