import { MySoGraphQLClient } from '@socialproof/myso/graphql';

import {
  getClientSelectedNetwork,
  getGraphqlHttpUrl,
  type NetworkType,
} from '@/lib/network-utils';

let graphqlClient: MySoGraphQLClient | null = null;
let cachedNetwork: NetworkType | null = null;

/** GraphQL HTTP URL for a network (from universal registry + env overrides). */
export function getGraphQLEndpoint(network?: NetworkType): string {
  const net = network ?? getClientSelectedNetwork();
  return getGraphqlHttpUrl(net);
}

function toSdkNetwork(network: NetworkType): 'mainnet' | 'testnet' | 'localnet' {
  return network;
}

const noCacheFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> => {
  const headers = new Headers(init?.headers);
  headers.set('Cache-Control', 'no-cache');
  headers.set('Pragma', 'no-cache');
  return fetch(input, { ...init, cache: 'no-store', headers });
};

export function createMySoGraphQLClient(network: NetworkType): MySoGraphQLClient {
  const url = getGraphqlHttpUrl(network);
  return new MySoGraphQLClient({
    url,
    network: toSdkNetwork(network),
    fetch: noCacheFetch,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  });
}

/**
 * Shared client; recreated when the cookie-backed network changes.
 */
export function getMySoGraphQLClient(network?: NetworkType): MySoGraphQLClient {
  const currentNetwork = network ?? getClientSelectedNetwork();

  if (graphqlClient && cachedNetwork === currentNetwork) {
    return graphqlClient;
  }

  graphqlClient = createMySoGraphQLClient(currentNetwork);
  cachedNetwork = currentNetwork;
  return graphqlClient;
}

export function resetMySoGraphQLClient(): void {
  graphqlClient = null;
  cachedNetwork = null;
}
