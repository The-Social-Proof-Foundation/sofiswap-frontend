import { ApolloClient, InMemoryCache, HttpLink, from, ApolloLink } from '@apollo/client';
import { onError } from '@apollo/client/link/error';
import Cookies from 'js-cookie';

// Add missing TypeScript declaration for Apollo Client
declare global {
  interface Window {
    __APOLLO_CLIENT__: any;
  }
}

// Get endpoint based on network setting from cookies
export const getGraphQLEndpoint = (): string => {
  // Always get the CURRENT network from cookies, force-read each time
  const network = Cookies.get('selectedNetwork') || 'localnet';
  
  let endpoint = '';
  switch(network) {
    case 'mainnet':
      endpoint = 'https://mainnet.mysocial.network/graphql';
      break;
    case 'testnet':
      endpoint = 'https://mys-graphql-rpc-testnet.up.railway.app/graphql';
      break;
    case 'localnet':
    default:
      endpoint = 'http://127.0.0.1:9125/graphql';
      break;
  }
  
  console.log(`Using GraphQL endpoint for network [${network}]: ${endpoint}`);
  return endpoint;
};

// Create a factory function to build a new client with the right endpoint
export function createApolloClient() {
  // Force-read the current endpoint based on cookies
  const endpoint = getGraphQLEndpoint();
  
  // Error handling link to prevent app crashes on GraphQL errors
  const errorLink = onError(({ graphQLErrors, networkError }) => {
    if (graphQLErrors) {
      graphQLErrors.forEach(({ message, locations, path }) => {
        console.error(
          `[GraphQL error]: Message: ${message}, Location: ${locations}, Path: ${path}`
        );
      });
    }
    if (networkError) {
      console.error(`[Network error]: ${networkError}`);
    }
  });

  // Create HTTP link with the current endpoint - explicitly use the endpoint we just read
  const httpLink = new HttpLink({
    uri: endpoint,
  });

  // Create a general onRequest link for better handling
  const loggingLink = new ApolloLink((operation, forward) => {
    console.log(`GraphQL Request: ${operation.operationName} to ${endpoint}`);
    return forward(operation).map(response => {
      console.log(`GraphQL Response for ${operation.operationName}:`, response);
      return response;
    });
  });

  const client = new ApolloClient({
    link: from([errorLink, loggingLink, httpLink]),
    cache: new InMemoryCache(),
    defaultOptions: {
      watchQuery: {
        fetchPolicy: 'network-only',
        errorPolicy: 'all',
      },
      query: {
        fetchPolicy: 'network-only',
        errorPolicy: 'all',
      },
    },
    connectToDevTools: true,
  });
  
  console.log(`Created new Apollo client with endpoint: ${endpoint}`);
  return client;
}

// Export a default client instance
const client = createApolloClient();
export default client; 