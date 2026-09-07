import { normalizeMySoAddress } from '@socialproof/myso/utils';
import { getMySoGraphQLClient } from '@/lib/myso-graphql-client';
import type { NetworkType } from '@/lib/network-utils';
import { calculateSptBuyCost, calculateSptSellRefund, feeFromBps, MAX_U64, scalarToBigInt } from '@/lib/spt/amounts';
import { moveRecord, readMoveObject } from '@/lib/spt/pool-state';
import type { SptChainConfig } from '@/lib/spt/chain-config';

export type SptTradeRouting = { pocConfigId: string; vaultIds: string[] } | null;

function chainAmount(value: unknown): bigint {
  const amount = scalarToBigInt(value as string | number | null);
  if (amount == null || amount < BigInt(0) || amount > MAX_U64) throw new Error('The current SPT fee routing could not be read. Refresh and try again.');
  return amount;
}

/** Use the POOL's manifest snapshot, not the post's potentially newer manifest. */
export function sptEscrowPayouts(pool: Record<string, unknown>, creatorFee: bigint): Map<string, bigint[]> {
  const payouts = new Map<string, bigint[]>();
  const info = moveRecord(pool.info);
  if (info.token_type !== 1 && info.token_type !== 2) throw new Error('Invalid SPT pool metadata.');
  if (info.token_type === 1) return payouts; // Profile fees remain owner-paid.
  if (!Object.hasOwn(pool, 'revenue_manifest')) throw new Error('The SPT revenue manifest has not been indexed yet.');
  if (pool.revenue_manifest == null) return payouts;
  const entries = moveRecord(pool.revenue_manifest).entries;
  if (!Array.isArray(entries) || !entries.length) throw new Error('Invalid SPT revenue manifest.');
  let totalBps = BigInt(0);
  for (const raw of entries) {
    const entry = moveRecord(raw);
    const share = chainAmount(entry.share_bps);
    totalBps += share;
    if (share <= BigInt(0) || (entry.payout_mode !== 0 && entry.payout_mode !== 1) ||
        typeof entry.beneficiary !== 'string' || !/^0x[0-9a-f]{1,64}$/i.test(entry.beneficiary)) {
      throw new Error('Invalid SPT revenue beneficiary.');
    }
    const slice = feeFromBps(creatorFee, share);
    if (entry.payout_mode !== 1 || slice === BigInt(0)) continue;
    const beneficiary = normalizeMySoAddress(entry.beneficiary);
    payouts.set(beneficiary, [...(payouts.get(beneficiary) ?? []), slice]);
  }
  if (totalBps !== BigInt(10000)) throw new Error('Invalid SPT revenue shares.');
  return payouts;
}

export async function resolveSptTradeRouting(input: {
  network: NetworkType; config: SptChainConfig; poolId: string; tokenAmount: bigint; side: 'buy' | 'sell';
}): Promise<SptTradeRouting> {
  if (input.tokenAmount <= BigInt(0) || input.tokenAmount > MAX_U64) throw new Error('Enter a positive SPT amount within the supported limit.');
  const pool = await readMoveObject(input.network, input.poolId);
  if (!pool) throw new Error('The SPT pool has not been indexed yet. Refresh and try again.');
  const info = moveRecord(pool.info);
  // Profile trades do not need PoC objects or an indexer vault lookup.
  if (info.token_type === 1) return null;
  const rules = await readMoveObject(input.network, input.config.sptConfigId);
  const curve = {
    basePrice: chainAmount(info.base_price), quadraticCoefficient: chainAmount(info.quadratic_coefficient),
    currentSupply: chainAmount(info.circulating_supply), tokenAmount: input.tokenAmount,
  };
  const price = input.side === 'buy' ? calculateSptBuyCost(curve) : calculateSptSellRefund(curve);
  const creatorBps = chainAmount(rules?.trading_creator_fee_bps);
  const totalBps = creatorBps + chainAmount(rules?.trading_platform_fee_bps) + chainAmount(rules?.trading_treasury_fee_bps);
  if (totalBps > BigInt(10000)) throw new Error('Invalid SPT fee configuration.');
  const creatorFee = totalBps === BigInt(0) ? BigInt(0) : feeFromBps(price, totalBps) * creatorBps / totalBps;
  const payouts = sptEscrowPayouts(pool, creatorFee);
  if (!payouts.size) return null;

  const client = getMySoGraphQLClient(input.network);
  const configResult = await client.query<{ pocConfig: { nodes: Array<{ address: string }> } }>({
    query: `query SofiSwapSptVaultConfig { pocConfig: objects(filter: { type: "${input.config.packageId}::proof_of_creativity::PoCConfig", ownerKind: SHARED }, first: 1) { nodes { address } } }`,
    variables: {},
  });
  if (configResult.errors?.length) throw new Error(configResult.errors.map(e => e.message).join('; '));
  const pocConfigId = configResult.data?.pocConfig?.nodes?.[0]?.address;
  if (!pocConfigId) throw new Error('The beneficiary vault configuration has not been indexed yet. Refresh and try again.');
  const poc = await readMoveObject(input.network, pocConfigId);
  const minimum = chainAmount(poc?.min_vault_deposit_amount);
  // Enforce per-slice minimums, exactly as Move does (not the aggregate per beneficiary).
  if (Array.from(payouts.values()).flat().some(amount => amount < minimum)) {
    throw new Error('This trade is too small for the beneficiary vault’s minimum fee deposit. Increase the amount.');
  }
  const vaultIds = await Promise.all(Array.from(payouts.keys()).map(async beneficiary => {
    const result = await client.query<{ pocBeneficiaryVaultByBeneficiary?: { vaultId: string; beneficiary: string } | null }>({
      query: `query SofiSwapSptTradeVault($beneficiary: MySoAddress!) { pocBeneficiaryVaultByBeneficiary(beneficiary: $beneficiary) { vaultId beneficiary } }`,
      variables: { beneficiary },
    });
    if (result.errors?.length) throw new Error(result.errors.map(e => e.message).join('; '));
    const vault = result.data?.pocBeneficiaryVaultByBeneficiary;
    if (!vault?.vaultId || !vault.beneficiary || normalizeMySoAddress(vault.beneficiary) !== beneficiary) {
      throw new Error('A required beneficiary vault has not been indexed yet. Refresh and try again; no funds were moved.');
    }
    return vault.vaultId;
  }));
  if (new Set(vaultIds).size !== vaultIds.length) throw new Error('Conflicting beneficiary vault data. Refresh and try again.');
  return { pocConfigId, vaultIds };
}
