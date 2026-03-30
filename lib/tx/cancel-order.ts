import type { MySoTransactionBlockResponse } from '@socialproof/myso/jsonRpc';
import type { Ed25519Keypair } from '@socialproof/myso/keypairs/ed25519';

import {
  getOrderbookUserClient,
  TRADE_BALANCE_MANAGER_KEY,
} from '@/lib/orderbook/orderbook-read-client';
import type { OrderbookRuntimeNetwork } from '@/lib/orderbook-config';
import { getMySoJsonRpcClient } from '@/lib/myso-client';
import type { NetworkType } from '@/lib/network-utils';
import { executeTransactionWithSmartGas } from '@/lib/transaction-utils';

export async function executeCancelPoolOrder(input: {
  network: NetworkType;
  obNet: OrderbookRuntimeNetwork;
  poolKey: string;
  orderId: string;
  balanceManagerObjectId: string;
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
      obClient.orderbook.orderbook.cancelOrder(
        input.poolKey,
        TRADE_BALANCE_MANAGER_KEY,
        input.orderId
      )(tx);
    },
  });
}
