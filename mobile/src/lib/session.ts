import { apolloClient } from './apollo';
import { resetToLogin } from '../navigation/navigationRef';
import { clearTokens } from './tokens';
import { unregisterPush } from './push';

/** Ends the session: the tokens go, and so does everything cached, so the next person to sign in sees none of it. */
export async function signOut() {
  await unregisterPush();
  await clearTokens();
  await apolloClient.clearStore().catch(() => undefined);
  resetToLogin();
}
