import type { MySoTransactionBlockResponse } from '@socialproof/myso/jsonRpc';
import type { Ed25519Keypair } from '@socialproof/myso/keypairs/ed25519';
import { OrderType, SelfMatchingOptions } from '@socialproof/orderbook';

import {
  getOrderbookUserClient,
  TRADE_BALANCE_MANAGER_KEY,
} from '@/lib/orderbook/orderbook-read-client';
import type { OrderbookRuntimeNetwork } from '@/lib/orderbook/config';
import { getMySoJsonRpcClient } from '@/lib/myso-client';
import type { NetworkType } from '@/lib/network-utils';
import { executeTransactionWithSmartGas } from '@/lib/transaction-utils';
import type { OrderSide } from '@/lib/trade/order-placement-utils';

/**
 * Places a market order on the specified pool. Quantity is in human base units; the
 * SDK scales it internally. Uses IOC (IMMEDIATE_OR_CANCEL) so any unfilled remainder
 * is cancelled on-chain rather than resting on the book.
 */
export async function executePlaceMarketOrder(input: {
  network: NetworkType;
  obNet: OrderbookRuntimeNetwork;
  poolKey: string;
  balanceManagerObjectId: string;
  side: OrderSide;
  quantity: number;
  clientOrderId: string;
  sender: string;
  signer: Ed25519Keypair;
}): Promise<MySoTransactionBlockResponse> {
  const client = getMySoJsonRpcClient(input.network);
  const obClient = getOrderbookUserClient(input.obNet, input.balanceManagerObjectId);

  return executeTransactionWithSmartGas({
    network: input.network,
    client,
    signer: input.signer,
    sender: input.sender,
    build: (tx) => {
      obClient.orderbook.orderbook.placeMarketOrder({
        poolKey: input.poolKey,
        balanceManagerKey: TRADE_BALANCE_MANAGER_KEY,
        clientOrderId: input.clientOrderId,
        quantity: input.quantity,
        isBid: input.side === 'buy',
        selfMatchingOption: SelfMatchingOptions.SELF_MATCHING_ALLOWED,
        payWithMySo: true,
      })(tx);
    },
  });
}

/**
 * Re-exported for callers that need to inspect the IOC order type.
 */
export const MARKET_ORDER_TYPE = OrderType.IMMEDIATE_OR_CANCEL;
