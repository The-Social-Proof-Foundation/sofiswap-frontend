import type { MySoJsonRpcClient, MySoTransactionBlockResponse } from '@socialproof/myso/jsonRpc';
import type { Ed25519Keypair } from '@socialproof/myso/keypairs/ed25519';
import type { Transaction } from '@socialproof/myso/transactions';

import { getMySoGraphQLClient } from '@/lib/myso-graphql-client';
import { getMySoJsonRpcClient } from '@/lib/myso-client';
import type { NetworkType } from '@/lib/network-utils';
import { isSponsoredGasAllowed } from '@/lib/network-utils';
import {
  MYSO_CLOCK_OBJECT_ID,
  resolveSptChainConfig,
  type SptChainConfig,
} from '@/lib/spt/chain-config';
import { executeTransactionWithSmartGas, MYSO_GAS_COIN_TYPE } from '@/lib/transaction-utils';
import { MAX_U64, feeFromBps } from '@/lib/spt/amounts';
import { readSptRules } from '@/lib/spt/pool-state';
import { resolveSptTradeRouting, type SptTradeRouting } from '@/lib/spt/trade-routing';

export const SPT_TOKEN_TYPE_PROFILE = 1 as const;
export const SPT_TOKEN_TYPE_POST = 2 as const;
export type SptTokenType = typeof SPT_TOKEN_TYPE_PROFILE | typeof SPT_TOKEN_TYPE_POST;

type PaymentCoin = { objectId: string; balance: bigint };
type PaymentPlan = {
  primaryCoinObjectId: string;
  mergeCoinObjectIds: string[];
  forceSponsored: boolean;
  useGasCoin: boolean;
};

export type OwnedSocialToken = {
  objectId: string;
  poolId: string;
  amount: bigint;
  mergeObjectIds: string[];
};

export type SptPostTransactionContext = {
  postId: string;
  beneficiaryVaultId?: string | null;
  minVaultDepositAmount?: bigint;
};

const EXECUTE_OPTIONS = {
  showEffects: true,
  showEvents: true,
  showObjectChanges: true,
} as const;

function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  const normalize = (value: string | null | undefined) =>
    value?.trim().toLowerCase().replace(/^0x0+/, '0x') || '';
  return Boolean(normalize(a) && normalize(a) === normalize(b));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nestedScalar(value: unknown): unknown {
  const record = asRecord(value);
  if (!record) return value;
  if ('value' in record) return nestedScalar(record.value);
  if ('fields' in record) return nestedScalar(record.fields);
  return value;
}

