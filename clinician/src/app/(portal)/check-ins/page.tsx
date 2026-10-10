'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import Link from 'next/link';
import { CHECK_IN_REVIEW_QUEUE, PATIENT_TRENDS, REVIEW_CHECK_IN, SIDE_EFFECT_SUMMARY } from '@/graphql/checkins';
import { PATIENT_HISTORY } from '@/graphql/consultations';
import { GET_ORDERS } from '@/graphql/orders';
import { PrescriptionForm, PrescriptionSubmission, Row } from '@/components/consultation/PrescriptionForm';
import { PrescriptionCard } from '@/components/consultation/PrescriptionCard';
import { MissedDoseAlerts } from '@/components/checkins/MissedDoseAlerts';
import { SideEffectAlerts } from '@/components/checkins/SideEffectAlerts';
import SideEffectSummary from '@/components/checkins/SideEffectSummary';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { InlineError } from '@/components/ui/Alert';
import { LoadingState, SkeletonList } from '@telehealth/loading';

type Outcome = 'REPEAT' | 'NEW_PRESCRIPTION' | 'HOLD' | 'STOP';

const OUTCOMES: { key: Outcome; label: string; hint: string; cls: string }[] = [
  { key: 'REPEAT', label: 'Send repeat', hint: 'Same medicine and dose, from the remaining repeats', cls: 'bg-green-600 hover:bg-green-700' },
  { key: 'NEW_PRESCRIPTION', label: 'New prescription', hint: 'Change or step up the dose, or renew', cls: 'bg-brand-500 hover:bg-brand-900' },
  { key: 'HOLD', label: 'Hold this month', hint: 'No supply; billing paused', cls: 'bg-warn-500 hover:bg-warn-900' },
  { key: 'STOP', label: 'Stop treatment', hint: 'Cancels the prescription; subscription ends at period end', cls: 'bg-danger-500 hover:bg-danger-900' },
];

const inputCls = 'w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';

// Weight over time: intake, then each check-in — the main efficacy signal for GLP-1.
function WeightTrend({ patientId }: { patientId: string }) {
  const { t, fmt } = useI18n();
  const { data } = useQuery(PATIENT_TRENDS, { variables: { id: patientId } });
  const p = data?.patient;
  if (!p) return null;
  const points: { at: string; kg: number }[] = [];
  for (const c of p.consultations ?? []) {
    const w = c.quizAnswers?.find((a: any) => a.questionId === 'weight_kg');
    if (w?.value) points.push({ at: c.submittedAt, kg: Number(w.value) });
  }
  for (const ci of p.checkIns ?? []) {
    const w = ci.answers?.find((a: any) => a.questionId === 'weight_kg');
    if (ci.completedAt && w?.value) points.push({ at: ci.completedAt, kg: Number(w.value) });
  }
  points.sort((a, b) => a.at.localeCompare(b.at));
  if (points.length < 2) return null;
  const change = points[points.length - 1].kg - points[0].kg;
  const pct = (change / points[0].kg) * 100;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('Weight')}</h3>
      <p className="text-sm text-gray-900">
        {points.map((pt) => `${pt.kg}`).join(' → ')} kg
      </p>
      <p className={`text-xs mt-1 ${change <= 0 ? 'text-green-700' : 'text-danger-500'}`}>
        {change <= 0 ? '' : '+'}{change.toFixed(1)} kg ({pct.toFixed(1)}%) {t('since {date}', { date: fmt(points[0].at, 'dd MMM yyyy') })}
      </p>
    </div>
  );
}

