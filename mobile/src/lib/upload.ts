import * as SecureStore from 'expo-secure-store';
import { ApiError } from '@telehealth/shared-types';

const GRAPHQL_URL = process.env.EXPO_PUBLIC_GRAPHQL_URL ?? 'http://localhost:4000/graphql';
export const API_ROOT = GRAPHQL_URL.replace(/\/graphql$/, '');

export type UploadKind = 'ID_DOCUMENT' | 'SELFIE' | 'BODY_PHOTO_FRONT' | 'BODY_PHOTO_SIDE' | 'PRESCRIPTION_PROOF';

export type PickedImage = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
};

export async function uploadImage(kind: UploadKind, image: PickedImage): Promise<string> {
  const token = await SecureStore.getItemAsync('access_token');

  const formData = new FormData();
  formData.append('kind', kind);
  formData.append('file', {
    uri: image.uri,
    name: image.fileName ?? `${kind.toLowerCase()}.jpg`,
    type: image.mimeType ?? 'image/jpeg',
  } as any);

  const res = await fetch(`${API_ROOT}/uploads`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  if (!res.ok) {
    // The body is the API's { code, severity, message }; ApiError keeps the message and never shows the raw text.
    throw ApiError.fromResponse(res.status, await res.text().catch(() => ''), 'We couldn’t upload that file. Please try again.');
  }

  const data = await res.json();
  return data.id as string;
}
