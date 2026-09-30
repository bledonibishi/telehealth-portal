'use client';

import Link from 'next/link';
import { useMutation, useQuery } from '@apollo/client';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { useState } from 'react';
import { FLAGGED_LAB_RESULT_QUEUE, REVIEW_LAB_RESULT, TRT_MONITORING_QUEUE } from '@/graphql/labs';
import { KIND_LABEL, type TrtMonitoring } from '@/components/labs/labs-format';

function ReviewButton({ id }: { id: string }) {
  const { t } = useI18n();
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(false);
  const [review, { loading, error }] = useMutation(REVIEW_LAB_RESULT, { refetchQueries: [{ query: FLAGGED_LAB_RESULT_QUEUE }] });
  if (!open) return <button onClick={() => setOpen(true)} className="text-xs font-medium text-brand-500 hover:text-brand-900">{t('Review')}</button>;
  return (
    <div className="flex gap-2 items-center">
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('Note (optional)')} className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-48" />
      <button disabled={loading} onClick={() => review({ variables: { input: { labResultId: id, reviewNote: note.trim() || undefined } } })} className="text-xs font-medium text-white bg-brand-500 rounded-lg px-2.5 py-1 disabled:opacity-50">
        {t('Done')}
      </button>
      {error && <span className="text-xs text-danger-500">{error.message}</span>}
    </div>
  );
}

export default function LabsPage() {
  const { t, fmt } = useI18n();
  const { data: trtData, loading: trtLoading } = useQuery(TRT_MONITORING_QUEUE, { pollInterval: 5 * 60_000 });
  const { data: flaggedData, loading: flaggedLoading } = useQuery(FLAGGED_LAB_RESULT_QUEUE, { pollInterval: 60_000 });
  const trt: { patientName: string; monitoring: TrtMonitoring }[] = trtData?.trtMonitoringQueue ?? [];
  const flagged: any[] = flaggedData?.flaggedLabResultQueue ?? [];

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-5xl">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{t('Labs')}</h1>
        <p className="text-sm text-gray-400 mt-0.5">{t('Blood tests that need attention. Enter new results from the patient’s Labs tab.')}</p>
      </div>

      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t('Testosterone monitoring')} · {trt.length}</h2>
        {trtLoading && <p className="text-sm text-gray-400">{t('Loading…')}</p>}
        {!trtLoading && trt.length === 0 && <p className="text-sm text-gray-400">{t('Every patient on testosterone is up to date.')}</p>}
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
          {trt.map(({ patientName, monitoring: p }) => {
            const next = [...p.labs].sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
            return (
              <Link key={p.patientId} href={`/patients?patient=${p.patientId}`} className="block px-4 py-3 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900">{patientName}</span>
                  {p.refillsOnHold ? (
                    <span className="text-xs font-medium bg-danger-500 text-white px-2 py-0.5 rounded">{t('Repeats on hold')}</span>
                  ) : p.warnings.length > 0 ? (
                    <span className="text-xs font-medium bg-amber-100 text-amber-800 px-2 py-0.5 rounded">{t('Warning')}</span>
                  ) : (
                    <span className="text-xs text-gray-500">{t('{lab} due {date}', { lab: t(KIND_LABEL[next.kind]), date: fmt(next.dueAt, 'd MMM') })}</span>
                  )}
                </div>
                {[...p.holdReasons, ...p.warnings].map((r) => <p key={r} className="text-xs text-gray-500 mt-0.5">{r}</p>)}
              </Link>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t('Out-of-range results to review')} · {flagged.length}</h2>
        {flaggedLoading && <p className="text-sm text-gray-400">{t('Loading…')}</p>}
        {!flaggedLoading && flagged.length === 0 && <p className="text-sm text-gray-400">{t('Nothing waiting for review.')}</p>}
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
          {flagged.map((r) => (
            <div key={r.id} className="px-4 py-3 flex items-center justify-between gap-4">
              <div>
                <Link href={`/patients?patient=${r.patient.id}`} className="text-sm font-medium text-gray-900 hover:underline">
                  {r.patient.firstName} {r.patient.lastName}
                </Link>
                <p className="text-xs text-gray-500 mt-0.5">
                  {r.kind === 'OTHER' ? r.analyteName : t(KIND_LABEL[r.kind])} <span className="font-semibold text-danger-500">{r.value} {r.unit}</span>
                  {' '}({t('range')} {r.referenceRangeLow ?? '—'}–{r.referenceRangeHigh ?? '—'}) · {fmt(r.collectedAt, 'd MMM yyyy')}
                </p>
              </div>
              <ReviewButton id={r.id} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
