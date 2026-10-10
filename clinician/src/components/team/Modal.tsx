'use client';

import { useEffect, useId, useRef } from 'react';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { Icon } from './icons';

/** A centred dialog: closed with Esc, the ✕ or a click outside it; keeps the page behind it still; focus moves into it. */
export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const { t } = useI18n();
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector<HTMLElement>('input, select, textarea, button:not([data-close])')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 p-0 sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`bg-white w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'} max-h-[92vh] overflow-y-auto rounded-t-lg sm:rounded-lg shadow-xl`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-white/95 backdrop-blur px-5 py-4 border-b border-gray-100">
          <h2 id={titleId} className="text-base font-semibold text-gray-900">{title}</h2>
          <button type="button" data-close onClick={onClose} aria-label={t('Close')} className="w-8 h-8 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 flex items-center justify-center">
            <Icon name="close" className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/** "Are you sure?" in the page's own style, in place of the browser's confirm box. */
export function ConfirmDialog({ title, message, confirmLabel, danger = false, busy = false, onConfirm, onCancel }: {
  title: string; message: string; confirmLabel: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  const { t } = useI18n();
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="text-sm text-gray-600">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="text-sm text-gray-600 px-3 py-2 rounded-lg hover:bg-gray-100">{t('Cancel')}</button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={`text-sm font-medium text-white px-4 py-2 rounded-lg disabled:opacity-50 ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-500 hover:bg-brand-900'}`}
        >
          {busy ? t('Working…') : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
