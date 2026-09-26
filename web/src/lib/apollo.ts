'use client';

import { ApolloClient, InMemoryCache, createHttpLink, split } from '@apollo/client';
import { onError } from '@apollo/client/link/error';
import { setContext } from '@apollo/client/link/context';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { getMainDefinition } from '@apollo/client/utilities';
import { createClient } from 'graphql-ws';

const GRAPHQL_URL = process.env.NEXT_PUBLIC_GRAPHQL_URL ?? 'http://localhost:4000/graphql';
const WS_URL = GRAPHQL_URL.replace(/^http/, 'ws');

const httpLink = createHttpLink({ uri: GRAPHQL_URL });

// An expired/invalid token otherwise leaves protected pages stuck in a
// permanent loading/blank state (no data ever arrives, nothing redirects).
// Bounce straight to login instead whenever the API rejects the token.
const errorLink = onError(({ graphQLErrors, networkError }) => {
  if (typeof window === 'undefined') return;

  const isAuthError =
    graphQLErrors?.some((e) => e.extensions?.code === 'UNAUTHENTICATED') ||
    (networkError && 'statusCode' in networkError && (networkError as any).statusCode === 401);

  if (isAuthError && !window.location.pathname.startsWith('/login')) {
    localStorage.removeItem('patient_token');
    window.location.href = '/login';
  }
});

const authLink = setContext((_, { headers }) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('patient_token') : null;
  return { headers: { ...headers, ...(token ? { authorization: `Bearer ${token}` } : {}) } };
});

const wsLink =
  typeof window !== 'undefined'
    ? new GraphQLWsLink(
        createClient({
          url: WS_URL,
          connectionParams: () => {
            const token = localStorage.getItem('patient_token');
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
  link: errorLink.concat(splitLink),
  cache: new InMemoryCache(),
});