function stringField(fields: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = nestedScalar(fields[key]);
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function bigintField(fields: Record<string, unknown>, ...keys: string[]): bigint | null {
  for (const key of keys) {
    const value = nestedScalar(fields[key]);
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number' && Number.isInteger(value)) return BigInt(value);
    if (typeof value === 'string' && /^\d+$/.test(value.trim())) return BigInt(value.trim());
  }
  return null;
}

async function listPaymentCoins(
  client: MySoJsonRpcClient,
  owner: string
): Promise<PaymentCoin[]> {
  const coins: PaymentCoin[] = [];
  let cursor: string | null | undefined;
  do {
    const page = await client.getCoins({
      owner,
      coinType: MYSO_GAS_COIN_TYPE,
      cursor,
      limit: 100,
    });
    for (const coin of page.data) {
      if (!coin.coinObjectId || !/^\d+$/.test(coin.balance)) continue;
      coins.push({ objectId: coin.coinObjectId, balance: BigInt(coin.balance) });
    }
    cursor = page.hasNextPage ? page.nextCursor : null;
  } while (cursor);
  return coins.sort((a, b) => (a.balance > b.balance ? -1 : a.balance < b.balance ? 1 : 0));
}

async function planPayment(
  client: MySoJsonRpcClient,
  network: NetworkType,
  owner: string,
  amount: bigint
): Promise<PaymentPlan> {
  if (amount <= BigInt(0) || amount > MAX_U64) throw new Error('Payment amount is outside the supported range.');
  const coins = await listPaymentCoins(client, owner);
  if (!coins.length) throw new Error('No MySo coins are available in this wallet.');

  const total = coins.reduce((sum, coin) => sum + coin.balance, BigInt(0));
  if (total < amount) {
    throw new Error('Insufficient MySo balance for this transaction.');
  }
  if (!isSponsoredGasAllowed(network) && total < amount + BigInt(50_000_000)) {
    throw new Error('Leave at least 0.05 MySo available for network gas.');
  }

  if (coins.length === 1) {
    return {
      primaryCoinObjectId: coins[0].objectId,
      mergeCoinObjectIds: [],
      forceSponsored: isSponsoredGasAllowed(network),
      useGasCoin: !isSponsoredGasAllowed(network),
    };
  }

  // Preserve the smallest coin for user-paid gas when the remaining coins cover the payment.
  const paymentCoins = coins.slice(0, -1);
  const paymentTotal = paymentCoins.reduce((sum, coin) => sum + coin.balance, BigInt(0));
  const selected = paymentTotal >= amount ? paymentCoins : coins;
  if (paymentTotal < amount && !isSponsoredGasAllowed(network)) {
    throw new Error('Leave a small MySo coin available for gas, or reduce the amount.');
  }

  return {
    primaryCoinObjectId: selected[0].objectId,
    mergeCoinObjectIds: selected.slice(1).map((coin) => coin.objectId),
    forceSponsored: paymentTotal < amount,
    useGasCoin: false,
  };
}

function paymentCoin(
  tx: Transaction,
  plan: PaymentPlan,
  amount: bigint
) {
  const source = plan.useGasCoin ? tx.gas : tx.object(plan.primaryCoinObjectId);
  if (!plan.useGasCoin && plan.mergeCoinObjectIds.length) {
    tx.mergeCoins(
      source,
      plan.mergeCoinObjectIds.map((id) => tx.object(id))
    );
  }
  return tx.splitCoins(source, [tx.pure.u64(amount)]);
}

function target(config: SptChainConfig, fn: string): `${string}::social_proof_tokens::${string}` {
  return `${config.packageId}::social_proof_tokens::${fn}`;
}

async function assertSptSharedObjectsExist(
  network: NetworkType,
  config: SptChainConfig,
  extra: Array<{ id: string; label: string }> = []
): Promise<void> {
  const client = getMySoJsonRpcClient(network);
  const objects = [
    { id: config.tokenRegistryId, label: 'TokenRegistry' },
    { id: config.sptConfigId, label: 'SocialProofTokensConfig' },
    { id: config.ecosystemTreasuryId, label: 'EcosystemTreasury' },
    { id: config.usernameRegistryId, label: 'UsernameRegistry' },
    { id: config.blockListRegistryId, label: 'BlockListRegistry' },
    { id: config.platformRegistryId, label: 'PlatformRegistry' },
    ...(config.platformId ? [{ id: config.platformId, label: 'SofiSwap platform' }] : []),
    ...extra,
  ];
  const missing = (
    await Promise.all(
      objects.map(async ({ id, label }) => {
        try {
          const result = await client.getObject({ id });
          return result.data ? null : `${label} (${id})`;
        } catch {
          return `${label} (${id})`;
        }
      })
    )
  ).filter((value): value is string => Boolean(value));
  if (missing.length) {
    throw new Error(
      `These SPT objects are not on the ${network} fullnode: ${missing.join(', ')}. ` +
        'GraphQL and the chain are out of sync. Refresh after the indexer catches up, or unset stale NEXT_PUBLIC_SOFISWAP_* / registry env vars.'
    );
  }
}

function assertSucceeded(response: MySoTransactionBlockResponse, label: string): void {
  const status = response.effects?.status;
  if (!status) throw new Error(`${label}: the network response did not include execution effects.`);
  if (status.status !== 'success') throw new Error(status.error || `${label} failed.`);
}

async function executeAndWait(input: {
  network: NetworkType;
  signer: Ed25519Keypair;
  sender: string;
  label: string;
  forceSponsored?: boolean;
  treatAsGasCoinSplit?: boolean;
  build: (tx: Transaction) => void;
}): Promise<MySoTransactionBlockResponse> {
  if (!sameAddress(input.sender, input.signer.toMySoAddress())) throw new Error('The signing wallet does not match the connected account.');
  const client = getMySoJsonRpcClient(input.network);
  const response = await executeTransactionWithSmartGas({
    network: input.network,
    client,
    signer: input.signer,
    sender: input.sender,
    build: input.build,
    forceSponsored: input.forceSponsored,
    treatAsGasCoinSplit: input.treatAsGasCoinSplit,
    executeOptions: EXECUTE_OPTIONS,
  });
  assertSucceeded(response, input.label);
  if (response.digest) {
    await client.waitForTransaction({
      digest: response.digest,
      options: { showEffects: true },
      timeout: 120_000,
      pollInterval: 1_500,
    }).catch(() => {
      // Successful execution effects are authoritative. A lagging read endpoint
      // must not encourage the user to submit the same payment a second time.
      console.warn('SPT transaction succeeded; read availability is delayed.', response.digest);
    });
  }
  return response;
}

export async function findOwnedSocialToken(input: {
  network: NetworkType;
  owner: string;
  poolId: string;
  packageId?: string;
}): Promise<OwnedSocialToken | null> {
  const client = getMySoJsonRpcClient(input.network);
  const packageId = input.packageId || (await resolveSptChainConfig(input.network)).packageId;
  let cursor: string | null | undefined;
  const tokens: Array<{ objectId: string; poolId: string; amount: bigint }> = [];

  do {
    const page = await client.getOwnedObjects({
      owner: input.owner,
      filter: { StructType: `${packageId}::social_proof_tokens::SocialToken` },
      options: { showContent: true, showType: true },
      cursor,
      limit: 100,
    });
    for (const item of page.data) {
      const data = item.data;
      const content = asRecord(data?.content);
      const fields = asRecord(content?.fields);
      if (!data?.objectId || !fields) continue;
      const poolId = stringField(fields, 'pool_id', 'poolId');
      const amount = bigintField(fields, 'amount');
      if (poolId && amount != null && sameAddress(poolId, input.poolId)) {
        tokens.push({ objectId: data.objectId, poolId, amount });
      }
    }
    cursor = page.hasNextPage ? page.nextCursor : null;
  } while (cursor);
  const first = tokens[0];
  return first ? {
    ...first,
    amount: tokens.reduce((total, token) => total + token.amount, BigInt(0)),
    mergeObjectIds: tokens.slice(1).map((token) => token.objectId),
  } : null;
}

function mergeOwnedSocialTokens(tx: Transaction, config: SptChainConfig, token: OwnedSocialToken) {
  for (const id of token.mergeObjectIds) {
    tx.moveCall({ target: target(config, 'merge_social_tokens'), arguments: [tx.object(token.objectId), tx.object(id)] });
  }
}

type PostReserveMetaData = {
  post?: {
    owner?: string | null;
    pocRedirectionKind?: number | null;
    revenueRedirectTo?: string | null;
    postReserveRequiresBeneficiaryVault?: boolean | null;
    revenueManifest?: {
      usesEscrowRedirect?: boolean | null;
      escrowBeneficiaries?: string[] | null;
    } | null;
  } | null;
  pocConfiguration?: { minVaultDepositAmount?: number | string | null } | null;
};

export async function resolvePostTransactionContext(input: {
  network: NetworkType;
  postId: string;
  reservationAmount?: bigint;
}): Promise<SptPostTransactionContext> {
  const client = getMySoGraphQLClient(input.network);
  const amount = input.reservationAmount ?? BigInt(1);
  const meta = await client.query<PostReserveMetaData>({
    query: /* GraphQL */ `
      query SofiSwapPostReserveMeta($id: ID!, $amount: UInt53!) {
        post(id: $id) {
          owner
          pocRedirectionKind
          revenueRedirectTo
          postReserveRequiresBeneficiaryVault(reservationAmountMist: $amount)
          revenueManifest { usesEscrowRedirect escrowBeneficiaries }
        }
        pocConfiguration { minVaultDepositAmount }
      }
    `,
    variables: { id: input.postId, amount: amount.toString() },
  });
  if (meta.errors?.length || !meta.data?.post) {
    throw new Error(meta.errors?.map((e) => e.message).join('; ') || 'Post was not found in GraphQL.');
  }

  const post = meta.data.post;
  const requiresVault = post.postReserveRequiresBeneficiaryVault === true;
  if (!requiresVault) return { postId: input.postId };

  const manifestBeneficiary = post.revenueManifest?.escrowBeneficiaries?.find(
    (candidate) => candidate?.trim()
  )?.trim();
  const beneficiary = manifestBeneficiary || post.revenueRedirectTo?.trim() || post.owner?.trim();
  if (!beneficiary) throw new Error('The beneficiary address for this post could not be resolved.');

  const vault = await client.query<{ pocBeneficiaryVaultByBeneficiary?: { vaultId?: string | null } | null }>({
    query: /* GraphQL */ `
      query SofiSwapPostBeneficiaryVault($beneficiary: MySoAddress!) {
        pocBeneficiaryVaultByBeneficiary(beneficiary: $beneficiary) { vaultId }
      }
    `,
    variables: { beneficiary },
  });
  if (vault.errors?.length) throw new Error(vault.errors.map((error) => error.message).join('; '));
  const vaultId = vault.data?.pocBeneficiaryVaultByBeneficiary?.vaultId?.trim();
  if (!vaultId) throw new Error('The required beneficiary vault has not been indexed on this network yet. Refresh and try again; no funds were moved.');
  const minRaw = meta.data.pocConfiguration?.minVaultDepositAmount;
  const minVaultDepositAmount =
    typeof minRaw === 'number' && Number.isInteger(minRaw)
      ? BigInt(minRaw)
      : typeof minRaw === 'string' && /^\d+$/.test(minRaw)
        ? BigInt(minRaw)
        : BigInt(0);
  return { postId: input.postId, beneficiaryVaultId: vaultId, minVaultDepositAmount };
}

export async function executeEnableSpt(input: {
  network: NetworkType;
  signer: Ed25519Keypair;
  sender: string;
  tokenType: SptTokenType;
  subjectObjectId: string;
}): Promise<MySoTransactionBlockResponse> {
  const config = await resolveSptChainConfig(input.network, { force: true });
  await assertSptSharedObjectsExist(input.network, config, [
    { id: input.subjectObjectId, label: 'SPT subject' },
  ]);
  const fn = input.tokenType === SPT_TOKEN_TYPE_POST
    ? 'enable_spt_for_post'
    : 'create_reservation_pool_for_profile';
  return executeAndWait({
    ...input,
    label: input.tokenType === SPT_TOKEN_TYPE_POST ? 'Enable post SPT' : 'Enable profile SPT',
    build: (tx) => {
      tx.moveCall({
        target: target(config, fn),
        arguments: [
          tx.object(config.tokenRegistryId),
          tx.object(config.sptConfigId),
          tx.object(input.subjectObjectId),
          tx.object(MYSO_CLOCK_OBJECT_ID),
        ],
      });
    },
  });
}

export async function executeLaunchSpt(input: {
  network: NetworkType;
  signer: Ed25519Keypair;
  sender: string;
  reservationPoolId: string;
}): Promise<MySoTransactionBlockResponse> {
  const config = await resolveSptChainConfig(input.network, { force: true });
  await assertSptSharedObjectsExist(input.network, config, [
    { id: input.reservationPoolId, label: 'reservation pool' },
  ]);
  return executeAndWait({
    ...input,
    label: 'Launch Social Proof Token',
    build: (tx) => {
      tx.moveCall({
        target: target(config, 'create_social_proof_token'),
        arguments: [
          tx.object(config.tokenRegistryId),
          tx.object(config.sptConfigId),
          tx.object(input.reservationPoolId),
          tx.object(MYSO_CLOCK_OBJECT_ID),
        ],
      });
    },
  });
}

export async function executeReserveSpt(input: {
  network: NetworkType;
  signer: Ed25519Keypair;
  sender: string;
  tokenType: SptTokenType;
  reservationPoolId: string;
  principalAmount: bigint;
  feeAmount: bigint;
  postContext?: SptPostTransactionContext;
}): Promise<MySoTransactionBlockResponse> {
  const config = await resolveSptChainConfig(input.network, { force: true });
  await assertSptSharedObjectsExist(input.network, config, [
    { id: input.reservationPoolId, label: 'reservation pool' },
    ...(input.postContext?.postId ? [{ id: input.postContext.postId, label: 'post' }] : []),
    ...(input.postContext?.beneficiaryVaultId
      ? [{ id: input.postContext.beneficiaryVaultId, label: 'beneficiary vault' }]
      : []),
  ]);
  const client = getMySoJsonRpcClient(input.network);
  const totalPayment = input.principalAmount + input.feeAmount;
  const rules = await readSptRules(input.network);
  if (input.feeAmount !== feeFromBps(input.principalAmount, rules.reservationFeeBps)) {
    throw new Error('The reservation fee changed. Refresh the token and review the updated payment.');
  }
  const plan = await planPayment(client, input.network, input.sender, totalPayment);
  const platform = config.platformId;

  return executeAndWait({
    ...input,
    label: 'Reserve Social Proof Token',
    forceSponsored: plan.forceSponsored,
    treatAsGasCoinSplit: plan.useGasCoin,
    build: (tx) => {
      const coin = paymentCoin(tx, plan, totalPayment);
      const common = [
        tx.object(config.tokenRegistryId),
        tx.object(config.sptConfigId),
      ];

      if (input.tokenType === SPT_TOKEN_TYPE_PROFILE) {
        tx.moveCall({
          target: target(config, platform ? 'reserve_towards_profile_with_platform' : 'reserve_towards_profile'),
          arguments: platform
            ? [
                ...common,
                tx.object(input.reservationPoolId),
                tx.object(config.ecosystemTreasuryId),
                tx.object(config.platformRegistryId),
                tx.object(platform),
                tx.object(config.blockListRegistryId),
                coin,
                tx.pure.u64(input.principalAmount),
                tx.object(MYSO_CLOCK_OBJECT_ID),
              ]
            : [
                ...common,
                tx.object(input.reservationPoolId),
                tx.object(config.ecosystemTreasuryId),
                coin,
                tx.pure.u64(input.principalAmount),
                tx.object(MYSO_CLOCK_OBJECT_ID),
              ],
        });
        return;
      }

      const post = input.postContext;
      if (!post?.postId) throw new Error('Post context is required for a post reservation.');
      const withVault = Boolean(post.beneficiaryVaultId);
      const fn = platform
        ? withVault
          ? 'reserve_towards_post_with_platform'
          : 'reserve_towards_post_with_platform_simple'
        : withVault
          ? 'reserve_towards_post'
          : 'reserve_towards_post_simple';

      const postArgs = platform
        ? withVault
          ? [
              ...common,
              tx.pure.u64(post.minVaultDepositAmount ?? BigInt(0)),
              tx.object(input.reservationPoolId),
              tx.object(config.ecosystemTreasuryId),
              tx.object(config.platformRegistryId),
              tx.object(platform),
              tx.object(config.blockListRegistryId),
              tx.object(post.postId),
              tx.object(post.beneficiaryVaultId!),
            ]
          : [
              ...common,
              tx.object(input.reservationPoolId),
              tx.object(config.ecosystemTreasuryId),
              tx.object(config.platformRegistryId),
              tx.object(platform),
              tx.object(config.blockListRegistryId),
              tx.object(post.postId),
            ]
        : withVault
          ? [
              ...common,
              tx.pure.u64(post.minVaultDepositAmount ?? BigInt(0)),
              tx.object(input.reservationPoolId),
              tx.object(config.ecosystemTreasuryId),
              tx.object(post.postId),
              tx.object(post.beneficiaryVaultId!),
            ]
          : [
              ...common,
              tx.object(input.reservationPoolId),
              tx.object(config.ecosystemTreasuryId),
              tx.object(post.postId),
            ];

      tx.moveCall({
        target: target(config, fn),
        arguments: [
          ...postArgs,
          coin,
          tx.pure.u64(input.principalAmount),
          tx.object(MYSO_CLOCK_OBJECT_ID),
        ],
      });
    },
  });
}

export async function executeWithdrawSptReservation(input: {
  network: NetworkType;
  signer: Ed25519Keypair;
  sender: string;
  tokenType: SptTokenType;
  reservationPoolId: string;
  amount: bigint;
  postContext?: SptPostTransactionContext;
}): Promise<MySoTransactionBlockResponse> {
  const config = await resolveSptChainConfig(input.network, { force: true });
  await assertSptSharedObjectsExist(input.network, config, [
    { id: input.reservationPoolId, label: 'reservation pool' },
    ...(input.postContext?.postId ? [{ id: input.postContext.postId, label: 'post' }] : []),
    ...(input.postContext?.beneficiaryVaultId
      ? [{ id: input.postContext.beneficiaryVaultId, label: 'beneficiary vault' }]
      : []),
  ]);
  const platform = config.platformId;

  return executeAndWait({
    ...input,
    label: 'Withdraw SPT reservation',
    build: (tx) => {
      const common = [tx.object(config.tokenRegistryId), tx.object(config.sptConfigId)];
      if (input.tokenType === SPT_TOKEN_TYPE_PROFILE) {
        tx.moveCall({
          target: target(config, platform
            ? 'withdraw_reservation_with_platform_for_profile'
            : 'withdraw_reservation_for_profile'),
          arguments: platform
            ? [
                ...common,
                tx.object(input.reservationPoolId),
                tx.object(config.ecosystemTreasuryId),
                tx.object(config.platformRegistryId),
                tx.object(platform),
                tx.object(config.blockListRegistryId),
                tx.pure.u64(input.amount),
                tx.object(MYSO_CLOCK_OBJECT_ID),
              ]
            : [
                ...common,
                tx.object(input.reservationPoolId),
                tx.object(config.ecosystemTreasuryId),
                tx.pure.u64(input.amount),
                tx.object(MYSO_CLOCK_OBJECT_ID),
              ],
        });
        return;
      }

      const post = input.postContext;
      if (!post?.postId) throw new Error('Post context is required to withdraw this reservation.');
      const withVault = Boolean(post.beneficiaryVaultId);
      const fn = platform ? 'withdraw_reservation_with_platform_for_post' : 'withdraw_reservation_for_post';
      tx.moveCall({
        target: target(config, withVault ? fn : `${fn}_simple`),
        arguments: [
          ...common,
          ...(withVault ? [tx.pure.u64(post.minVaultDepositAmount ?? BigInt(0))] : []),
          tx.object(input.reservationPoolId),
          tx.object(config.ecosystemTreasuryId),
          ...(platform ? [tx.object(config.platformRegistryId), tx.object(platform), tx.object(config.blockListRegistryId)] : []),
          tx.object(post.postId),
          ...(withVault ? [tx.object(post.beneficiaryVaultId!)] : []),
          tx.pure.u64(input.amount),
          tx.object(MYSO_CLOCK_OBJECT_ID),
        ],
      });
    },
  });
}

export async function executeBuySpt(input: {
  network: NetworkType;
  signer: Ed25519Keypair;
  sender: string;
  poolId: string;
  tokenAmount: bigint;
  paymentAmount: bigint;
}): Promise<MySoTransactionBlockResponse> {
  const config = await resolveSptChainConfig(input.network, { force: true });
  await assertSptSharedObjectsExist(input.network, config, [
    { id: input.poolId, label: 'SPT pool' },
  ]);
  const client = getMySoJsonRpcClient(input.network);
  const [ownedToken, plan, routing] = await Promise.all([
    findOwnedSocialToken({ ...input, owner: input.sender, packageId: config.packageId }),
    planPayment(client, input.network, input.sender, input.paymentAmount),
    resolveSptTradeRouting({ ...input, config, side: 'buy' }),
  ]);
  const platform = config.platformId;
  const more = Boolean(ownedToken && ownedToken.amount > BigInt(0));

  return executeAndWait({
    ...input,
    label: 'Buy Social Proof Token',
    forceSponsored: plan.forceSponsored,
    treatAsGasCoinSplit: plan.useGasCoin,
    build: (tx) => {
      const coin = paymentCoin(tx, plan, input.paymentAmount);
      if (ownedToken) mergeOwnedSocialTokens(tx, config, ownedToken);
      const fn = platform
        ? more ? 'buy_more_tokens_with_platform' : 'buy_tokens_with_platform'
        : more ? 'buy_more_tokens' : 'buy_tokens';
      const args = platform
        ? [
            tx.object(config.tokenRegistryId),
            tx.object(input.poolId),
            tx.object(config.sptConfigId),
            tx.object(config.ecosystemTreasuryId),
            tx.object(config.platformRegistryId),
            tx.object(config.usernameRegistryId),
            tx.object(config.blockListRegistryId),
            tx.object(platform),
            coin,
            tx.pure.u64(input.tokenAmount),
            ...(more ? [tx.object(ownedToken!.objectId)] : []),
            tx.object(MYSO_CLOCK_OBJECT_ID),
          ]
        : [
            tx.object(config.tokenRegistryId),
            tx.object(input.poolId),
            tx.object(config.sptConfigId),
            tx.object(config.ecosystemTreasuryId),
            tx.object(config.usernameRegistryId),
            tx.object(config.blockListRegistryId),
            coin,
            tx.pure.u64(input.tokenAmount),
            ...(more ? [tx.object(ownedToken!.objectId)] : []),
          ];
      const receipt = tx.moveCall({ target: target(config, routing ? `${fn}_with_vault_routing` : fn), arguments: args });
      if (routing) appendSptVaultSettlement(tx, config, routing, receipt);
    },
  });
}

export async function executeSellSpt(input: {
  network: NetworkType;
  signer: Ed25519Keypair;
  sender: string;
  poolId: string;
  tokenAmount: bigint;
}): Promise<MySoTransactionBlockResponse> {
  const config = await resolveSptChainConfig(input.network, { force: true });
  await assertSptSharedObjectsExist(input.network, config, [
    { id: input.poolId, label: 'SPT pool' },
  ]);
  const ownedToken = await findOwnedSocialToken({
    ...input,
    owner: input.sender,
    packageId: config.packageId,
  });
  if (!ownedToken || ownedToken.amount < input.tokenAmount) {
    throw new Error('This wallet does not hold enough of this Social Proof Token.');
  }
  const platform = config.platformId;
  const routing = await resolveSptTradeRouting({ ...input, config, side: 'sell' });

  return executeAndWait({
    ...input,
    label: 'Sell Social Proof Token',
    build: (tx) => {
      mergeOwnedSocialTokens(tx, config, ownedToken);
      const fn = platform ? 'sell_tokens_with_platform' : 'sell_tokens';
      const receipt = tx.moveCall({
        target: target(config, routing ? `${fn}_with_vault_routing` : fn),
        arguments: platform
          ? [
              tx.object(config.tokenRegistryId),
              tx.object(input.poolId),
              tx.object(config.sptConfigId),
              tx.object(config.ecosystemTreasuryId),
              tx.object(config.platformRegistryId),
              tx.object(config.usernameRegistryId),
              tx.object(config.blockListRegistryId),
              tx.object(platform),
              tx.object(ownedToken.objectId),
              tx.pure.u64(input.tokenAmount),
              tx.object(MYSO_CLOCK_OBJECT_ID),
            ]
          : [
              tx.object(config.tokenRegistryId),
              tx.object(input.poolId),
              tx.object(config.sptConfigId),
              tx.object(config.ecosystemTreasuryId),
              tx.object(config.usernameRegistryId),
              tx.object(config.blockListRegistryId),
              tx.object(ownedToken.objectId),
              tx.pure.u64(input.tokenAmount),
            ],
      });
      if (routing) appendSptVaultSettlement(tx, config, routing, receipt);
    },
  });
}

/** A linear Move receipt requires every payout and finalization in this same PTB. */
function appendSptVaultSettlement(
  tx: Transaction, config: SptChainConfig, routing: NonNullable<SptTradeRouting>,
  receipt: ReturnType<Transaction['moveCall']>,
) {
  for (const vaultId of routing.vaultIds) {
    tx.moveCall({
      target: `${config.packageId}::proof_of_creativity::settle_spt_creator_fee_vault`,
      arguments: [receipt, tx.object(routing.pocConfigId), tx.object(vaultId), tx.object(MYSO_CLOCK_OBJECT_ID)],
    });
  }
  tx.moveCall({ target: target(config, 'finish_creator_fee_settlement'), arguments: [receipt] });
}

export function friendlySptTransactionError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (lower.includes('social_proof_tokens')) {
    const code = lower.match(/(?:abort(?:ed)?(?: with)? code[:\s]*|\},\s*)(\d+)/)?.[1];
    const messages: Record<string, string> = {
      0: 'This action requires the token owner or a registered profile.',
      2: 'This token is already enabled. Refresh to open its pool.',
      4: 'This wallet has reached the maximum allowed holding.',
      5: 'The payment is insufficient. Refresh the quote or reduce the amount.',
      6: 'This wallet has no balance in this pool.',
      8: 'The pool has insufficient liquidity for this amount.',
      12: 'The reservation threshold has not been met yet.',
      19: 'A block relationship prevents this transaction.',
      20: 'SPT trading is currently paused on this network.',
      21: 'This amount exceeds a supported on-chain limit. Try a smaller amount.',
      23: 'Join SofiSwap before trading through this platform.',
      24: 'This wallet is blocked by the platform.',
      25: 'This reservation has converted to SPT. Refresh to trade your tokens.',
      26: 'This wallet already holds the token. Refresh and try again.',
      27: 'This reservation pool has reached its participant limit.',
      30: 'This post’s fee routing changed. Refresh to resolve its beneficiary vaults and try again.',
      32: 'The price moved beyond the trade limit. Refresh the quote.',
      34: 'This token is already enabled. Refresh its pool.',
      38: 'Not all beneficiary fees were settled. No funds moved; refresh and try again.',
      39: 'The beneficiary vault routing changed. No funds moved; refresh and try again.',
    };
    if (code && messages[code]) return messages[code];
  }
  return message || 'The Social Proof Token transaction failed.';
}
