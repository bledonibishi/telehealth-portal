'use client';

import { ApolloClient, InMemoryCache, Observable, createHttpLink, fromPromise, split } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { onError } from '@apollo/client/link/error';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { getMainDefinition } from '@apollo/client/utilities';
import { print } from 'graphql';
import { createClient } from 'graphql-ws';
import { REFRESH_ACCESS_TOKEN } from '@/graphql/auth';
import { clearToken, getRefreshToken, getToken, setToken } from './auth';

const GRAPHQL_URL = process.env.NEXT_PUBLIC_GRAPHQL_URL ?? 'http://localhost:4000/graphql';
const WS_URL = GRAPHQL_URL.replace(/^http/, 'ws');

const httpLink = createHttpLink({ uri: GRAPHQL_URL });

const authLink = setContext((_, { headers }) => {
  const token = getToken();
  // TODO: move to HttpOnly cookies before production
  return { headers: { ...headers, ...(token ? { authorization: `Bearer ${token}` } : {}) } };
});

let refreshInFlight: Promise<string | null> | null = null;

// Calls the API directly, not through the client, so a failed refresh cannot loop back into errorLink.
function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return Promise.resolve(null);

  refreshInFlight ??= fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: print(REFRESH_ACCESS_TOKEN), variables: { refreshToken } }),
  })
    .then((res) => res.json())
    .then(({ data }) => {
      const tokens = data?.refreshAccessToken;
      if (!tokens) return null;
      setToken(tokens.accessToken, tokens.refreshToken);
      return tokens.accessToken as string;
    })
    .catch(() => null)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

function endSession() {
  clearToken();
  if (window.location.pathname !== '/login') window.location.replace('/login');
}

const REFRESHABLE_REASONS = ['TOKEN_EXPIRED', 'TOKEN_MISSING'];

const errorLink = onError(({ graphQLErrors, response, operation, forward }) => {
  const reason = graphQLErrors
    ?.map((e) => (e.extensions?.originalError as { reason?: string } | undefined)?.reason)
    .find(Boolean);
  // Errors without a reason (for example a wrong password) are not session failures.
  if (!reason || typeof window === 'undefined') return;

  if (!REFRESHABLE_REASONS.includes(reason) || operation.getContext().retriedAfterRefresh) {
    endSession();
    return;
  }

  return fromPromise(refreshAccessToken()).flatMap((token) => {
    if (!token) {
      endSession();
      return Observable.of(response!);
    }
    operation.setContext({ retriedAfterRefresh: true });
    return forward(operation);
  });
});

const wsLink =
  typeof window !== 'undefined'
    ? new GraphQLWsLink(
        createClient({
          url: WS_URL,
          connectionParams: () => {
            const token = getToken();
            return token ? { authorization: `Bearer ${token}` } : {};
          },
        }),
      )
    : null;

const httpChain = errorLink.concat(authLink).concat(httpLink);

const splitLink =
  wsLink !== null
    ? split(
        ({ query }) => {
          const def = getMainDefinition(query);
          return def.kind === 'OperationDefinition' && def.operation === 'subscription';
        },
        wsLink,
        httpChain,
      )
    : httpChain;

export const apolloClient = new ApolloClient({
  link: splitLink,
  cache: new InMemoryCache(),
});
