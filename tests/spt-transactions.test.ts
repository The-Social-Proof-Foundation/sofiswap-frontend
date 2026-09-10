import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { Ed25519Keypair } from '@socialproof/myso/keypairs/ed25519';
import type { Transaction } from '@socialproof/myso/transactions';
import { getMySoJsonRpcClient } from '../lib/myso-client';
import { clearSptChainConfigCache, isSofiSwapPlatformName, resolveSptChainConfig } from '../lib/spt/chain-config';
import { sptEscrowPayouts } from '../lib/spt/trade-routing';
import {
  executeEnableSpt, executeLaunchSpt, executeReserveSpt, executeWithdrawSptReservation,
  executeBuySpt, executeSellSpt, findOwnedSocialToken,
} from '../lib/tx/social-proof-token';

const signer = Ed25519Keypair.fromSecretKey(new Uint8Array(32).fill(7));
const sender = signer.toMySoAddress();
const id = (n: number) => `0x${n.toString(16).padStart(64, '0')}`;
const network = 'localnet' as const;
const auth = { network, sender, signer };
const config = {
  tokenRegistry: { nodes: [{ address: id(1) }] }, sptConfig: { nodes: [{ address: id(2) }] },
  ecosystemTreasury: { nodes: [{ address: id(3) }] }, usernameRegistry: { nodes: [{ address: id(4) }] },
  blockListRegistry: { nodes: [{ address: id(5) }] }, platformRegistry: { nodes: [{ address: id(7) }] },
};
let withPlatform = true;
let graphqlPlatformId = id(8);
let ownedAmounts: bigint[] = [];
let poolTokenType: 1 | 2 = 1;
let poolSupply = BigInt(0);
let poolRevenueManifest: unknown = null;
let vaultIndexed = true;
let captured: ReturnType<Transaction['getData']> | null = null;

beforeEach(() => {
  clearSptChainConfigCache();
  withPlatform = true; graphqlPlatformId = id(8); ownedAmounts = []; poolTokenType = 1; poolSupply = BigInt(0); poolRevenueManifest = null; vaultIndexed = true; captured = null;
  mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    if (body.query.includes('SofiSwapSptObject')) {
      const objectId = body.variables.id;
      const json = objectId === id(20) ? {
        info: { associated_id: id(10), owner: id(11), token_type: poolTokenType, circulating_supply: poolSupply.toString(), base_price: '1000000', quadratic_coefficient: '100' },
        revenue_manifest: poolRevenueManifest,
      } : objectId === id(9) ? { min_vault_deposit_amount: '1' } : {
        base_price: '1000000', quadratic_coefficient: '100', max_hold_percent_bps: '5000', profile_threshold: '100000000000', post_threshold: '10000000000', max_individual_reservation_bps: '1000', trading_creator_fee_bps: '100', trading_platform_fee_bps: '100', trading_treasury_fee_bps: '100', reservation_creator_fee_bps: '50', reservation_platform_fee_bps: '25', reservation_treasury_fee_bps: '25', trading_enabled: true,
      };
      return Response.json({ data: { object: { asMoveObject: { contents: { json } } } } });
    }
    if (body.query.includes('SofiSwapSptVaultConfig')) return Response.json({ data: { pocConfig: { nodes: [{ address: id(9) }] } } });
    if (body.query.includes('SofiSwapSptTradeVault')) return Response.json({ data: { pocBeneficiaryVaultByBeneficiary: vaultIndexed ? { vaultId: id(14), beneficiary: body.variables.beneficiary } : null } });
    assert.match(body.query, /SofiSwapSptChainConfig/, 'Unexpected network request: offline tests must not reach a server');
    return Response.json({ data: { ...config, platforms: withPlatform ? [{ platformId: graphqlPlatformId, name: 'SofiSwap' }] : [] } });
  });
  const rpc = getMySoJsonRpcClient(network);
  mock.method(rpc, 'getObject', async ({ id }: { id: string }) => ({ data: { objectId: id } }));
  mock.method(rpc, 'getBalance', async () => ({ totalBalance: '100000000000', coinObjectCount: 1 }));
  mock.method(rpc, 'getCoins', async () => ({ data: [{ coinObjectId: id(30), balance: '100000000000' }], hasNextPage: false, nextCursor: null }));
  mock.method(rpc, 'getOwnedObjects', async () => ({
    data: ownedAmounts.map((amount, i) => ({ data: { objectId: id(40 + i), content: { dataType: 'moveObject', fields: { pool_id: id(20), amount: amount.toString() } } } })),
    hasNextPage: false, nextCursor: null,
  }));
  mock.method(rpc, 'signAndExecuteTransaction', async ({ transaction }: { transaction: Transaction }) => {
    captured = transaction.getData();
    return { digest: 'offline-test-digest', effects: { status: { status: 'success' } } };
  });
  mock.method(rpc, 'waitForTransaction', async () => ({ digest: 'offline-test-digest' }));
});
afterEach(() => { mock.restoreAll(); clearSptChainConfigCache(); });

