'use client';

import { useState } from 'react';
import { useQuery } from '@apollo/client';
import { CLINICIAN_PERFORMANCE } from '@/graphql/insights';
import { useI18n } from '@/lib/i18n/I18nProvider';
import PeriodSelect, { type Period } from './PeriodSelect';
import { InlineError } from '@/components/ui/Alert';

function duration(minutes: number | null | undefined) {
  if (minutes === null || minutes === undefined) return '—';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  if (minutes < 60 * 48) return `${(minutes / 60).toFixed(1)} h`;
  return `${(minutes / 1440).toFixed(1)} d`;
}

/** What each doctor decided, prescribed and reviewed — for the admin. */
export default function DoctorPerformance() {
  const { t } = useI18n();
  const [days, setDays] = useState<Period>(30);
  const { data, loading, error } = useQuery(CLINICIAN_PERFORMANCE, { variables: { days }, pollInterval: 5 * 60_000 });
  const rows: any[] = data?.clinicianPerformance ?? [];

  const th = 'px-3 py-3 font-medium whitespace-nowrap';
  return (
    <section className="mb-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{t('Doctor performance')}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{t('Decisions are timed from the patient submitting to the doctor deciding. “Active” means they decided a case, prescribed or reviewed a check-in in the period.')}</p>
        </div>
        <PeriodSelect value={days} onChange={setDays} />
      </div>

      <InlineError error={error} className="mb-2" />
      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs text-gray-500 uppercase tracking-wide">
              <th className={th}>{t('Doctor')}</th>
              <th className={th}>{t('Status')}</th>
              <th className={`${th} text-right`}>{t('Cases decided')}</th>
              <th className={`${th} text-right`}>{t('Approval rate')}</th>
              <th className={`${th} text-right`}>{t('Avg. time to decide')}</th>
              <th className={`${th} text-right`}>{t('Prescriptions')}</th>
              <th className={`${th} text-right`}>{t('Check-ins reviewed')}</th>
              <th className={`${th} text-right`}>{t('Open cases')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.clinicianId} className="hover:bg-gray-50">
                <td className="px-3 py-3">
                  <div className="font-medium text-gray-900">{r.name}</div>
                  <div className="text-xs text-gray-400">
                    {r.email}
                    {!r.isVerified && <span className="ml-2 text-amber-700">{t('Unverified')}</span>}
                  </div>
                </td>
                <td className="px-3 py-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${r.status === 'ACTIVE' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {r.status === 'ACTIVE' ? t('Active') : t('Inactive')}
                  </span>
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {r.casesDecided}
                  {r.casesDecided > 0 && <span className="block text-xs text-gray-400">{t('{a} approved · {d} declined', { a: r.approved, d: r.declined })}</span>}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{r.approvalRate === null || r.approvalRate === undefined ? '—' : `${r.approvalRate}%`}</td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {duration(r.avgDecisionMinutes)}
                  {r.medianDecisionMinutes !== null && r.medianDecisionMinutes !== undefined && <span className="block text-xs text-gray-400">{t('median {value}', { value: duration(r.medianDecisionMinutes) })}</span>}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{r.prescriptionsIssued}</td>
                <td className="px-3 py-3 text-right tabular-nums">{r.checkInsReviewed}</td>
                <td className="px-3 py-3 text-right tabular-nums">{r.openCases}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">{t('No doctors to show yet.')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
