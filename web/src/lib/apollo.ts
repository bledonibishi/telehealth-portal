'use client';

import { ApolloClient, InMemoryCache, createHttpLink, split } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { getMainDefinition } from '@apollo/client/utilities';
import { createClient } from 'graphql-ws';

const GRAPHQL_URL = process.env.NEXT_PUBLIC_GRAPHQL_URL ?? 'http://localhost:4000/graphql';
const WS_URL = GRAPHQL_URL.replace(/^http/, 'ws');

const httpLink = createHttpLink({ uri: GRAPHQL_URL });

const authLink = setContext((_, { headers }) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  // TODO: move to HttpOnly cookies before production
  return { headers: { ...headers, ...(token ? { authorization: `Bearer ${token}` } : {}) } };
});

const wsLink =
  typeof window !== 'undefined'
    ? new GraphQLWsLink(
        createClient({
          url: WS_URL,
          connectionParams: () => {
            const token = localStorage.getItem('access_token');
            return token ? { authorization: `Bearer ${token}` } : {};
          },
        }),
      )
    : null;

const splitLink =
  wsLink !== null
    ? split(
        ({ query }) => {
          const def = getMainDefinition(query);
          return def.kind === 'OperationDefinition' && def.operation === 'subscription';
        },
        wsLink,
        authLink.concat(httpLink),
      )
    : authLink.concat(httpLink);

export const apolloClient = new ApolloClient({
  link: splitLink,
  cache: new InMemoryCache(),
});
