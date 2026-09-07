import { bcs } from '@socialproof/myso/bcs';
import { normalizeMySoAddress } from '@socialproof/myso/utils';

import { getMySoGraphQLClient } from '@/lib/myso-graphql-client';
import type { NetworkType } from '@/lib/network-utils';
import { scalarToBigInt } from '@/lib/spt/amounts';
import { resolveSptChainConfig } from '@/lib/spt/chain-config';

export type MoveJson = Record<string, unknown>;
export function moveRecord(value: unknown): MoveJson {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as MoveJson : {};
}

export const SPT_OBJECT_QUERY = /* GraphQL */ `
  query SofiSwapSptObject($id: MySoAddress!) {
    object(address: $id) { asMoveObject { contents { json type { repr } } } }
  }
`;
export const SPT_TABLE_VALUE_QUERY = /* GraphQL */ `
  query SofiSwapSptTableValue($table: MySoAddress!, $name: DynamicFieldName!) {
    address(address: $table) {
      dynamicField(name: $name) { value { ... on MoveValue { json } } }
    }
  }
`;

export async function readMoveObject(network: NetworkType, id: string): Promise<MoveJson | null> {
  const result = await getMySoGraphQLClient(network).query<{
    object: { asMoveObject: { contents: { json: unknown } | null } | null } | null;
  }>({ query: SPT_OBJECT_QUERY, variables: { id } });
  if (result.errors?.length) throw new Error(result.errors.map((e) => e.message).join('; '));
  const value = result.data?.object?.asMoveObject?.contents?.json;
  return value ? moveRecord(value) : null;
}

export async function readAddressTableValue(network: NetworkType, table: string, address: string): Promise<unknown> {
  const result = await getMySoGraphQLClient(network).query<{
    address: { dynamicField: { value: { json: unknown } | null } | null } | null;
  }>({
    query: SPT_TABLE_VALUE_QUERY,
    variables: { table, name: { type: 'address', bcs: bcs.Address.serialize(address).toBase64() } },
  });
  if (result.errors?.length) throw new Error(result.errors.map((e) => e.message).join('; '));
  return result.data?.address?.dynamicField?.value?.json ?? null;
}

function address(value: unknown): string | null {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{1,64}$/i.test(value)) return null;
  return normalizeMySoAddress(value);
}

/** The registry is keyed by the profile/post object, not by owner or a holder row. */
export async function resolveLiveSptPoolId(network: NetworkType, subjectId: string): Promise<string | null> {
  const config = await resolveSptChainConfig(network);
  const registry = await readMoveObject(network, config.tokenRegistryId);
  const table = address(moveRecord(registry?.tokens).id);
  if (!table) throw new Error('The token registry could not be read. Refresh and try again.');
  const info = moveRecord(await readAddressTableValue(network, table, subjectId));
  return address(info.id);
}

export type SptPoolState = {
  poolId: string;
  subjectId: string;
  owner: string;
  tokenType: 1 | 2;
  live: boolean;
  converted: boolean;
  totalReserved: bigint;
  requiredThreshold: bigint;
  currentSupply: bigint;
  basePrice: bigint;
  quadraticCoefficient: bigint;
  mysoBalance: bigint;
  viewerReservation: bigint;
  viewerHolding: bigint;
  creatorFeesUseVault: boolean;
};

export type SptRules = {
  basePrice: bigint; quadraticCoefficient: bigint; maxHoldBps: bigint;
  profileThreshold: bigint; postThreshold: bigint; maxReservationBps: bigint;
  tradingFeeBps: bigint; reservationFeeBps: bigint;
  reservationCreatorBps: bigint; reservationPlatformBps: bigint; reservationTreasuryBps: bigint;
  tradingEnabled: boolean;
};

export async function readSptRules(network: NetworkType): Promise<SptRules> {
  const config = await resolveSptChainConfig(network);
  const object = await readMoveObject(network, config.sptConfigId);
  const amount = (name: string) => {
    const value = scalarToBigInt(object?.[name] as string | number | null);
    if (value == null || value < BigInt(0)) throw new Error('Could not read the current SPT configuration.');
    return value;
  };
  const reservationCreatorBps = amount('reservation_creator_fee_bps');
  const reservationPlatformBps = amount('reservation_platform_fee_bps');
  const reservationTreasuryBps = amount('reservation_treasury_fee_bps');
  return {
    basePrice: amount('base_price'), quadraticCoefficient: amount('quadratic_coefficient'),
    maxHoldBps: amount('max_hold_percent_bps'), profileThreshold: amount('profile_threshold'),
    postThreshold: amount('post_threshold'), maxReservationBps: amount('max_individual_reservation_bps'),
    tradingFeeBps: amount('trading_creator_fee_bps') + amount('trading_platform_fee_bps') + amount('trading_treasury_fee_bps'),
    reservationFeeBps: reservationCreatorBps + reservationPlatformBps + reservationTreasuryBps,
    reservationCreatorBps, reservationPlatformBps, reservationTreasuryBps,
    tradingEnabled: object?.trading_enabled === true,
  };
}

/** Reads exact pool terms and the viewer's ledger entry, independently of list pagination. */
export async function readSptPoolState(input: {
  network: NetworkType;
  poolId: string;
  subjectId: string;
  viewer?: string | null;
}): Promise<SptPoolState> {
  const pool = await readMoveObject(input.network, input.poolId);
  if (!pool) throw new Error('The pool is not available yet. Refresh after the network has indexed it.');
  const info = moveRecord(pool.info);
  const subjectId = address(info.associated_id);
  if (!subjectId || subjectId !== normalizeMySoAddress(input.subjectId)) {
    throw new Error('This pool does not belong to the selected profile or post.');
  }
  const live = info.circulating_supply != null;
  const tableId = address(moveRecord(live ? pool.holders : pool.reservations).id);
  const viewerAmount = input.viewer && tableId
    ? await readAddressTableValue(input.network, tableId, input.viewer) : null;
  const amount = (value: unknown) => scalarToBigInt(value as string | number | null) ?? BigInt(0);
  const owner = address(info.owner);
  if (!owner || (info.token_type !== 1 && info.token_type !== 2)) throw new Error('Invalid SPT pool metadata.');
  const manifestEntries = Array.isArray(moveRecord(pool.revenue_manifest).entries)
    ? moveRecord(pool.revenue_manifest).entries as unknown[] : [];
  return {
    poolId: input.poolId, subjectId, owner, tokenType: info.token_type, live,
    converted: pool.converted === true,
    totalReserved: amount(info.total_reserved), requiredThreshold: amount(info.required_threshold),
    currentSupply: amount(info.circulating_supply), basePrice: amount(info.base_price),
    quadraticCoefficient: amount(info.quadratic_coefficient), mysoBalance: amount(pool.myso_balance),
    viewerReservation: live || pool.converted === true ? BigInt(0) : amount(viewerAmount),
    viewerHolding: live ? amount(viewerAmount) : BigInt(0),
    creatorFeesUseVault: info.token_type === 2 && manifestEntries.some(
      (entry) => moveRecord(entry).payout_mode === 1
    ),
  };
}
