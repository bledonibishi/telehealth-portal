import React, { useEffect, useState } from 'react';
import { Image, StyleProp, ImageStyle } from 'react-native';
import { API_ROOT } from '../lib/upload';
import { getToken } from '../lib/tokens';

/** A private upload (only its owner may fetch it), shown by sending the token with the request. */
export function AuthedImage({ fileId, style }: { fileId: string; style?: StyleProp<ImageStyle> }) {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    getToken().then(setToken).catch(() => setToken(null));
  }, []);
  if (token === undefined) return <Image style={style} />;
  return (
    <Image
      style={style}
      resizeMode="contain"
      source={{ uri: `${API_ROOT}/uploads/${fileId}/file`, headers: token ? { Authorization: `Bearer ${token}` } : {} }}
    />
  );
}

/** The id inside "/uploads/<id>/file", which is how the API names a saved photo. */
export const fileIdOfUrl = (url?: string | null) => url?.match(/\/uploads\/([^/]+)\/file/)?.[1] ?? null;
