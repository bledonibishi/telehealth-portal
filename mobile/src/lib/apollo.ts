import { ApolloClient, InMemoryCache, Observable, createHttpLink, fromPromise, split } from '@apollo/client';
import { onError } from '@apollo/client/link/error';
import { setContext } from '@apollo/client/link/context';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { getMainDefinition } from '@apollo/client/utilities';
import { print } from 'graphql';
import { createClient } from 'graphql-ws';
import { resetToLogin } from '../navigation/navigationRef';
import { REFRESH_ACCESS_TOKEN } from '../graphql/operations';
import { clearTokens, getRefreshToken, getToken, setTokens } from './tokens';
import { sessionEndReason } from '@telehealth/shared-types';

const GRAPHQL_URL = process.env.EXPO_PUBLIC_GRAPHQL_URL ?? 'http://localhost:4000/graphql';
const WS_URL = GRAPHQL_URL.replace(/^http/, 'ws');

const httpLink = createHttpLink({ uri: GRAPHQL_URL });

const authLink = setContext(async (_, { headers }) => {
  const token = await getToken();
  return { headers: { ...headers, ...(token ? { authorization: `Bearer ${token}` } : {}) } };
});

const REFRESH_QUERY = print(REFRESH_ACCESS_TOKEN);
let refreshInFlight: Promise<string | null> | null = null;

// Calls the API directly, not through the client, so a failed refresh cannot loop back into errorLink.
function refreshAccessToken(): Promise<string | null> {
  refreshInFlight ??= getRefreshToken()
    .then((refreshToken) => {
      if (!refreshToken) return null;
      return fetch(GRAPHQL_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: REFRESH_QUERY, variables: { refreshToken } }),
      })
        .then((res) => res.json())
        .then(({ data }) => {
          const tokens = data?.refreshAccessToken;
          if (!tokens) return null;
          return setTokens(tokens.accessToken, tokens.refreshToken).then(() => tokens.accessToken as string);
        });
    })
    .catch(() => null)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

function endSession() {
  clearTokens().finally(resetToLogin);
}

// An expired access token triggers a silent refresh-and-retry (using the
// refresh token) instead of logging the patient out — this is what keeps
// them signed in across the 15-minute access token lifetime without
// re-entering their password, for as long as the 7-day refresh token lasts.
// Sign-in and the other no-session operations answer "unauthenticated" for a wrong password or a spent link. That is a
// message for the form to show, not a session that ended; treating it as one threw the patient back to a fresh sign-in screen.
const PUBLIC_OPERATIONS = new Set(['LoginPatient', 'ActivateAccount', 'RequestActivationLink', 'RequestPatientPasswordReset', 'ResetPassword', 'RefreshAccessToken']);

const errorLink = onError(({ graphQLErrors, response, operation, forward, networkError }) => {
  if (PUBLIC_OPERATIONS.has(operation.operationName)) return;
  // Only an error that says the session ended signs the patient out. Any other "unauthenticated" (a wrong current
  // password) is a message for the screen that asked.
  const reason = sessionEndReason(graphQLErrors);

  const isAuthError = !!reason || (networkError && 'statusCode' in networkError && (networkError as any).statusCode === 401);
  if (!isAuthError) return;

  if (reason !== 'TOKEN_EXPIRED' || operation.getContext().retriedAfterRefresh) {
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

const wsLink = new GraphQLWsLink(
  createClient({
    url: WS_URL,
    connectionParams: async () => {
      const token = await getToken();
      return token ? { authorization: `Bearer ${token}` } : {};
    },
  }),
);

const httpChain = errorLink.concat(authLink).concat(httpLink);

const splitLink = split(
  ({ query }) => {
    const def = getMainDefinition(query);
    return def.kind === 'OperationDefinition' && def.operation === 'subscription';
  },
  wsLink,
  httpChain,
);

export const apolloClient = new ApolloClient({
  link: splitLink,
  cache: new InMemoryCache(),
});