function moves() {
  assert.ok(captured, 'The transaction should reach execution');
  return captured.commands.flatMap((command) => command.$kind === 'MoveCall' ? [command.MoveCall] : []);
}

test('owner enable targets profile and post functions with the correct object arguments', async () => {
  await executeEnableSpt({ ...auth, tokenType: 1, subjectObjectId: id(10) });
  assert.equal(moves()[0].function, 'create_reservation_pool_for_profile');
  assert.equal(moves()[0].arguments.length, 4);
  await executeEnableSpt({ ...auth, tokenType: 2, subjectObjectId: id(11) });
  assert.equal(moves()[0].function, 'enable_spt_for_post');
  await executeLaunchSpt({ ...auth, reservationPoolId: id(12) });
  assert.equal(moves()[0].function, 'create_social_proof_token');
  assert.equal(moves()[0].arguments.length, 4);
});

test('reserve and withdrawal cover platform/non-platform profile, simple post and escrow post ABIs', async () => {
  for (const platform of [true, false]) {
    withPlatform = platform;
    for (const tokenType of [1, 2] as const) {
      for (const vault of tokenType === 1 ? [false] : [false, true]) {
        await executeReserveSpt({ ...auth, tokenType, reservationPoolId: id(12), principalAmount: BigInt(1000000), feeAmount: BigInt(10000),
          postContext: tokenType === 2 ? { postId: id(11), beneficiaryVaultId: vault ? id(14) : null, minVaultDepositAmount: BigInt(1) } : undefined });
        const call = moves()[0];
        const name = tokenType === 1 ? `reserve_towards_profile${platform ? '_with_platform' : ''}` : `reserve_towards_post${platform ? '_with_platform' : ''}${vault ? '' : '_simple'}`;
        assert.equal(call.function, name);
        assert.equal(call.arguments.length, (platform ? 10 : 7) + (tokenType === 2 ? vault ? 3 : 1 : 0));
      }
      await executeWithdrawSptReservation({ ...auth, tokenType, reservationPoolId: id(12), amount: BigInt(1000000),
        postContext: tokenType === 2 ? { postId: id(11), beneficiaryVaultId: id(14), minVaultDepositAmount: BigInt(1) } : undefined });
      assert.equal(moves()[0].function, `withdraw_reservation${platform ? '_with_platform' : ''}_for_${tokenType === 1 ? 'profile' : 'post'}`);
      assert.equal(moves()[0].arguments.length, (platform ? 9 : 6) + (tokenType === 2 ? 3 : 0));
      if (tokenType === 2) {
        await executeWithdrawSptReservation({ ...auth, tokenType, reservationPoolId: id(12), amount: BigInt(1000000), postContext: { postId: id(11) } });
        assert.equal(moves()[0].function, `withdraw_reservation${platform ? '_with_platform' : ''}_for_post_simple`);
        assert.equal(moves()[0].arguments.length, platform ? 10 : 7);
      }
    }
  }
});

test('buy uses buy-more for existing holdings and merges split objects before sell', async () => {
  await executeBuySpt({ ...auth, poolId: id(20), tokenAmount: BigInt(50), paymentAmount: BigInt(1000) });
  assert.equal(moves()[0].function, 'buy_tokens_with_platform');
  assert.equal(moves()[0].arguments.length, 11);
  ownedAmounts = [BigInt(30), BigInt(70)];
  const holding = await findOwnedSocialToken({ network, owner: sender, poolId: id(20) });
  assert.equal(holding?.amount, BigInt(100));
  assert.deepEqual(holding?.mergeObjectIds, [id(41)]);
  await executeBuySpt({ ...auth, poolId: id(20), tokenAmount: BigInt(50), paymentAmount: BigInt(1000) });
  assert.deepEqual(moves().map((call) => call.function), ['merge_social_tokens', 'buy_more_tokens_with_platform']);
  await executeSellSpt({ ...auth, poolId: id(20), tokenAmount: BigInt(80) });
  assert.deepEqual(moves().map((call) => call.function), ['merge_social_tokens', 'sell_tokens_with_platform']);
  await assert.rejects(executeSellSpt({ ...auth, poolId: id(20), tokenAmount: BigInt(101) }), /does not hold enough/);
});

test('post buy and sell atomically settle every indexed beneficiary vault', async () => {
  poolTokenType = 2;
  poolRevenueManifest = { entries: [{ beneficiary: id(15), share_bps: '10000', payout_mode: 1 }] };
  await executeBuySpt({ ...auth, poolId: id(20), tokenAmount: BigInt(1_000_000_000), paymentAmount: BigInt(2_000_000) });
  assert.deepEqual(moves().map(call => call.function), [
    'buy_tokens_with_platform_with_vault_routing',
    'settle_spt_creator_fee_vault',
    'finish_creator_fee_settlement',
  ]);
  ownedAmounts = [BigInt(1_000_000_000)];
  poolSupply = BigInt(1_000_000_000);
  await executeSellSpt({ ...auth, poolId: id(20), tokenAmount: BigInt(500_000_000) });
  assert.deepEqual(moves().map(call => call.function), [
    'sell_tokens_with_platform_with_vault_routing',
    'settle_spt_creator_fee_vault',
    'finish_creator_fee_settlement',
  ]);
});

