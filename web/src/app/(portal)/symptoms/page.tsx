'use client';

import { useState } from 'react';
import { useQuery } from '@apollo/client';
import { format, formatDistanceToNow } from 'date-fns';
import { MY_SYMPTOM_ASSESSMENTS, MY_SYMPTOM_SCALE } from '@/graphql/symptoms';
import { SymptomForm } from '@/components/symptoms/SymptomForm';
import { SymptomChart } from '@/components/symptoms/SymptomChart';
import { burden, type SymptomAssessment, type SymptomScale } from '@/components/symptoms/types';
import { InlineError } from '@/components/common/Alert';
import { LoadingState } from '@telehealth/loading';

const DAY = 86_400_000;
// Suggest a new entry roughly monthly, in step with the check-ins.
const DUE_AFTER_DAYS = 28;

function DomainBars({ latest, first }: { latest: SymptomAssessment; first: SymptomAssessment | null }) {
  return (
    <div className="space-y-4">
      {latest.domainScores.map((d) => {
        const before = first?.domainScores.find((x) => x.domain === d.domain);
        const pct = Math.round(burden(d.score, d.min, d.max) * 100);
        const change = before ? d.score - before.score : 0;
        return (
          <div key={d.domain}>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-slate-700">{d.label}</span>
              <span className="text-xs text-slate-400">
                {d.score - d.min} of {d.max - d.min}
                {before && change !== 0 && (
                  <span className={change < 0 ? 'text-ink-800 ml-2' : 'text-danger-500 ml-2'}>
                    {change < 0 ? '↓' : '↑'} {Math.abs(change)} since first
                  </span>
                )}
              </span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full mt-1.5 overflow-hidden">
              <div className="h-full bg-ink-500 rounded-full" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function SymptomsPage() {
  const scaleQuery = useQuery(MY_SYMPTOM_SCALE);
  const historyQuery = useQuery(MY_SYMPTOM_ASSESSMENTS, { fetchPolicy: 'cache-and-network' });
  const [editing, setEditing] = useState(false);

  const scale: SymptomScale | null = scaleQuery.data?.mySymptomScale ?? null;
  const history: SymptomAssessment[] = historyQuery.data?.mySymptomAssessments ?? [];
  const latest = history[history.length - 1] ?? null;
  const first = history.length > 1 ? history[0] : null;
  const due = !latest || Date.now() - new Date(latest.recordedAt).getTime() > DUE_AFTER_DAYS * DAY;
  const loading = scaleQuery.loading || (historyQuery.loading && !historyQuery.data);
  const error = scaleQuery.error ?? historyQuery.error;

  return (
    <div className="px-4 sm:px-6 lg:px-8 pb-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-ink-900 -mt-1 mb-0.5">Symptoms</h1>
      <p className="text-sm text-slate-500 mb-5">Track how your symptoms change on treatment. Your clinician sees this too.</p>

      {loading && <LoadingState variant="inline" label="Loading…" />}
      <InlineError error={error} />
      {!loading && !error && !scale && (
        <div className="bg-white rounded-lg border border-slate-100 p-8 text-center text-sm text-slate-500">
          Symptom tracking is part of our hormone programmes.
        </div>
      )}

      {scale && !loading && (
        <>
          {editing ? (
            <SymptomForm scale={scale} previous={latest} onDone={() => setEditing(false)} />
          ) : (
            <div className="bg-white rounded-lg border border-slate-100 p-5 mb-6 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-ink-800 uppercase tracking-wide">{due ? 'Time for an update' : 'Up to date'}</p>
                <p className="text-sm text-slate-600 mt-1">
                  {latest
                    ? `Last updated ${formatDistanceToNow(new Date(latest.recordedAt), { addSuffix: true })}. It takes about two minutes.`
                    : 'Start with how you feel today, so we have something to compare against.'}
                </p>
              </div>
              <button onClick={() => setEditing(true)} className="flex-shrink-0 bg-ink-700 hover:bg-ink-800 text-white text-sm font-semibold px-4 py-2.5 rounded-md">
                {latest ? 'Update' : 'Start'}
              </button>
            </div>
          )}

          {latest && (
            <>
              <section className="bg-white rounded-lg border border-slate-100 p-5 sm:p-6 mb-6" aria-label="Latest score">
                <div className="flex items-baseline justify-between mb-5">
                  <div>
                    <p className="text-xs font-semibold text-ink-800 uppercase tracking-wide">Latest</p>
                    <p className="text-3xl font-bold text-slate-900 mt-1">
                      {latest.severity}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Score {latest.totalScore} ({latest.minScore}–{latest.maxScore}) · {format(new Date(latest.recordedAt), 'd MMMM yyyy')}
                    </p>
                  </div>
                  {first && (
                    <p className="text-sm text-right">
                      <span className={latest.totalScore <= first.totalScore ? 'text-ink-800 font-semibold' : 'text-danger-500 font-semibold'}>
                        {latest.totalScore <= first.totalScore ? '↓' : '↑'} {Math.abs(latest.totalScore - first.totalScore)}
                      </span>
                      <span className="block text-xs text-slate-400">since {format(new Date(first.recordedAt), 'd MMM')}</span>
                    </p>
                  )}
                </div>
                <DomainBars latest={latest} first={first} />
              </section>

              {history.length > 1 && (
                <section className="bg-white rounded-lg border border-slate-100 p-5 sm:p-6 mb-6" aria-label="Over time">
                  <h2 className="text-xs font-semibold text-ink-800 uppercase tracking-wide mb-4">Over time</h2>
                  <SymptomChart assessments={history} />
                </section>
              )}
            </>
          )}

          <p className="text-xs text-slate-400">
            This is a standard questionnaire ({scale.id === 'MRS' ? 'Menopause Rating Scale' : 'Aging Males’ Symptoms scale'}) to help you and your clinician see
            trends. If a symptom is severe or worrying, message your clinician rather than waiting for your next update.
          </p>
        </>
      )}
    </div>
  );
}
