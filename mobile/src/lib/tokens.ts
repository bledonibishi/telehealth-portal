import * as SecureStore from 'expo-secure-store';

// Centralizes the token keys so login and the Apollo refresh flow agree on
// where the access token (15 min) and refresh token (7 days) live.
export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync('access_token');
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync('refresh_token');
}

export async function setTokens(accessToken: string, refreshToken?: string | null) {
  await SecureStore.setItemAsync('access_token', accessToken);
  if (refreshToken) await SecureStore.setItemAsync('refresh_token', refreshToken);
}

export async function clearTokens() {
  await Promise.all([
    SecureStore.deleteItemAsync('access_token'),
    SecureStore.deleteItemAsync('refresh_token'),
  ]);
}