test('vault routing preserves per-entry rounding and groups repeated beneficiaries', () => {
  const payouts = sptEscrowPayouts({
    info: { token_type: 2 },
    revenue_manifest: { entries: [
      { beneficiary: id(15), share_bps: '2500', payout_mode: 1 },
      { beneficiary: id(16), share_bps: '5000', payout_mode: 0 },
      { beneficiary: id(15), share_bps: '2500', payout_mode: 1 },
    ] },
  }, BigInt(101));
  assert.deepEqual(Array.from(payouts.values()), [[BigInt(25), BigInt(25)]]);
  assert.throws(() => sptEscrowPayouts({
    info: { token_type: 2 },
    revenue_manifest: { entries: [{ beneficiary: id(15), share_bps: '9999', payout_mode: 1 }] },
  }, BigInt(100)), /revenue shares/);
});

test('an unindexed required vault blocks the trade before wallet signing', async () => {
  poolTokenType = 2;
  poolRevenueManifest = { entries: [{ beneficiary: id(15), share_bps: '10000', payout_mode: 1 }] };
  vaultIndexed = false;
  await assert.rejects(
    executeBuySpt({ ...auth, poolId: id(20), tokenAmount: BigInt(1_000_000_000), paymentAmount: BigInt(2_000_000) }),
    /required beneficiary vault has not been indexed/,
  );
  assert.equal(captured, null);
});

test('reserve fails before signing when a shared object is missing on the fullnode', async () => {
  mock.method(getMySoJsonRpcClient(network), 'getObject', async () => ({ data: null }));
  await assert.rejects(
    executeReserveSpt({
      ...auth,
      tokenType: 1,
      reservationPoolId: id(12),
      principalAmount: BigInt(1000000),
      feeAmount: BigInt(10000),
    }),
    /not on the localnet fullnode/,
  );
  assert.equal(captured, null);
});

test('failed on-chain execution is not reported as success', async () => {
  mock.method(getMySoJsonRpcClient(network), 'signAndExecuteTransaction', async () => ({ digest: 'failed-test', effects: { status: { status: 'failure', error: 'MoveAbort' } } }));
  await assert.rejects(executeLaunchSpt({ ...auth, reservationPoolId: id(12) }), /MoveAbort/);
});

test('a lagging read endpoint does not turn successful execution into a retryable payment failure', async () => {
  mock.method(getMySoJsonRpcClient(network), 'waitForTransaction', async () => { throw new Error('read endpoint timeout'); });
  const result = await executeLaunchSpt({ ...auth, reservationPoolId: id(12) });
  assert.equal(result.effects?.status.status, 'success');
});

test('NEXT_PUBLIC_SOFISWAP_PLATFORM_ID fills a GraphQL zero platform object', async () => {
  const prev = process.env.NEXT_PUBLIC_SOFISWAP_PLATFORM_ID;
  graphqlPlatformId = '0x0000000000000000000000000000000000000000000000000000000000000000';
  process.env.NEXT_PUBLIC_SOFISWAP_PLATFORM_ID = id(99);
  try {
    const chain = await resolveSptChainConfig(network, { force: true });
    assert.equal(chain.platformId, id(99));
  } finally {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_SOFISWAP_PLATFORM_ID;
    else process.env.NEXT_PUBLIC_SOFISWAP_PLATFORM_ID = prev;
  }
});

test('SoFiSwap GraphQL names match the approved platform', () => {
  assert.equal(isSofiSwapPlatformName('SoFiSwap'), true);
  assert.equal(isSofiSwapPlatformName('Sofi Swap'), true);
  assert.equal(isSofiSwapPlatformName('Chatr'), false);
});

test('a GraphQL zero SofiSwap platform is treated as missing without env', async () => {
  graphqlPlatformId = '0x0';
  const chain = await resolveSptChainConfig(network, { force: true });
  assert.equal(chain.platformId, null);
});

test('live GraphQL SofiSwap platform wins over stale NEXT_PUBLIC_SOFISWAP_PLATFORM_ID', async () => {
  const prev = process.env.NEXT_PUBLIC_SOFISWAP_PLATFORM_ID;
  process.env.NEXT_PUBLIC_SOFISWAP_PLATFORM_ID = id(99);
  try {
    const chain = await resolveSptChainConfig(network, { force: true });
    assert.equal(chain.platformId, id(8));
  } finally {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_SOFISWAP_PLATFORM_ID;
    else process.env.NEXT_PUBLIC_SOFISWAP_PLATFORM_ID = prev;
  }
});