function ReviewPanel({ checkIn, onDone }: { checkIn: any; onDone: () => void }) {
  const { t } = useI18n();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<unknown>(null);
  const rx = checkIn.prescription;
  // Fresh every time, so a score logged a minute ago is never missed. Approving waits on this.
  const { data: seData, loading: seLoading, error: seError } = useQuery(SIDE_EFFECT_SUMMARY, { variables: { patientId: checkIn.patient.id }, fetchPolicy: 'network-only' });
  const sideEffects = seData?.sideEffectSummary;
  const [seReviewed, setSeReviewed] = useState(false);
  const approving = outcome === 'REPEAT' || outcome === 'NEW_PRESCRIPTION';
  // A failed load must not strand the doctor, so only a loaded summary that flags something (or a load still under way) holds approval back.
  const holdForSideEffects = approving && !seError && (seLoading || (!!sideEffects?.needsAttention && !seReviewed));

  const { data: history } = useQuery(PATIENT_HISTORY, { variables: { patientId: checkIn.patient.id } });
  // The prescribing rules run against the patient's consultation for this programme.
  const consultationId = history?.patientHistory?.find((c: any) => c.kind === checkIn.kind)?.id;

  const [review, { loading }] = useMutation(REVIEW_CHECK_IN, {
    refetchQueries: [{ query: CHECK_IN_REVIEW_QUEUE }, { query: GET_ORDERS }],
    onCompleted: onDone,
    onError: (e) => setError(e),
  });

  const submit = (extra: Partial<PrescriptionSubmission> = {}) => {
    setError(null);
    review({
      variables: {
        input: {
          checkInId: checkIn.id,
          outcome,
          note: note.trim() || undefined,
          messageToPatient: message.trim() || undefined,
          // The server refuses an approval without this when the summary flags something.
          sideEffectsReviewed: seReviewed || undefined,
          ...extra,
        },
      },
    });
  };

  const currentItems: Row[] = (rx?.items ?? []).map((i: any) => ({
    productId: i.product.id,
    strengthId: i.strength.id,
    quantity: i.quantity,
    directions: i.directions,
  }));
  const repeatAvailable = rx?.status === 'ACTIVE' && (rx?.repeatsRemaining ?? 0) > 0;

  return (
    <div className="space-y-4">
    {sideEffects && <SideEffectSummary summary={sideEffects} />}
    {seError && <p className="text-xs text-warn-900 bg-warn-50 rounded px-3 py-2">{t('Could not load the side-effect summary. Check the patient’s record before approving.')}</p>}
    <div className="border border-gray-200 rounded-lg p-4 space-y-4 bg-white">
      <h3 className="text-sm font-semibold text-gray-900">{t('Decision')}</h3>

      <div className="grid grid-cols-2 gap-2">
        {OUTCOMES.map((o) => {
          const disabled = o.key === 'REPEAT' && !repeatAvailable;
          return (
            <button
              key={o.key}
              onClick={() => setOutcome(o.key)}
              disabled={disabled}
              className={`text-left rounded px-3 py-2 text-white disabled:opacity-40 ${o.cls} ${outcome === o.key ? 'ring-2 ring-offset-2 ring-gray-400' : ''}`}
            >
              <span className="block text-sm font-medium">{t(o.label)}</span>
              <span className="block text-xs opacity-90">{disabled ? t('No repeats left — issue a new prescription') : t(o.hint)}</span>
            </button>
          );
        })}
      </div>

      {outcome && (
        <>
          <label className="block">
            <span className="block text-xs font-medium text-gray-700 mb-1">{t('Clinical note (internal)')}</span>
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-gray-700 mb-1">{t('Message to the patient (optional)')}</span>
            <textarea rows={2} value={message} onChange={(e) => setMessage(e.target.value)} className={inputCls} />
          </label>
        </>
      )}

      <InlineError error={error} />

      {holdForSideEffects && (
        <div className="rounded border border-danger-500/40 bg-danger-50/60 p-3">
          {seLoading ? (
            <LoadingState variant="inline" label={t('Loading the side-effect summary…')} />
          ) : (
            <label className="flex items-start gap-2 text-sm text-gray-900 cursor-pointer">
              <input type="checkbox" checked={seReviewed} onChange={(e) => setSeReviewed(e.target.checked)} className="mt-0.5" />
              <span>{t('I have read the side effects above and they do not stop me approving.')}</span>
            </label>
          )}
        </div>
      )}

      {outcome === 'NEW_PRESCRIPTION' && !holdForSideEffects && (
        consultationId ? (
          <PrescriptionForm
            consultationId={consultationId}
            kind={checkIn.kind}
            submitting={loading}
            submitLabel={t('Issue new prescription')}
            initialItems={currentItems}
            stepUp={checkIn.kind === 'GLP1'}
            onCancel={() => setOutcome(null)}
            onSubmit={(rxInput) => submit(rxInput)}
          />
        ) : (
          <LoadingState variant="inline" label={t('Loading the patient’s consultation…')} />
        )
      )}

      {outcome && outcome !== 'NEW_PRESCRIPTION' && !holdForSideEffects && (
        <div className="flex gap-2">
          <button onClick={() => submit()} disabled={loading} className="bg-gray-900 text-white rounded px-4 py-2 text-sm font-medium disabled:opacity-50">
            {loading ? 'Saving…' : `Confirm: ${OUTCOMES.find((o) => o.key === outcome)!.label.toLowerCase()}`}
          </button>
          <button onClick={() => setOutcome(null)} className="text-sm text-gray-500 px-4 py-2">{t('Cancel')}</button>
        </div>
      )}
    </div>
    </div>
  );
}

