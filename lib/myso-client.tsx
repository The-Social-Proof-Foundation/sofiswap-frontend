import { MySoJsonRpcClient } from '@socialproof/myso/jsonRpc';

import type { NetworkType } from '@/lib/network-utils';

const clients = new Map<NetworkType, MySoJsonRpcClient>();

function rpcBaseUrl(): string {
  const env = process.env.NEXT_PUBLIC_MYSO_FULLNODE_URL?.trim();
  if (env) {
    return env.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/fullnode`;
  }
  return 'http://localhost:3000/api/fullnode';
}

/**
 * JSON-RPC client for the selected MySocial network. URL defaults to `/api/fullnode` (cookie-backed proxy) or env override.
 */
export function getMySoJsonRpcClient(network: NetworkType): MySoJsonRpcClient {
  let client = clients.get(network);
  if (!client) {
    client = new MySoJsonRpcClient({
      network,
      url: rpcBaseUrl(),
    });
    clients.set(network, client);
  }
  return client;
}

export function resetMySoJsonRpcClients(): void {
  clients.clear();
}
