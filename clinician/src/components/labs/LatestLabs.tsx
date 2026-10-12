'use client';

import { useQuery } from '@apollo/client';
import { PATIENT_LAB_RESULTS } from '@/graphql/labs';
import { KIND_LABEL, groupResults, type LabResult } from './labs-format';
import { useI18n } from '@/lib/i18n/I18nProvider';

/** The patient's newest result for each test, for a doctor deciding on a supply: what it was, whether it was out of range, and how old it is. */
export default function LatestLabs({ patientId }: { patientId: string }) {
  const { t, fmt, timeAgo } = useI18n();
  const { data, loading } = useQuery(PATIENT_LAB_RESULTS, { variables: { patientId } });
  const results: LabResult[] = data?.patientLabResults ?? [];
  if (loading) return null;
  const series = groupResults(results);

  return (
    <section className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('Latest lab results')}</h3>
      {series.length === 0 ? (
        <p className="text-xs text-gray-400">{t('No lab results recorded yet.')}</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {series.map((s) => {
            const r = s.latest;
            return (
              <li key={s.key} className="py-2 flex items-start justify-between gap-3 text-sm">
                <div>
                  <p className="text-gray-700">{s.kind === 'OTHER' ? s.name : t(KIND_LABEL[s.kind] ?? s.kind)}</p>
                  <p className="text-xs text-gray-400">{fmt(r.collectedAt, 'd MMM yyyy')} · {timeAgo(r.collectedAt)}</p>
                </div>
                <div className="text-right">
                  <p className={r.flagged ? 'font-semibold text-danger-500' : 'font-medium text-gray-900'}>{r.value} {r.unit}</p>
                  {r.flagged && <p className={`text-xs ${r.reviewedAt ? 'text-green-700' : 'text-danger-500'}`}>{r.reviewedAt ? t('Reviewed') : t('Out of range')}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
