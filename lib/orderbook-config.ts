/**
 * Maps app network to @socialproof/orderbook runtime (mainnet/testnet only).
 * Orderbook SDK does not support localnet.
 */

import { mainnetPackageIds, testnetPackageIds } from '@socialproof/orderbook';

import type { NetworkType } from '@/lib/network-utils';

export type OrderbookRuntimeNetwork = 'mainnet' | 'testnet';

function trimPublic(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** On-chain orderbook deployment — defaults to IDs bundled in `@socialproof/orderbook` (may lag your network). */
export interface ResolvedOrderbookDeployment {
  orderbookPackageId: string;
  registryId: string;
}

/**
 * Resolves package + registry for PTBs and simulations.
 * Set per-network env overrides when RPC errors with “Package object does not exist” for the SDK default ID.
 *
 * The registry id must belong to the **same** on-chain orderbook deployment as the package id. Mixing a
 * registry from another publish or a partially initialized registry can make `get_balance_manager_ids`
 * succeed while `register_balance_manager` aborts inside `dynamic_field::borrow_child_object_mut`.
 */
export function getResolvedOrderbookDeployment(
  network: OrderbookRuntimeNetwork
): ResolvedOrderbookDeployment {
  const defaults = network === 'mainnet' ? mainnetPackageIds : testnetPackageIds;
  if (network === 'testnet') {
    const pkg = trimPublic(process.env.NEXT_PUBLIC_ORDERBOOK_PACKAGE_ID_TESTNET);
    const reg = trimPublic(process.env.NEXT_PUBLIC_ORDERBOOK_REGISTRY_ID_TESTNET);
    if (pkg && reg) {
      return { orderbookPackageId: pkg, registryId: reg };
    }
  } else {
    const pkg = trimPublic(process.env.NEXT_PUBLIC_ORDERBOOK_PACKAGE_ID_MAINNET);
    const reg = trimPublic(process.env.NEXT_PUBLIC_ORDERBOOK_REGISTRY_ID_MAINNET);
    if (pkg && reg) {
      return { orderbookPackageId: pkg, registryId: reg };
    }
  }
  return {
    orderbookPackageId: defaults.ORDERBOOK_PACKAGE_ID,
    registryId: defaults.REGISTRY_ID,
  };
}

export function orderbookRuntimeNetwork(
  network: NetworkType
): OrderbookRuntimeNetwork | null {
  if (network === 'mainnet' || network === 'testnet') return network;
  return null;
}

/**
 * When true (default), `join_platform` is bundled with create→share→register BalanceManager in one PTB.
 * Set to `false` if your deployed `join_platform` already performs full orderbook setup to avoid duplicate managers.
 */
export function tradingSetupBundledWithJoin(): boolean {
  return process.env.NEXT_PUBLIC_TRADING_SETUP_WITH_JOIN !== 'false';
}
