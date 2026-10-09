import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { API_ROOT } from './config';
import { getToken } from './tokens';
import { ApiError } from '@telehealth/shared-types';

/**
 * Downloads an authenticated PDF (it needs the sign-in token, so a plain link would not load) and hands it to
 * the phone's viewer: preview, share, save. The copy is kept only in the app's cache.
 */
export async function openAuthedPdf(path: string, name: string): Promise<void> {
  const token = await getToken();
  const target = `${FileSystem.cacheDirectory}${name.replace(/[^A-Za-z0-9._-]/g, '-')}.pdf`;
  const res = await FileSystem.downloadAsync(`${API_ROOT}${path}`, target, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (res.status !== 200) {
    await FileSystem.deleteAsync(res.uri, { idempotent: true });
    throw ApiError.fromResponse(res.status, '', res.status === 403 ? 'You don’t have access to that document.' : 'Couldn’t open that document. Please try again.');
  }
  if (!(await Sharing.isAvailableAsync())) throw new Error('This device can’t open PDFs from the app.');
  await Sharing.shareAsync(res.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Check-in report' });
}
