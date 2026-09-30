import {
  MySoJsonRpcClient,
  type GetOwnedObjectsParams,
  type PaginatedObjectsResponse,
} from '@socialproof/myso/jsonRpc';

import type { NetworkType } from '@/lib/network-utils';

const clients = new Map<NetworkType, MySoJsonRpcClient>();

function rpcBaseUrl(network: NetworkType): string {
  const env = process.env.NEXT_PUBLIC_MYSO_FULLNODE_URL?.trim();
  if (env) {
    return env.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/fullnode?network=${network}`;
  }
  return `http://localhost:3000/api/fullnode?network=${network}`;
}

/**
 * JSON-RPC client for the selected MySocial network. URL defaults to `/api/fullnode` (cookie-backed proxy) or env override.
 */
export function getMySoJsonRpcClient(network: NetworkType): MySoJsonRpcClient {
  let client = clients.get(network);
  if (!client) {
    client = new MySoJsonRpcClient({
      network,
      url: rpcBaseUrl(network),
    });
    clients.set(network, client);
  }
  return client;
}

export function resetMySoJsonRpcClients(): void {
  clients.clear();
}

/**
 * Fullnodes reject `getOwnedObjects` pages above their configured cap, and the cap depends
 * on the API version the SDK announces — the current one caps this method at 50. Requesting
 * 100 (the SDK's usual sample size) fails the whole read, which previously made a wallet's
 * own Social Proof Tokens invisible, so the sell side always reported a zero balance.
 */
export const MYSO_OWNED_OBJECTS_PAGE_SIZE = 50;

const PAGE_SIZE_REJECTED = /exceeds max limit (\d+)/i;

/**
 * One page of owned objects of a single struct type, sized to what the fullnode accepts.
 * A node reporting a smaller cap than expected is honored once instead of failing the read.
 */
export async function fetchOwnedObjectsPage(
  client: MySoJsonRpcClient,
  input: { owner: string; structType: string; cursor?: string | null; limit?: number }
): Promise<PaginatedObjectsResponse> {
  let limit = Math.max(1, Math.min(input.limit ?? MYSO_OWNED_OBJECTS_PAGE_SIZE, MYSO_OWNED_OBJECTS_PAGE_SIZE));
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const params: GetOwnedObjectsParams = {
      owner: input.owner,
      filter: { StructType: input.structType },
      options: { showContent: true, showType: true },
      cursor: input.cursor ?? undefined,
      limit,
    };
    try {
      return await client.getOwnedObjects(params);
    } catch (error) {
      const reported = Number(PAGE_SIZE_REJECTED.exec(error instanceof Error ? error.message : '')?.[1]);
      if (!Number.isSafeInteger(reported) || reported <= 0 || reported >= limit) throw error;
      limit = reported;
    }
  }
  throw new Error('The fullnode rejected every owned-object page size for this account.');
}
