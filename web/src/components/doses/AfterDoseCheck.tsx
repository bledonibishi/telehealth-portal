'use client';

import { useState } from 'react';
import { useMutation } from '@apollo/client';
import { differenceInHours, format } from 'date-fns';
import { LOG_DOSE_FEELING, MY_DOSE_CALENDAR } from '@/graphql/dosing';
import { FEELINGS } from '@/lib/weight';
import { ReportSideEffectDialog } from './ReportSideEffectDialog';
import { InlineError } from '@/components/common/Alert';

/** Ask about the most recent dose once about a day has passed, until they answer or it is a week old. */
export const ASK_AFTER_HOURS = 20;
export const ASK_UNTIL_HOURS = 7 * 24;

export function doseToAskAbout<T extends { status: string; takenAt?: string | null; feelingAfter?: string | null }>(doses: T[], now = new Date()): T | null {
  return doses
    .filter((d) => d.status === 'TAKEN' && d.takenAt && !d.feelingAfter)
    .filter((d) => { const h = differenceInHours(now, new Date(d.takenAt!)); return h >= ASK_AFTER_HOURS && h < ASK_UNTIL_HOURS; })
    .sort((a, b) => b.takenAt!.localeCompare(a.takenAt!))[0] ?? null;
}

/** "How are you feeling after your injection?" — the answer goes to the doctor with the dose it belongs to. */
export function AfterDoseCheck({ dose, doseName }: { dose: { id: string; takenAt: string }; doseName: string }) {
  const [reporting, setReporting] = useState(false);
  const [answered, setAnswered] = useState<string | null>(null);
  const [save, { loading, error }] = useMutation(LOG_DOSE_FEELING, { refetchQueries: [{ query: MY_DOSE_CALENDAR, variables: { fromDays: 60, toDays: 90 } }] });

  const answer = async (feeling: string) => {
    try {
      await save({ variables: { id: dose.id, feeling } });
      setAnswered(feeling);
    } catch { /* shown from `error` */ }
  };
  const rough = answered === 'DIFFICULTIES' || answered === 'NOT_WELL';

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 mb-6" role="region" aria-label="How you felt after your injection">
      {answered ? (
        <div role="status">
          <p className="text-sm font-semibold text-slate-900">Thanks — your doctor can see this.</p>
          {rough && (
            <>
              <p className="text-sm text-slate-600 mt-1">Sorry you’re not feeling great. Tell your doctor what you’re feeling so they can help.</p>
              <button type="button" onClick={() => setReporting(true)} className="mt-3 text-sm font-semibold text-brand-600 hover:text-brand-700">Report a side effect →</button>
            </>
          )}
        </div>
      ) : (
        <>
          <p className="text-sm font-semibold text-slate-900">How are you feeling after your injection?</p>
          <p className="text-xs text-slate-500 mt-0.5">{doseName}, taken {format(new Date(dose.takenAt), 'EEE d MMM, HH:mm')}. It helps your doctor decide on your next dose.</p>
          <div className="flex flex-wrap gap-2 mt-3">
            {FEELINGS.map((f) => (
              <button key={f.value} type="button" disabled={loading} onClick={() => answer(f.value)}
                className="text-sm rounded-full border border-slate-200 px-3 py-1.5 text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                <span aria-hidden>{f.emoji}</span> {f.label}
              </button>
            ))}
          </div>
          <InlineError error={error} size="xs" className="mt-2" />
        </>
      )}
      {reporting && <ReportSideEffectDialog onClose={() => setReporting(false)} />}
    </div>
  );
}
