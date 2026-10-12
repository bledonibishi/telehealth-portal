'use client';

import { useEffect, useState } from 'react';
import { loadPhoto } from '@/lib/photo-cache';

/**
 * Private files (progress photos) are only served to a signed-in owner, so a plain <img src> can't
 * load them: this fetches the file with the token and gives back a short-lived object URL for it.
 */
export function usePhotoUrl(fileId: string | null): { src: string | null; failed: boolean } {
  const [state, setState] = useState<{ src: string | null; failed: boolean }>({ src: null, failed: false });

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    setState({ src: null, failed: false });
    if (!fileId) return;
    loadPhoto(fileId)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setState({ src: url, failed: false });
      })
      .catch(() => !cancelled && setState({ src: null, failed: true }));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [fileId]);

  return state;
}

export function AuthedImage({ fileId, alt, className }: { fileId: string; alt: string; className?: string }) {
  const { src, failed } = usePhotoUrl(fileId);
  if (failed) return <div className={`bg-slate-100 flex items-center justify-center text-xs text-slate-400 ${className ?? ''}`}>Couldn’t load</div>;
  if (!src) return <div className={`bg-slate-100 animate-pulse ${className ?? ''}`} />;
  return <img src={src} alt={alt} className={className} draggable={false} />;
}
