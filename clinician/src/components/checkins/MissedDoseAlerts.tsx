'use client';

import Link from 'next/link';
import { useQuery } from '@apollo/client';
import { MISSED_DOSE_ALERTS } from '@/graphql/checkins';
import { useI18n } from '@/lib/i18n/I18nProvider';

type Alert = {
  patientId: string;
  patientName: string;
  productName: string;
  strengthLabel: string;
  titrationStep: number;
  missedInARow: number;
  missedSince: string;
  lastTakenAt?: string | null;
};

/**
 * GLP-1 patients on a stepped-up dose who haven't taken their last few doses. Going straight back
 * to the same dose risks severe side effects, so each needs a decision: continue, or restart lower.
 * An entry clears itself once the patient logs a dose or a new prescription is issued.
 */
export function MissedDoseAlerts() {
  const { t, timeAgo, fmt } = useI18n();
  const { data } = useQuery(MISSED_DOSE_ALERTS, { pollInterval: 5 * 60_000 });
  const alerts: Alert[] = data?.missedDoseAlerts ?? [];
  if (alerts.length === 0) return null;

  return (
    <div className="border-b border-gray-200 bg-amber-50/60">
      <div className="px-5 pt-3 pb-1">
        <p className="text-xs font-semibold text-amber-900 uppercase tracking-wide">{t('Missed doses')} · {alerts.length}</p>
        <p className="text-xs text-amber-900/70 mt-0.5">{t('Consider restarting at a lower dose before they continue.')}</p>
      </div>
      <ul className="divide-y divide-amber-100">
        {alerts.map((a) => (
          <li key={a.patientId}>
            <Link href={`/patients?patient=${a.patientId}`} className="block px-5 py-2.5 hover:bg-amber-50">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900">{a.patientName}</span>
                <span className="text-xs font-semibold text-amber-900">{t('{n} in a row', { n: a.missedInARow })}</span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {a.productName} {a.strengthLabel} ({t('step {n}', { n: a.titrationStep })}) · {t('since {date}', { date: fmt(a.missedSince, 'd MMM') })}
                {a.lastTakenAt ? ` · ${t('last taken {when}', { when: timeAgo(a.lastTakenAt) })}` : ''}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
