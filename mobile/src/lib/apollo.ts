import { ApolloClient, InMemoryCache, createHttpLink, split } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { getMainDefinition } from '@apollo/client/utilities';
import { createClient } from 'graphql-ws';
import * as SecureStore from 'expo-secure-store';

const GRAPHQL_URL = process.env.EXPO_PUBLIC_GRAPHQL_URL ?? 'http://localhost:4000/graphql';
const WS_URL = GRAPHQL_URL.replace(/^http/, 'ws');

const httpLink = createHttpLink({ uri: GRAPHQL_URL });

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
  link: splitLink,
  cache: new InMemoryCache(),
});
