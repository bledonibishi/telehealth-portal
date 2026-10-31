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
import Link from 'next/link';
import { Card, btnPrimary } from '@/components/portal/Card';
import { Icon, type IconName } from '@/components/portal/Icon';
import { PageHeader } from '@/components/portal/PageHeader';
import { useI18n } from '@/lib/i18n/I18nProvider';

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

const DOMAIN_ICON: Record<string, IconName> = { somatic: 'heart', psychological: 'user', urogenital: 'shield', sexual: 'heart' };

/** First visit: what the questionnaire covers, how long it takes, and a way in. */
function Welcome({ scale, onStart }: { scale: SymptomScale; onStart: () => void }) {
  return (
    <Card className="sm:p-8">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-50 px-3 py-1 text-xs font-semibold text-ink-800"><Icon name="chart" className="w-3.5 h-3.5" /> Your first symptom check</span>
      <h2 className="mt-4 text-2xl font-bold text-ink-900">How are you feeling?</h2>
      <p className="mt-2 max-w-xl text-slate-600">
        Answer {scale.items.length} short questions about how your symptoms have been lately. Doing it once a month shows you and your doctor how your treatment is working.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {scale.domains.map((d) => {
          const items = scale.items.filter((i) => i.domain === d.id);
          return (
            <div key={d.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2">
                <span className="flex w-8 h-8 items-center justify-center rounded-full bg-ink-50 text-ink-700"><Icon name={DOMAIN_ICON[d.id] ?? 'heart'} className="w-4 h-4" /></span>
                <span className="text-sm font-semibold text-ink-900">{d.label}</span>
              </div>
              <p className="mt-2 text-xs text-slate-500">{items.map((i) => i.text.split(' (')[0]).join(', ')}</p>
            </div>
          );
        })}
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button type="button" onClick={onStart} className={`${btnPrimary} px-6`}>Start symptom check <Icon name="arrow" className="w-4 h-4" /></button>
        <span className="flex items-center gap-1.5 text-sm text-slate-500"><Icon name="clock" className="w-4 h-4" /> About 2 minutes</span>
      </div>
    </Card>
  );
}

export default function SymptomsPage() {
  const { t } = useI18n();
  const scaleQuery = useQuery(MY_SYMPTOM_SCALE);
  const historyQuery = useQuery(MY_SYMPTOM_ASSESSMENTS, { fetchPolicy: 'cache-and-network' });
  const [editing, setEditing] = useState(false);

  const scale: SymptomScale | null = scaleQuery.data?.mySymptomScale ?? null;
  const history: SymptomAssessment[] = historyQuery.data?.mySymptomAssessments ?? [];
  const latest = history[history.length - 1] ?? null;
  const first = history.length > 1 ? history[0] : null;
  const nextDue = latest ? new Date(new Date(latest.recordedAt).getTime() + DUE_AFTER_DAYS * DAY) : null;
  const due = !nextDue || nextDue.getTime() < Date.now();
  const loading = scaleQuery.loading || (historyQuery.loading && !historyQuery.data);
  const error = scaleQuery.error ?? historyQuery.error;
  const better = first && latest ? latest.totalScore <= first.totalScore : true;

  return (
    <div className="px-4 sm:px-6 lg:px-8 pb-8 max-w-5xl">
      <PageHeader title="Symptoms" subtitle="Track how your symptoms change on treatment. Your doctor sees this too." />

      {loading && <LoadingState variant="inline" label="Loading…" />}
      <InlineError error={error} />
      {!loading && !error && !scale && (
        <Card className="p-8 text-center text-sm text-slate-500">Symptom tracking is part of our hormone programmes.</Card>
      )}

      {scale && !loading && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] items-start">
          <div className="space-y-6 min-w-0">
            {editing ? (
              <SymptomForm scale={scale} previous={latest} onDone={() => setEditing(false)} />
            ) : !latest ? (
              <Welcome scale={scale} onStart={() => setEditing(true)} />
            ) : (
              <>
                <Card className="sm:p-7" labelledBy="latest-title">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p id="latest-title" className="text-xs font-semibold uppercase tracking-wide text-slate-500">Your symptoms now</p>
                      <p className="mt-1 text-3xl font-bold text-ink-900">{latest.severity}</p>
                      <p className="mt-1 text-sm text-slate-500">Score {latest.totalScore} of {latest.maxScore} · {format(new Date(latest.recordedAt), 'd MMMM yyyy')}</p>
                    </div>
                    {first && (
                      <div className={`rounded-xl px-4 py-3 text-right ${better ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>
                        <p className="text-2xl font-bold">{latest.totalScore === first.totalScore ? '±0' : `${better ? '↓' : '↑'} ${Math.abs(latest.totalScore - first.totalScore)}`}</p>
                        <p className="text-xs">since {format(new Date(first.recordedAt), 'd MMM yyyy')}</p>
                      </div>
                    )}
                  </div>
                  <div className="mt-6"><DomainBars latest={latest} first={first} /></div>
                </Card>

                {history.length > 1 ? (
                  <Card className="sm:p-7" labelledBy="trend-title">
                    <h2 id="trend-title" className="text-base font-semibold text-ink-900">Over time</h2>
                    <p className="mt-0.5 mb-4 text-sm text-slate-500">Lower is better.</p>
                    <SymptomChart assessments={history} />
                  </Card>
                ) : (
                  <Card className="sm:p-7 flex items-center gap-4">
                    <span className="flex w-11 h-11 flex-shrink-0 items-center justify-center rounded-full bg-ink-50 text-ink-700"><Icon name="chart" className="w-5 h-5" /></span>
                    <p className="text-sm text-slate-600">Your chart appears after your next symptom check, so you can see how your symptoms change.</p>
                  </Card>
                )}
              </>
            )}
          </div>

          <aside className="space-y-5 lg:sticky lg:top-6">
            {latest && !editing && (
              <div className={`rounded-2xl p-5 ${due ? 'bg-ink-800 text-white' : 'bg-white border border-slate-200/80'}`}>
                <p className={`text-xs font-semibold uppercase tracking-wide ${due ? 'text-white/70' : 'text-slate-500'}`}>{due ? 'Time for a symptom check' : 'Next symptom check'}</p>
                <p className={`mt-1 text-lg font-semibold ${due ? '' : 'text-ink-900'}`}>
                  {due ? 'It’s been a while' : format(nextDue!, 'd MMMM')}
                </p>
                <p className={`mt-1 text-sm ${due ? 'text-white/75' : 'text-slate-500'}`}>
                  Last one {formatDistanceToNow(new Date(latest.recordedAt), { addSuffix: true })}. It takes about two minutes.
                </p>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className={`mt-4 w-full inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition-colors ${due ? 'bg-white text-ink-800 hover:bg-ink-50' : 'bg-ink-50 text-ink-800 hover:bg-ink-100'}`}
                >
                  {due ? 'Start symptom check' : 'Update now'}
                </button>
              </div>
            )}

            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-rose-900"><Icon name="alert" className="w-4 h-4 text-rose-600" /> {t('Don’t wait for your next symptom check')}</h2>
              <p className="mt-1.5 text-sm text-rose-900/80">{t('If a symptom is severe, new or worrying, message your doctor now.')}</p>
              <Link href="/messages" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-rose-800 hover:text-rose-900">{t('Message your doctor')} <Icon name="arrow" className="w-4 h-4" /></Link>
            </div>

            <Card>
              <h2 className="text-sm font-semibold text-ink-900">About this questionnaire</h2>
              <p className="mt-1.5 text-sm text-slate-500">
                It is the {scale.id === 'MRS' ? 'Menopause Rating Scale' : 'Aging Males’ Symptoms scale'}, a standard questionnaire doctors use to follow symptoms over time. Answer for how you have felt lately, not just today.
              </p>
            </Card>
          </aside>
        </div>
      )}
    </div>
  );
}
