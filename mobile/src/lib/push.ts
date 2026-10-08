import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { apolloClient } from './apollo';
import { navigationRef } from '../navigation/navigationRef';
import { REGISTER_PUSH_TOKEN, UNREGISTER_PUSH_TOKEN } from '../graphql/operations';

const TOKEN_KEY = 'push_token';

// A notice that arrives while the app is open still shows.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: false, shouldSetBadge: false }),
});

/**
 * Asks to send notices and tells the backend which phone this is. Quietly does nothing when the patient says no, on a
 * simulator, or when the app has no Expo project id yet (set `extra.eas.projectId` in app.json).
 */
export async function registerForPush(): Promise<void> {
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? (Constants as any).easConfig?.projectId;
    if (!projectId) return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', { name: 'Orders and updates', importance: Notifications.AndroidImportance.DEFAULT });
    }
    const existing = await Notifications.getPermissionsAsync();
    const granted = existing.granted || (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await apolloClient.mutate({ mutation: REGISTER_PUSH_TOKEN, variables: { token, platform: Platform.OS === 'ios' ? 'ios' : 'android' } });
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } catch {
    // Notices are a convenience; the Orders screen shows the same news.
  }
}

/** Stops notices for this phone. Call before the tokens are cleared, since it needs the patient signed in. */
export async function unregisterPush(): Promise<void> {
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    if (!token) return;
    await Promise.race([
      apolloClient.mutate({ mutation: UNREGISTER_PUSH_TOKEN, variables: { token } }),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    /* signing out must never wait on this */
  }
}

/** Where a tapped notice leads. */
function openFor(data: Record<string, unknown> | undefined) {
  if (!navigationRef.isReady()) return;
  if (data?.type === 'order') (navigationRef as any).navigate('Main', { screen: 'Orders' });
  else if (data?.type === 'refund') (navigationRef as any).navigate('Main', { screen: 'Account' });
}

/** Listens for taps on notices, including the one that opened the app. Returns a function that stops listening. */
export function listenForNoticeTaps(): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((r) => openFor(r.notification.request.content.data));
  Notifications.getLastNotificationResponseAsync().then((r) => r && openFor(r.notification.request.content.data)).catch(() => undefined);
  return () => sub.remove();
}
