import { ApolloClient, InMemoryCache, createHttpLink, split } from '@apollo/client';
import { onError } from '@apollo/client/link/error';
import { setContext } from '@apollo/client/link/context';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { getMainDefinition } from '@apollo/client/utilities';
import { createClient } from 'graphql-ws';
import * as SecureStore from 'expo-secure-store';
import { resetToLogin } from '../navigation/navigationRef';

const GRAPHQL_URL = process.env.EXPO_PUBLIC_GRAPHQL_URL ?? 'http://localhost:4000/graphql';
const WS_URL = GRAPHQL_URL.replace(/^http/, 'ws');

const httpLink = createHttpLink({ uri: GRAPHQL_URL });

// An expired/invalid token otherwise leaves screens stuck on a permanent
// loading state (no data ever arrives, nothing navigates away). Bounce back
// to login instead whenever the API rejects the token.
const errorLink = onError(({ graphQLErrors, networkError }) => {
  const isAuthError =
    graphQLErrors?.some((e) => e.extensions?.code === 'UNAUTHENTICATED') ||
    (networkError && 'statusCode' in networkError && (networkError as any).statusCode === 401);

  if (isAuthError) {
    SecureStore.deleteItemAsync('access_token').finally(resetToLogin);
  }
});

const authLink = setContext(async (_, { headers }) => {
  const token = await SecureStore.getItemAsync('access_token');
  return { headers: { ...headers, ...(token ? { authorization: `Bearer ${token}` } : {}) } };
});

const wsLink = new GraphQLWsLink(
  createClient({
    url: WS_URL,
    connectionParams: async () => {
      const token = await SecureStore.getItemAsync('access_token');
      return token ? { authorization: `Bearer ${token}` } : {};
    },
  }),
);

const splitLink = split(
  ({ query }) => {
    const def = getMainDefinition(query);
    return def.kind === 'OperationDefinition' && def.operation === 'subscription';
  },
  wsLink,
  authLink.concat(httpLink),
);

export const apolloClient = new ApolloClient({
  link: errorLink.concat(splitLink),
  cache: new InMemoryCache(),
});
