'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/i18n/I18nProvider';

/** Something waiting on the team: a coloured count when there is any, quiet at zero. One line, so four fit in a row. */
export function ActionTile({ label, value, sub, href, tone }: { label: string; value: number; sub: string; href: string; tone: 'red' | 'amber' }) {
  const { t } = useI18n();
  const on = value > 0;
  const badge = !on ? 'bg-gray-100 text-gray-400' : tone === 'red' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800';
  return (
    <Link href={href} className="group flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5 transition-colors hover:border-gray-300 hover:bg-gray-50">
      <span className={`flex h-11 min-w-[2.75rem] items-center justify-center rounded-lg px-2 text-lg font-bold tabular-nums ${badge}`}>{value}</span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm font-semibold ${on ? 'text-gray-900' : 'text-gray-500'}`}>{t(label)}</span>
        <span className="block truncate text-xs text-gray-500" title={t(sub)}>{t(sub)}</span>
      </span>
      <svg viewBox="0 0 24 24" className="h-4 w-4 flex-shrink-0 text-gray-300 group-hover:text-gray-500" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="m9 6 6 6-6 6" /></svg>
    </Link>
  );
}
