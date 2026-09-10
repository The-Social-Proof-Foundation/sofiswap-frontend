import { getMySoGraphQLClient } from '@/lib/myso-graphql-client';
import type { NetworkType } from '@/lib/network-utils';
import {
  pickUsableOnchainObjectId,
  readSofiSwapPlatformEnv,
} from '@/lib/platform-config';

const CANONICAL_MYSOCIAL_PACKAGE_ID =
  '0x00000000000000000000000000000000000000000000000000000000000050c1';
export const MYSO_CLOCK_OBJECT_ID = '0x6';

export interface SptChainConfig {
  packageId: string;
  tokenRegistryId: string;
  sptConfigId: string;
  ecosystemTreasuryId: string;
  usernameRegistryId: string;
  blockListRegistryId: string;
  platformRegistryId: string;
  platformId: string | null;
}

type ObjectNodes = { nodes?: Array<{ address?: string | null }> | null } | null;
type SptChainConfigQueryData = {
  tokenRegistry?: ObjectNodes;
  sptConfig?: ObjectNodes;
  ecosystemTreasury?: ObjectNodes;
  usernameRegistry?: ObjectNodes;
  blockListRegistry?: ObjectNodes;
  platformRegistry?: ObjectNodes;
  platforms?: Array<{ platformId?: string | null; name?: string | null }> | null;
};

const cache = new Map<NetworkType, { value: SptChainConfig; expiresAt: number }>();
const TTL_MS = 60_000;
const inflight = new Map<NetworkType, Promise<SptChainConfig>>();

function publicPackageId(network: NetworkType): string {
  const universal = process.env.NEXT_PUBLIC_MYSOCIAL_PACKAGE_ID?.trim();
  const tier =
    network === 'mainnet'
      ? process.env.NEXT_PUBLIC_MYSOCIAL_PACKAGE_ID_MAINNET?.trim()
      : network === 'testnet'
        ? process.env.NEXT_PUBLIC_MYSOCIAL_PACKAGE_ID_TESTNET?.trim()
        : process.env.NEXT_PUBLIC_MYSOCIAL_PACKAGE_ID_LOCALNET?.trim();
  return tier || universal || CANONICAL_MYSOCIAL_PACKAGE_ID;
}

function firstAddress(value: ObjectNodes | undefined): string | null {
  return pickUsableOnchainObjectId(value?.nodes?.[0]?.address);
}

function objectField(alias: string, packageId: string, module: string, type: string): string {
  return `${alias}: objects(filter: { type: "${packageId}::${module}::${type}", ownerKind: SHARED }, first: 1) { nodes { address } }`;
}

export function buildSptChainConfigQuery(packageId: string): string {
  return /* GraphQL */ `
    query SofiSwapSptChainConfig {
      ${objectField('tokenRegistry', packageId, 'social_proof_tokens', 'TokenRegistry')}
      ${objectField('sptConfig', packageId, 'social_proof_tokens', 'SocialProofTokensConfig')}
      ${objectField('ecosystemTreasury', packageId, 'profile', 'EcosystemTreasury')}
      ${objectField('usernameRegistry', packageId, 'profile', 'UsernameRegistry')}
      ${objectField('blockListRegistry', packageId, 'block_list', 'BlockListRegistry')}
      ${objectField('platformRegistry', packageId, 'platform', 'PlatformRegistry')}
      platforms(approvedOnly: true, limit: 100, offset: 0) {
        platformId
        name
      }
    }
  `;
}

/** GraphQL names the platform SoFiSwap / SofiSwap / Sofi Swap. */
export function isSofiSwapPlatformName(name: string | null | undefined): boolean {
  const normalized = name?.trim().toLowerCase().replace(/[\s_-]+/g, '') ?? '';
  return normalized === 'sofiswap';
}

function required(value: string | null, label: string): string {
  if (value) return value;
  throw new Error(`GraphQL did not return the ${label} object for this network.`);
}

/** Resolve current SPT singletons from GraphQL so deployments do not depend on copied object IDs. */
export async function resolveSptChainConfig(
  network: NetworkType,
  options?: { force?: boolean }
): Promise<SptChainConfig> {
  const cached = cache.get(network);
  if (!options?.force && cached && cached.expiresAt > Date.now()) return cached.value;
  const pending = inflight.get(network);
  if (pending) return pending;
  const request = loadSptChainConfig(network).finally(() => inflight.delete(network));
  inflight.set(network, request);
  return request;
}

async function loadSptChainConfig(network: NetworkType): Promise<SptChainConfig> {
  const packageId = publicPackageId(network);
  const client = getMySoGraphQLClient(network);
  const response = await client.query<SptChainConfigQueryData>({
    query: buildSptChainConfigQuery(packageId),
    variables: {},
  });

  if (response.errors?.length && !response.data) {
    throw new Error(`Could not refresh SPT chain configuration: ${response.errors.map((e) => e.message).join('; ')}`);
  }

  const data = response.data;
  const env = readSofiSwapPlatformEnv(network);
  const platform = data?.platforms?.find((item) => isSofiSwapPlatformName(item.name));
  const value: SptChainConfig = {
    packageId,
    tokenRegistryId: required(firstAddress(data?.tokenRegistry), 'Social Proof Token registry'),
    sptConfigId: required(firstAddress(data?.sptConfig), 'Social Proof Token configuration'),
    ecosystemTreasuryId: required(firstAddress(data?.ecosystemTreasury), 'ecosystem treasury'),
    usernameRegistryId: required(firstAddress(data?.usernameRegistry), 'username registry'),
    blockListRegistryId: required(
      pickUsableOnchainObjectId(firstAddress(data?.blockListRegistry), env.blockListRegistryObjectId),
      'block list registry'
    ),
    platformRegistryId: required(
      pickUsableOnchainObjectId(firstAddress(data?.platformRegistry), env.platformRegistryObjectId),
      'platform registry'
    ),
    platformId: pickUsableOnchainObjectId(platform?.platformId, env.platformGraphqlId),
  };

  cache.set(network, { value, expiresAt: Date.now() + TTL_MS });
  return value;
}

export function clearSptChainConfigCache(network?: NetworkType): void {
  if (network) cache.delete(network);
  else cache.clear();
}
