'use client';

import { ApolloClient, InMemoryCache, Observable, createHttpLink, fromPromise, split } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { onError } from '@apollo/client/link/error';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { getMainDefinition } from '@apollo/client/utilities';
import { print } from 'graphql';
import { REFRESH_ACCESS_TOKEN } from '@/graphql/auth';
import { clearToken, getRefreshToken, getToken, setToken } from './auth';
import { createRealtime } from './realtime';

const GRAPHQL_URL = process.env.NEXT_PUBLIC_GRAPHQL_URL ?? 'http://localhost:4000/graphql';
const WS_URL = GRAPHQL_URL.replace(/^http/, 'ws');

const httpLink = createHttpLink({ uri: GRAPHQL_URL });

const authLink = setContext((_, { headers }) => {
  const token = getToken();
  return { headers: { ...headers, ...(token ? { authorization: `Bearer ${token}` } : {}) } };
});

const REFRESH_QUERY = print(REFRESH_ACCESS_TOKEN);
let refreshInFlight: Promise<string | null> | null = null;

// Calls the API directly, not through the client, so a failed refresh cannot loop back into errorLink.
function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return Promise.resolve(null);

  refreshInFlight ??= fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: REFRESH_QUERY, variables: { refreshToken } }),
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
  if (window.location.pathname !== '/login') window.location.href = '/login';
}

// An expired access token triggers a silent refresh-and-retry (using the
// refresh token) instead of logging the patient out — this is what keeps them
// signed in across the 15-minute access token lifetime without re-entering
// their password, for as long as the 7-day refresh token is still valid.
const errorLink = onError(({ graphQLErrors, response, operation, forward }) => {
  if (typeof window === 'undefined') return;

  const reason = graphQLErrors
    ?.map((e) => (e.extensions?.originalError as { reason?: string } | undefined)?.reason)
    .find(Boolean);

  const isAuthError = !!reason || graphQLErrors?.some((e) => e.extensions?.code === 'UNAUTHENTICATED');
  if (!isAuthError) return;

  if (reason !== 'TOKEN_EXPIRED' || operation.getContext().retriedAfterRefresh) {
    endSession();
    return;
  }

  // A refreshed token also has to reach the socket: it authenticates subscriptions with
  // the token it connected with, so reconnect (live subscriptions resume by themselves).
  const refreshed = refreshAccessToken().then((token) => {
    if (token) realtime?.reconnect();
    return token;
  });
  return fromPromise(refreshed).flatMap((token) => {
    if (!token) {
      endSession();
      return Observable.of(response!);
    }
    operation.setContext({ retriedAfterRefresh: true });
    return forward(operation);
  });
});

// Also exposed so screens can fall back to polling while the socket is down.
export const realtime =
  typeof window !== 'undefined'
    ? createRealtime({ url: WS_URL, getToken, refreshToken: refreshAccessToken })
    : null;

const wsLink = realtime ? new GraphQLWsLink(realtime.client) : null;

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
