/**
 * SofiSwap platform gate: GraphQL platform id and on-chain objects for `join_platform`.
 */

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
 */
export function getSofiSwapPlatformConfig(): SofiSwapPlatformConfig | null {
  const platformGraphqlId = trimPublic(process.env.NEXT_PUBLIC_SOFISWAP_PLATFORM_ID);
  const platformPackageId = trimPublic(process.env.NEXT_PUBLIC_MYSO_PLATFORM_PACKAGE_ID);
  const platformRegistryObjectId = trimPublic(
    process.env.NEXT_PUBLIC_MYSO_PLATFORM_REGISTRY_OBJECT_ID
  );
  const blockListRegistryObjectId = trimPublic(
    process.env.NEXT_PUBLIC_MYSO_BLOCK_LIST_REGISTRY_OBJECT_ID
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
    blockListRegistryObjectId
  };
}

export function getJoinPlatformMoveTarget(packageId: string): string {
  return `${packageId}::platform::join_platform`;
}
