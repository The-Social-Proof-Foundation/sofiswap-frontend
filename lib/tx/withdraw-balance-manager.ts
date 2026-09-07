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
import { orderbookCoinsForSdkNetwork } from '@/lib/orderbook/sdk-surface';
import { checkedOrderbookAmount } from '@/lib/orderbook/amounts';

/**
 * Withdraws coins from the BalanceManager back to the signer's wallet.
 *
 * The SDK builder mints a coin object via `balance_manager::withdraw` and transfers
 * it to `recipient` (the signer address). Withdraw does not consume the gas coin,
 * so `treatAsGasCoinSplit` stays false.
 */
export async function executeWithdrawFromBalanceManager(input: {
  network: NetworkType;
  obNet: OrderbookRuntimeNetwork;
  balanceManagerObjectId: string;
  coinKey: string;
  amount: number;
  recipient: string;
  sender: string;
  signer: Ed25519Keypair;
}): Promise<MySoTransactionBlockResponse> {
  if (input.network !== input.obNet) throw new Error('The selected market and wallet networks do not match.');
  const coin = orderbookCoinsForSdkNetwork(input.obNet)[input.coinKey];
  if (!coin) throw new Error('This asset is no longer available. Refresh the markets.');
  checkedOrderbookAmount(input.amount, coin.scalar);
  const client = getMySoJsonRpcClient(input.network);
  const obClient = getOrderbookUserClient(input.obNet, input.balanceManagerObjectId);

  return executeTransactionWithSmartGas({
    network: input.network,
    client,
    signer: input.signer,
    sender: input.sender,
    build: (tx) => {
      obClient.orderbook.balanceManager.withdrawFromManager(
        TRADE_BALANCE_MANAGER_KEY,
        input.coinKey,
        input.amount,
        input.recipient
      )(tx);
    },
  });
}
