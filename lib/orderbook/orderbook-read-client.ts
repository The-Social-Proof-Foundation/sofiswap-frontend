import { MySoGrpcClient } from '@socialproof/myso/grpc';
import {
  mainnetCoins,
  mainnetPools,
  orderbook,
  testnetCoins,
  testnetPools,
} from '@socialproof/orderbook';
import type { OrderbookClient } from '@socialproof/orderbook';

import { getResolvedOrderbookDeployment, type OrderbookRuntimeNetwork } from '@/lib/orderbook-config';
import { getMySoGrpcBaseUrl } from '@/lib/network-utils';
import type { NetworkType } from '@/lib/network-utils';

/** Logical key for the connected wallet’s primary balance manager in {@link OrderbookClient} calls. */
export const TRADE_BALANCE_MANAGER_KEY = 'MANAGER_1';

type OrderbookExtended = MySoGrpcClient & { orderbook: OrderbookClient };

function orderbookRegistration(
  obNet: OrderbookRuntimeNetwork,
  balanceManagers: Record<string, { address: string }>
) {
  const { orderbookPackageId } = getResolvedOrderbookDeployment(obNet);
  const pools = obNet === 'mainnet' ? mainnetPools : testnetPools;
  const coins = obNet === 'mainnet' ? mainnetCoins : testnetCoins;
  return orderbook({
    address: orderbookPackageId,
    pools,
    coins,
    balanceManagers,
  });
}

const grpcClients = new Map<OrderbookRuntimeNetwork, MySoGrpcClient>();
const depthClients = new Map<OrderbookRuntimeNetwork, OrderbookExtended>();
const userClients = new Map<string, OrderbookExtended>();

function getGrpcClient(obNet: OrderbookRuntimeNetwork): MySoGrpcClient {
  let c = grpcClients.get(obNet);
  if (!c) {
    c = new MySoGrpcClient({
      network: obNet,
      baseUrl: getMySoGrpcBaseUrl(obNet as NetworkType),
    });
    grpcClients.set(obNet, c);
  }
  return c;
}

/** Shared client: L2 depth and any call that does not need `balanceManagers`. */
export function getOrderbookDepthClient(obNet: OrderbookRuntimeNetwork): OrderbookExtended {
  let ext = depthClients.get(obNet);
  if (!ext) {
    ext = getGrpcClient(obNet).$extend(
      orderbookRegistration(obNet, {})
    ) as OrderbookExtended;
    depthClients.set(obNet, ext);
  }
  return ext;
}

/**
 * Per–balance-manager client for `accountOpenOrders` / owner-scoped reads.
 * Cached by network + manager object id.
 */
export function getOrderbookUserClient(
  obNet: OrderbookRuntimeNetwork,
  balanceManagerObjectId: string
): OrderbookExtended {
  const key = `${obNet}:${balanceManagerObjectId}`;
  let ext = userClients.get(key);
  if (!ext) {
    ext = getGrpcClient(obNet).$extend(
      orderbookRegistration(obNet, {
        [TRADE_BALANCE_MANAGER_KEY]: { address: balanceManagerObjectId },
      })
    ) as OrderbookExtended;
    userClients.set(key, ext);
  }
  return ext;
}
