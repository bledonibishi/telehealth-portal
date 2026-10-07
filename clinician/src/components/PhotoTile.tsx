'use client';

import { useEffect, useState } from 'react';
import AuthedImage from '@/components/AuthedImage';
import { useI18n } from '@/lib/i18n/I18nProvider';

/**
 * A patient photo or document shown whole (fitted, never cropped) with a caption. Clicking it opens
 * it full screen, so small print — a name, a date, a dose — can be read.
 */
export function PhotoTile({ path, caption, height = 'h-48' }: { path?: string | null; caption: string; height?: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <figure className="min-w-0">
      <button
        type="button"
        onClick={() => path && setOpen(true)}
        disabled={!path}
        className={`group relative block w-full ${height} rounded-xl border border-gray-100 bg-gray-50 overflow-hidden disabled:cursor-default`}
        aria-label={t('Open {item} full screen', { item: caption })}
      >
        <AuthedImage path={path} alt={caption} className="w-full h-full object-contain" />
        {path && (
          <span className="absolute right-2 bottom-2 text-[11px] font-medium bg-white/90 text-gray-700 rounded-md px-1.5 py-0.5 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
            {t('Click to enlarge')}
          </span>
        )}
      </button>
      <figcaption className="text-xs text-gray-500 mt-1.5">{caption}</figcaption>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={caption}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 bg-gray-900/85 flex flex-col items-center justify-center p-6"
        >
          <AuthedImage path={path} alt={caption} className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl" />
          <p className="text-sm text-white/90 mt-3">
            {caption} · <span className="text-white/60">{t('Click anywhere or press Esc to close')}</span>
          </p>
        </div>
      )}
    </figure>
  );
}
