'use client';

import { useEffect, useState } from 'react';
import { getToken } from '@/lib/auth';
import { API_ROOT } from '@/lib/upload';

/**
 * Private files (progress photos) are only served to a signed-in owner, so a plain <img src> can't
 * load them: this fetches the file with the token and shows it from a short-lived object URL.
 */
export function AuthedImage({ fileId, alt, className }: { fileId: string; alt: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    setSrc(null);
    setFailed(false);
    fetch(`${API_ROOT}/uploads/${fileId}/file`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load');
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [fileId]);

  if (failed) return <div className={`bg-slate-100 flex items-center justify-center text-xs text-slate-400 ${className ?? ''}`}>Couldn’t load</div>;
  if (!src) return <div className={`bg-slate-100 animate-pulse ${className ?? ''}`} />;
  return <img src={src} alt={alt} className={className} draggable={false} />;
}
