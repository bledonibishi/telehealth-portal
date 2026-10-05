import { getToken } from './auth';

const GRAPHQL_URL = process.env.NEXT_PUBLIC_GRAPHQL_URL ?? 'http://localhost:4000/graphql';
export const API_ROOT = GRAPHQL_URL.replace(/\/graphql$/, '');

/** Opens a file the API only serves to a signed-in owner (a prescription PDF) in a new tab. */
export async function openAuthedFile(path: string): Promise<void> {
  const res = await fetch(`${API_ROOT}${path}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error(res.status === 403 ? 'You don’t have access to that document.' : 'Couldn’t open that document. Please try again.');
  const url = URL.createObjectURL(await res.blob());
  window.open(url, '_blank', 'noopener');
  // Long enough for the new tab to load it; then the copy in memory is let go.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export type UploadKind = 'ID_DOCUMENT' | 'SELFIE' | 'BODY_PHOTO_FRONT' | 'BODY_PHOTO_SIDE' | 'PRESCRIPTION_PROOF' | 'PROGRESS_PHOTO';

export async function uploadFile(kind: UploadKind, file: File): Promise<string> {
  const token = getToken();
  const formData = new FormData();
  formData.append('kind', kind);
  formData.append('file', file);

  const res = await fetch(`${API_ROOT}/uploads`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Upload failed (${res.status})`);
  }

  const data = await res.json();
  return data.id as string;
}