export default function CheckInsPage() {
  const { t, timeAgo, fmt } = useI18n();
  const { data, loading, error } = useQuery(CHECK_IN_REVIEW_QUEUE, { pollInterval: 60_000 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const queue: any[] = data?.checkInReviewQueue ?? [];
  const selected = queue.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="flex h-screen overflow-hidden">
      <div className={`${selected ? 'hidden lg:flex' : 'flex'} w-full lg:w-96 border-r border-gray-200 flex-col bg-white shrink-0`}>
        <div className="px-5 py-4 border-b border-gray-200">
          <h1 className="text-lg font-semibold text-gray-900">{t('Check-ins')}</h1>
          <p className="text-xs text-gray-500 mt-0.5">{t('{n} waiting for review', { n: queue.length })}</p>
        </div>
        <SideEffectAlerts />
        <MissedDoseAlerts />
        {loading && <div className="p-5"><SkeletonList rows={4} label={t('Loading…')} /></div>}
        <InlineError error={error} className="p-5" />
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {queue.map((c) => {
            const critical = c.redFlags.some((f: any) => f.severity === 'CRITICAL');
            return (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={`w-full text-left px-5 py-3 hover:bg-gray-50 ${selectedId === c.id ? 'bg-gray-50' : ''} ${critical ? 'border-l-4 border-danger-500' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900">{c.patient.firstName} {c.patient.lastName}</span>
                  <span className="text-xs text-gray-500">{c.kind}</span>
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {t('Completed {when}', { when: timeAgo(c.completedAt) })}
                  {c.redFlags.length > 0 && (
                    <span className={critical ? 'text-danger-500 font-medium' : 'text-warn-900'}> · {c.redFlags.length === 1 ? t('1 flag') : t('{n} flags', { n: c.redFlags.length })}</span>
                  )}
                  {c.wantsToReorder === false && <span> {t('· doesn’t want to continue')}</span>}
                </div>
              </button>
            );
          })}
          {!loading && queue.length === 0 && <p className="p-8 text-center text-sm text-gray-400">{t('All check-ins reviewed.')}</p>}
        </div>
      </div>

      <div className={`${selected ? 'block' : 'hidden lg:block'} flex-1 min-w-0 overflow-y-auto bg-gray-50`}>
        {!selected ? (
          <div className="h-full flex items-center justify-center text-sm text-gray-400">{t('Select a check-in')}</div>
        ) : (
          <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
            <button type="button" onClick={() => setSelectedId(null)} className="lg:hidden text-sm font-medium text-brand-500">← {t('Check-ins')}</button>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">{selected.patient.firstName} {selected.patient.lastName}</h2>
                <p className="text-sm text-gray-500 mt-1">
                  {t('{kind} check-in · completed {date}', { kind: selected.kind, date: fmt(selected.completedAt, 'dd MMM yyyy') })}
                  {selected.questionnaireVersion && <span className="text-gray-400"> · {selected.questionnaireVersion}</span>}
                </p>
              </div>
              <Link href={`/patients?patient=${selected.patient.id}`} className="text-xs font-medium text-brand-500 hover:underline">
                {t('Patient record →')}
              </Link>
            </div>

            {selected.redFlags.length > 0 && (
              <div className="space-y-1">
                {selected.redFlags.map((f: any) => (
                  <p
                    key={f.description}
                    className={`text-sm rounded px-3 py-2 ${f.severity === 'CRITICAL' ? 'bg-danger-50 text-danger-500 font-medium' : 'bg-warn-50 text-warn-900'}`}
                  >
                    {f.severity === 'CRITICAL' ? `${t('Critical')}: ` : `${t('Warning')}: `}{f.description}
                  </p>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <div className="xl:col-span-2 space-y-6 min-w-0">
                <section className="bg-white rounded-lg border border-gray-200">
                  <div className="px-4 py-3 border-b border-gray-200">
                    <h3 className="text-sm font-semibold text-gray-900">{t('Answers')}</h3>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {(selected.answers ?? []).map((a: any) => (
                      <div key={a.questionId} className="px-4 py-3">
                        <p className="text-xs text-gray-500">{a.question}</p>
                        <p className="text-sm text-gray-900 mt-1 whitespace-pre-wrap">{a.answer}</p>
                      </div>
                    ))}
                    <div className="px-4 py-3">
                      <p className="text-xs text-gray-500">{t('Wants to continue next month?')}</p>
                      <p className="text-sm text-gray-900 mt-1">{selected.wantsToReorder ? 'Yes' : 'No'}</p>
                    </div>
                  </div>
                </section>

                <ReviewPanel key={selected.id} checkIn={selected} onDone={() => setSelectedId(null)} />
              </div>

              <aside className="space-y-4">
                <WeightTrend patientId={selected.patient.id} />
                {selected.prescription ? (
                  <PrescriptionCard prescription={selected.prescription} patientId={selected.patient.id} />
                ) : (
                  <p className="text-xs text-gray-500 bg-white rounded-lg border border-gray-200 p-4">{t('No active prescription on file.')}</p>
                )}
              </aside>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
