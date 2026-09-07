import { MySoGrpcClient } from '@socialproof/myso/grpc';
import { orderbook } from '@socialproof/orderbook';
import type { OrderbookClient } from '@socialproof/orderbook';

import type { OrderbookRuntimeNetwork } from '@/lib/orderbook/config';
import { orderbookPluginOptionsForNetwork } from '@/lib/orderbook/sdk-surface';
import { getMySoGrpcBaseUrl } from '@/lib/network-utils';
import type { NetworkType } from '@/lib/network-utils';
import { orderbookMarketRevision } from '@/lib/orderbook/discovered-markets';

/** Logical key for the connected wallet’s primary balance manager in {@link OrderbookClient} calls. */
export const TRADE_BALANCE_MANAGER_KEY = 'MANAGER_1';

type OrderbookExtended = MySoGrpcClient & { orderbook: OrderbookClient };

function orderbookRegistration(
  obNet: OrderbookRuntimeNetwork,
  balanceManagers: Record<string, { address: string }>
) {
  const opts = orderbookPluginOptionsForNetwork(obNet);
  return orderbook({
    ...opts,
    balanceManagers,
  });
}

const grpcClients = new Map<OrderbookRuntimeNetwork, MySoGrpcClient>();
const depthClients = new Map<OrderbookRuntimeNetwork, OrderbookExtended>();
const userClients = new Map<string, OrderbookExtended>();
const marketRevisions = new Map<OrderbookRuntimeNetwork, number>();
function invalidateChangedMarkets(network: OrderbookRuntimeNetwork) {
  const revision = orderbookMarketRevision(network);
  if (marketRevisions.get(network) === revision) return;
  depthClients.delete(network);
  for (const key of Array.from(userClients.keys())) if (key.startsWith(`${network}:`)) userClients.delete(key);
  marketRevisions.set(network, revision);
}

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
  invalidateChangedMarkets(obNet);
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
  invalidateChangedMarkets(obNet);
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
