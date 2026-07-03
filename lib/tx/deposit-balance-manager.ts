import type { MySoTransactionBlockResponse } from '@socialproof/myso/jsonRpc';
import type { Ed25519Keypair } from '@socialproof/myso/keypairs/ed25519';

import {
  getOrderbookUserClient,
  TRADE_BALANCE_MANAGER_KEY,
} from '@/lib/orderbook/orderbook-read-client';
import type { OrderbookRuntimeNetwork } from '@/lib/orderbook/config';
import { getMySoJsonRpcClient } from '@/lib/myso-client';
import type { NetworkType } from '@/lib/network-utils';
import { executeTransactionWithSmartGas } from '@/lib/transaction-utils';

/**
 * Deposits coins from the signer's wallet into their BalanceManager.
 *
 * `coinWithBalance` (used internally by the SDK) fetches the user's coin objects
 * during `tx.build()`. When `coinKey === 'MYSO'` (the gas coin), this can conflict
 * with gas payment, so `treatAsGasCoinSplit` forces sponsorship when the wallet has
 * only one MYSO coin object.
 */
export async function executeDepositIntoBalanceManager(input: {
  network: NetworkType;
  obNet: OrderbookRuntimeNetwork;
  balanceManagerObjectId: string;
  coinKey: string;
  amount: number;
  sender: string;
  signer: Ed25519Keypair;
}): Promise<MySoTransactionBlockResponse> {
  const client = getMySoJsonRpcClient(input.network);
  const obClient = getOrderbookUserClient(input.obNet, input.balanceManagerObjectId);
  const isGasCoin = input.coinKey === 'MYSO';

  return executeTransactionWithSmartGas({
    network: input.network,
    client,
    signer: input.signer,
    sender: input.sender,
    treatAsGasCoinSplit: isGasCoin,
    build: (tx) => {
      obClient.orderbook.balanceManager.depositIntoManager(
        TRADE_BALANCE_MANAGER_KEY,
        input.coinKey,
        input.amount
      )(tx);
    },
  });
}
