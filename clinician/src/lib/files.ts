import { ApiError } from '@telehealth/shared-types';
import { getToken } from './auth';

const GRAPHQL_URL = process.env.NEXT_PUBLIC_GRAPHQL_URL ?? 'http://localhost:4000/graphql';
export const API_ROOT = GRAPHQL_URL.replace(/\/graphql$/, '');

/** The path a stored file is served from, for AuthedImage and openAuthedFile. */
export const filePath = (id: string) => `/uploads/${id}/file`;

/** Opens a file the API only serves to a signed-in user (a PDF) in a new tab. Opening it is recorded in the audit log. */
export async function openAuthedFile(path: string): Promise<void> {
  // The tab is opened now, inside the click, and filled in once the file arrives: a tab opened after a wait is taken for a pop-up and blocked.
  const tab = window.open('', '_blank');
  if (tab) tab.opener = null;
  try {
    const res = await fetch(`${API_ROOT}${path}`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!res.ok) throw ApiError.fromResponse(res.status, '', 'We couldn’t open that file.');
    const url = URL.createObjectURL(await res.blob());
    if (tab) tab.location.href = url;
    else window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    tab?.close();
    throw err;
  }
}
