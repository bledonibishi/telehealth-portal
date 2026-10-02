'use client';

import { useI18n } from '@/lib/i18n/I18nProvider';

export const PERIODS = [7, 30, 90] as const;
export type Period = (typeof PERIODS)[number];

export default function PeriodSelect({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const { t } = useI18n();
  return (
    <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-xs" role="group" aria-label={t('Period')}>
      {PERIODS.map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          aria-pressed={value === p}
          className={`px-2.5 py-1 rounded-md font-medium transition-colors ${value === p ? 'bg-brand-500 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          {t('{n} days', { n: p })}
        </button>
      ))}
    </div>
  );
}
