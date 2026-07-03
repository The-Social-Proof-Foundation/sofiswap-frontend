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
 * Places a limit order on the specified pool. Price and quantity are in human units
 * (quote-per-base and base units respectively); the SDK scales them internally via
 * coin scalars. Defaults to GTC (NO_RESTRICTION) unless `postOnly` is requested.
 */
export async function executePlaceLimitOrder(input: {
  network: NetworkType;
  obNet: OrderbookRuntimeNetwork;
  poolKey: string;
  balanceManagerObjectId: string;
  side: OrderSide;
  price: number;
  quantity: number;
  clientOrderId: string;
  sender: string;
  signer: Ed25519Keypair;
  postOnly?: boolean;
}): Promise<MySoTransactionBlockResponse> {
  const client = getMySoJsonRpcClient(input.network);
  const obClient = getOrderbookUserClient(input.obNet, input.balanceManagerObjectId);

  const orderType = input.postOnly ? OrderType.POST_ONLY : OrderType.NO_RESTRICTION;

  return executeTransactionWithSmartGas({
    network: input.network,
    client,
    signer: input.signer,
    sender: input.sender,
    build: (tx) => {
      obClient.orderbook.orderbook.placeLimitOrder({
        poolKey: input.poolKey,
        balanceManagerKey: TRADE_BALANCE_MANAGER_KEY,
        clientOrderId: input.clientOrderId,
        price: input.price,
        quantity: input.quantity,
        isBid: input.side === 'buy',
        orderType,
        selfMatchingOption: SelfMatchingOptions.SELF_MATCHING_ALLOWED,
        payWithMySo: true,
      })(tx);
    },
  });
}
