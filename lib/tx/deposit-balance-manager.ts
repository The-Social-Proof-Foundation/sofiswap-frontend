import type { MySoTransactionBlockResponse } from '@socialproof/myso/jsonRpc';
import type { Ed25519Keypair } from '@socialproof/myso/keypairs/ed25519';

import { coinWithBalance } from '@socialproof/myso/transactions';
import { orderbookPluginOptionsForNetwork } from '@/lib/orderbook/sdk-surface';
import { checkedOrderbookAmount } from '@/lib/orderbook/amounts';
import type { OrderbookRuntimeNetwork } from '@/lib/orderbook/config';
import { getMySoJsonRpcClient } from '@/lib/myso-client';
import type { NetworkType } from '@/lib/network-utils';
import { executeTransactionWithSmartGas } from '@/lib/transaction-utils';

/**
 * Deposits coins from the signer's wallet into their BalanceManager.
 *
 * Sponsored deposits explicitly resolve sender-owned payment coins: splitting
 * `tx.gas` there would incorrectly try to spend the sponsor's gas as a deposit.
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
  if (input.network !== input.obNet) throw new Error('The selected market and wallet networks do not match.');
  const config = orderbookPluginOptionsForNetwork(input.obNet);
  const coin = config.coins[input.coinKey];
  if (!coin) throw new Error('This asset is no longer available. Refresh the markets.');
  const amount = checkedOrderbookAmount(input.amount, coin.scalar);

  return executeTransactionWithSmartGas({
    network: input.network,
    client,
    signer: input.signer,
    sender: input.sender,
    build: (tx, { sponsored }) => {
      const payment = coinWithBalance({ type: coin.type, balance: amount, useGasCoin: !sponsored });
      tx.moveCall({
        target: `${config.address}::balance_manager::deposit`,
        arguments: [tx.object(input.balanceManagerObjectId), payment],
        typeArguments: [coin.type],
      });
    },
  });
}
