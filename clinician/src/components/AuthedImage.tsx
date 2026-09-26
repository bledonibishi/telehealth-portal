'use client';

import { useEffect, useState } from 'react';
import { getToken } from '@/lib/auth';

const GRAPHQL_URL = process.env.NEXT_PUBLIC_GRAPHQL_URL ?? 'http://localhost:4000/graphql';
const API_ROOT = GRAPHQL_URL.replace(/\/graphql$/, '');

/**
 * Onboarding photos are served from an authenticated REST endpoint, so a plain
 * <img src> can't load them (no way to attach the JWT). This fetches the file
 * as a blob with the auth header and renders it from an object URL instead.
 */
export default function AuthedImage({ path, alt, className }: { path?: string | null; alt: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!path) return;
    let objectUrl: string | null = null;
    let cancelled = false;

    fetch(`${API_ROOT}${path}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load image');
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => !cancelled && setError(true));

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  if (!path) return <div className={`bg-gray-100 flex items-center justify-center text-xs text-gray-400 ${className}`}>No file</div>;
  if (error) return <div className={`bg-gray-100 flex items-center justify-center text-xs text-red-400 ${className}`}>Failed to load</div>;
  if (!src) return <div className={`bg-gray-100 animate-pulse ${className}`} />;

  return <img src={src} alt={alt} className={className} />;
}
