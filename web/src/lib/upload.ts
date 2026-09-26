import { getToken } from './auth';

const GRAPHQL_URL = process.env.NEXT_PUBLIC_GRAPHQL_URL ?? 'http://localhost:4000/graphql';
const API_ROOT = GRAPHQL_URL.replace(/\/graphql$/, '');

export type UploadKind = 'ID_DOCUMENT' | 'SELFIE' | 'BODY_PHOTO_FRONT' | 'BODY_PHOTO_SIDE' | 'PRESCRIPTION_PROOF';

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
