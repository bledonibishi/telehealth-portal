'use client';

import { useEffect } from 'react';
import { useI18n } from '@/lib/i18n/I18nProvider';

/**
 * A centred dialog with a fixed header; what goes inside decides what scrolls. Closes on Esc or the X, not on a click
 * outside, so half-entered work isn't lost to a stray click.
 */
export function Dialog({ title, subtitle, onClose, children, wide = false }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const { t } = useI18n();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4">
      <div role="dialog" aria-modal="true" aria-label={title} className={`flex flex-col w-full ${wide ? 'max-w-5xl' : 'max-w-3xl'} h-[90vh] max-h-[880px] bg-white rounded-xl shadow-2xl border border-gray-200`}>
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-gray-200">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            {subtitle && <p className="text-xs text-gray-500 mt-0.5 truncate">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label={t('Close')} className="w-8 h-8 -mr-2 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex flex-col flex-1 min-h-0">{children}</div>
      </div>
    </div>
  );
}
