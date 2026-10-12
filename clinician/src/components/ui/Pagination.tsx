'use client';

import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/lib/i18n/I18nProvider';

export const PAGE_SIZES = [10, 25, 50, 100];
const SIZES = PAGE_SIZES;
const STORAGE_KEY = 'clinician.pageSize';

export const rememberPageSize = (n: number) => {
  try { window.localStorage.setItem(STORAGE_KEY, String(n)); } catch { /* the choice just isn't remembered */ }
};

export const readSize = (initial: number) => {
  try {
    const v = Number(window.localStorage.getItem(STORAGE_KEY));
    return SIZES.includes(v) ? v : initial;
  } catch {
    return initial;
  }
};

/** What the page bar needs, whether the paging is done by usePagination or by a table. */
export interface Pager {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  from: number;
  to: number;
  setPage: (n: number) => void;
  setPageSize: (n: number) => void;
}

export interface PageState<T> extends Pager {
  items: T[];
  page: number;
}

/**
 * Pages through a list that is already in memory (filtered and sorted by the screen). `resetKey` is anything that should
 * send the reader back to page 1 when it changes: the filters, the search, the sort. The chosen page size is remembered.
 */
export function usePagination<T>(all: T[], resetKey: unknown = '', initialSize = 25): PageState<T> {
  const [pageSize, setSize] = useState(initialSize);
  const [page, setPageRaw] = useState(1);
  useEffect(() => setSize(readSize(initialSize)), [initialSize]);
  const key = JSON.stringify(resetKey);
  useEffect(() => setPageRaw(1), [key]);

  const total = all.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  // A list that shrinks (a patient is removed, a poll returns fewer rows) never leaves the reader on a page that no longer exists.
  const current = Math.min(page, totalPages);
  const items = useMemo(() => all.slice((current - 1) * pageSize, current * pageSize), [all, current, pageSize]);

  return {
    items,
    page: current,
    pageSize,
    total,
    totalPages,
    from: total === 0 ? 0 : (current - 1) * pageSize + 1,
    to: Math.min(current * pageSize, total),
    setPage: (n) => setPageRaw(Math.min(Math.max(1, n), totalPages)),
    setPageSize: (n) => {
      setSize(n);
      setPageRaw(1);
      rememberPageSize(n);
    },
  };
}

/** The page numbers to show: the first, the last, and those near the current one, with gaps as null. */
export function pageWindow(page: number, totalPages: number): Array<number | null> {
  const wanted = new Set([1, totalPages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= totalPages));
  const sorted = [...wanted].sort((a, b) => a - b);
  const out: Array<number | null> = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) out.push(null);
    out.push(n);
  });
  return out;
}

/** The bar under a table: which rows are showing, the page size, and the page buttons. Hidden when everything fits on one page. */
export function Pagination({ state, className = '' }: { state: Pager; className?: string }) {
  const { t } = useI18n();
  // Shown whenever there is something listed, so the page size can always be chosen; the page buttons appear once there is more than one page.
  if (state.total === 0) return null;
  const btn = 'min-w-8 h-8 px-2 rounded-md text-xs font-medium border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <nav aria-label={t('Pages')} className={`flex flex-wrap items-center justify-between gap-3 px-1 py-3 text-xs text-gray-500 ${className}`}>
      <div className="flex items-center gap-3">
        <span>{t('Showing {from}–{to} of {total}', { from: state.from, to: state.to, total: state.total })}</span>
        <label className="flex items-center gap-1.5">
          <span className="sr-only">{t('Rows per page')}</span>
          <select value={state.pageSize} onChange={(e) => state.setPageSize(Number(e.target.value))} className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500">
            {SIZES.map((n) => <option key={n} value={n}>{t('{n} per page', { n })}</option>)}
          </select>
        </label>
      </div>
      {state.totalPages > 1 && (
      <div className="flex items-center gap-1">
        <button type="button" className={btn} disabled={state.page <= 1} onClick={() => state.setPage(state.page - 1)} aria-label={t('Previous page')}>‹</button>
        {pageWindow(state.page, state.totalPages).map((n, i) =>
          n === null ? (
            <span key={`gap-${i}`} className="px-1 text-gray-400">…</span>
          ) : (
            <button key={n} type="button" onClick={() => state.setPage(n)} aria-current={n === state.page ? 'page' : undefined} className={`${btn} ${n === state.page ? '!bg-gray-900 !text-white !border-gray-900' : ''}`}>{n}</button>
          ),
        )}
        <button type="button" className={btn} disabled={state.page >= state.totalPages} onClick={() => state.setPage(state.page + 1)} aria-label={t('Next page')}>›</button>
      </div>
      )}
    </nav>
  );
}
