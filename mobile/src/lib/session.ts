import { apolloClient } from './apollo';
import { resetToLogin } from '../navigation/navigationRef';
import { clearTokens } from './tokens';

/** Ends the session: the tokens go, and so does everything cached, so the next person to sign in sees none of it. */
export async function signOut() {
  await clearTokens();
  await apolloClient.clearStore().catch(() => undefined);
  resetToLogin();
}
