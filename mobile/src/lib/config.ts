import { Linking } from 'react-native';

const GRAPHQL_URL = process.env.EXPO_PUBLIC_GRAPHQL_URL ?? 'http://localhost:4000/graphql';
/** The API without /graphql: where the authenticated PDF endpoints live. */
export const API_ROOT = GRAPHQL_URL.replace(/\/graphql$/, '');

/** The patient web portal, for the few things the app hands over to it (booking an appointment). */
export const PORTAL_URL = process.env.EXPO_PUBLIC_PORTAL_URL ?? 'http://localhost:3000';

/** Shown only when set, so the app never displays made-up hours or numbers. */
export const SUPPORT_HOURS = process.env.EXPO_PUBLIC_SUPPORT_HOURS || null;
export const EMERGENCY_NUMBER = process.env.EXPO_PUBLIC_EMERGENCY_NUMBER || '112';

export const INJECTION_VIDEO_URL = process.env.EXPO_PUBLIC_INJECTION_VIDEO_URL || null;

/** Opens a link in the browser; false when the phone cannot. */
export async function openLink(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
