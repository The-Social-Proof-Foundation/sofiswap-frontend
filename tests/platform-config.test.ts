import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  getSofiSwapPlatformConfig,
  isUsableOnchainObjectId,
  mergeSofiSwapPlatformConfig,
  missingSofiSwapPlatformConfigMessage,
  pickUsableOnchainObjectId,
  sofiSwapPlatformConfigFromChain,
} from '../lib/platform-config';

const ZERO = '0x0000000000000000000000000000000000000000000000000000000000000000';
const id = (n: number) => `0x${n.toString(16).padStart(64, '0')}`;

const envKeys = [
  'NEXT_PUBLIC_SOFISWAP_PLATFORM_ID',
  'NEXT_PUBLIC_SOFISWAP_PLATFORM_ID_LOCALNET',
  'NEXT_PUBLIC_MYSO_PLATFORM_PACKAGE_ID',
  'NEXT_PUBLIC_MYSO_PLATFORM_REGISTRY_OBJECT_ID',
  'NEXT_PUBLIC_MYSO_BLOCK_LIST_REGISTRY_OBJECT_ID',
] as const;

const saved = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of envKeys) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

test('zero and empty hex are not usable on-chain object ids', () => {
  assert.equal(isUsableOnchainObjectId(ZERO), false);
  assert.equal(isUsableOnchainObjectId('0x0'), false);
  assert.equal(isUsableOnchainObjectId(''), false);
  assert.equal(isUsableOnchainObjectId(id(8)), true);
  assert.equal(pickUsableOnchainObjectId(ZERO, '0x0', id(8)), id(8));
});

test('env SofiSwap platform id fills a discovered zero object', () => {
  const merged = mergeSofiSwapPlatformConfig(
    {
      platformGraphqlId: ZERO,
      platformPackageId: id(1),
      platformRegistryObjectId: id(2),
      blockListRegistryObjectId: id(3),
    },
    { platformGraphqlId: id(99) }
  );
  assert.equal(merged?.platformGraphqlId, id(99));
  assert.equal(merged?.platformPackageId, id(1));
});

test('live GraphQL objects win over stale env ids', () => {
  const merged = mergeSofiSwapPlatformConfig(
    {
      platformGraphqlId: id(8),
      platformPackageId: id(1),
      platformRegistryObjectId: id(2),
      blockListRegistryObjectId: id(3),
    },
    {
      platformGraphqlId: id(99),
      platformRegistryObjectId: id(98),
      blockListRegistryObjectId: id(97),
    }
  );
  assert.equal(merged?.platformGraphqlId, id(8));
  assert.equal(merged?.platformRegistryObjectId, id(2));
  assert.equal(merged?.blockListRegistryObjectId, id(3));
});

test('getSofiSwapPlatformConfig ignores a zero NEXT_PUBLIC_SOFISWAP_PLATFORM_ID', () => {
  process.env.NEXT_PUBLIC_SOFISWAP_PLATFORM_ID = ZERO;
  process.env.NEXT_PUBLIC_MYSO_PLATFORM_PACKAGE_ID = id(1);
  process.env.NEXT_PUBLIC_MYSO_PLATFORM_REGISTRY_OBJECT_ID = id(2);
  process.env.NEXT_PUBLIC_MYSO_BLOCK_LIST_REGISTRY_OBJECT_ID = id(3);
  assert.equal(getSofiSwapPlatformConfig('localnet'), null);
});

test('sofiSwapPlatformConfigFromChain uses env only when GraphQL platform is zero', () => {
  process.env.NEXT_PUBLIC_SOFISWAP_PLATFORM_ID = id(99);
  const config = sofiSwapPlatformConfigFromChain('localnet', {
    platformId: ZERO,
    packageId: id(1),
    platformRegistryId: id(2),
    blockListRegistryId: id(3),
  });
  assert.equal(config?.platformGraphqlId, id(99));
});

test('sofiSwapPlatformConfigFromChain keeps a live GraphQL platform over env', () => {
  process.env.NEXT_PUBLIC_SOFISWAP_PLATFORM_ID = id(99);
  const config = sofiSwapPlatformConfigFromChain('localnet', {
    platformId: id(8),
    packageId: id(1),
    platformRegistryId: id(2),
    blockListRegistryId: id(3),
  });
  assert.equal(config?.platformGraphqlId, id(8));
});

test('missing platform copy names the SofiSwap platform env var', () => {
  assert.match(
    missingSofiSwapPlatformConfigMessage('localnet', { platformId: ZERO }),
    /NEXT_PUBLIC_SOFISWAP_PLATFORM_ID/
  );
});
