'use client';

import { useQuery } from '@apollo/client';
import { SYMPTOM_SCALE_DEFINITION } from '@/graphql/symptoms';
import { useI18n } from '@/lib/i18n/I18nProvider';

type DomainScore = { domain: string; label: string; score: number; min: number; max: number };
export type SymptomAssessment = {
  id: string;
  scale: 'MRS' | 'AMS';
  recordedAt: string;
  totalScore: number;
  minScore: number;
  maxScore: number;
  severity: string;
  domainScores: DomainScore[];
  answers: { itemId: string; score: number }[];
};

const SCALE_NAME = { MRS: 'Menopause Rating Scale', AMS: 'Aging Males’ Symptoms scale' };

function Change({ now, before }: { now: number; before?: number }) {
  if (before === undefined || now === before) return null;
  return <span className={`ml-1.5 text-xs ${now < before ? 'text-green-700' : 'text-danger-500'}`}>{now < before ? '↓' : '↑'}{Math.abs(now - before)}</span>;
}

/** The patient’s self-reported symptom scores: history with changes, and the latest item-by-item answers. */
export default function SymptomsPanel({ assessments: all }: { assessments: SymptomAssessment[] }) {
  const { t, fmt } = useI18n();
  // Scores from different scales aren't comparable, so show the current (latest) one only.
  const latestScale = all[all.length - 1]?.scale;
  const assessments = all.filter((a) => a.scale === latestScale);
  const latest = assessments[assessments.length - 1];
  const { data } = useQuery(SYMPTOM_SCALE_DEFINITION, { variables: { scale: latest?.scale }, skip: !latest });
  const scale = data?.symptomScaleDefinition;

  if (!latest) {
    return (
      <div className="p-5">
        <p className="text-sm text-gray-400">{t('The patient hasn’t recorded any symptom scores yet. They can do so from “Symptoms” in their portal.')}</p>
      </div>
    );
  }

  const newestFirst = [...assessments].reverse();
  const first = assessments[0];
  const worst = scale?.options[scale.options.length - 1]?.score;

  const tone = (ratio: number) => (ratio >= 0.75 ? 'bg-danger-500' : ratio >= 0.5 ? 'bg-amber-500' : ratio > 0 ? 'bg-green-500' : 'bg-gray-200');
  const items: { id: string; text: string; domain: string }[] = scale?.items ?? [];

  return (
    <div className="p-5 space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-50 rounded-lg px-4 py-3">
          <p className="text-xs text-gray-400">{t('Latest')}</p>
          <p className="text-lg font-semibold text-gray-900 mt-0.5">{latest.totalScore} <span className="text-sm font-medium text-gray-500">· {latest.severity}</span></p>
          <div className="h-1.5 rounded-full bg-gray-200 mt-2 overflow-hidden">
            <div className={`h-full rounded-full ${tone(latest.totalScore / latest.maxScore)}`} style={{ width: `${(latest.totalScore / latest.maxScore) * 100}%` }} />
          </div>
        </div>
        <div className="bg-gray-50 rounded-lg px-4 py-3">
          <p className="text-xs text-gray-400">{t('First recorded')}</p>
          <p className="text-lg font-semibold text-gray-900 mt-0.5">{first.totalScore} <span className="text-sm font-medium text-gray-500">· {first.severity}</span></p>
          <p className="text-xs text-gray-400 mt-2">{fmt(first.recordedAt, 'd MMM yyyy')}</p>
        </div>
        <div className="bg-gray-50 rounded-lg px-4 py-3">
          <p className="text-xs text-gray-400">{t('Range')}</p>
          <p className="text-lg font-semibold text-gray-900 mt-0.5">{latest.minScore}–{latest.maxScore}</p>
          <p className="text-xs text-gray-400 mt-2">{t('(lower is better)')}</p>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t(SCALE_NAME[latest.scale])}</p>
        <div className="grid grid-cols-3 gap-3 mb-4">
          {latest.domainScores.map((d) => (
            <div key={d.domain} className="border border-gray-100 rounded-lg px-4 py-3">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-gray-600">{d.label}</span>
                <span className="text-sm font-semibold text-gray-900">{d.score}<span className="font-normal text-gray-400">/{d.max}</span></span>
              </div>
              <div className="h-1.5 rounded-full bg-gray-100 mt-2 overflow-hidden">
                <div className={`h-full rounded-full ${tone(d.max ? d.score / d.max : 0)}`} style={{ width: `${d.max ? (d.score / d.max) * 100 : 0}%` }} />
              </div>
            </div>
          ))}
        </div>
        {assessments.length > 1 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400">
                <th className="font-medium py-1">{t('Date')}</th>
                <th className="font-medium py-1">{t('Total')}</th>
                {latest.domainScores.map((d) => <th key={d.domain} className="font-medium py-1">{d.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {newestFirst.map((a, i) => {
                const prev = newestFirst[i + 1];
                return (
                  <tr key={a.id} className="border-t border-gray-100">
                    <td className="py-1.5 text-gray-600">{fmt(a.recordedAt, 'd MMM yyyy')}</td>
                    <td className="py-1.5 font-medium text-gray-900">{a.totalScore}<Change now={a.totalScore} before={prev?.totalScore} /> <span className="text-xs font-normal text-gray-400">{a.severity}</span></td>
                    {a.domainScores.map((d) => (
                      <td key={d.domain} className="py-1.5 text-gray-700">
                        {d.score}/{d.max}<Change now={d.score} before={prev?.domainScores.find((x) => x.domain === d.domain)?.score} />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {scale && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{t('Latest answers')} · {fmt(latest.recordedAt, 'd MMM yyyy')}</p>
          <div className="space-y-4">
            {latest.domainScores.map((d) => {
              const rows = items.filter((item) => item.domain === d.domain);
              if (!rows.length) return null;
              return (
                <div key={d.domain}>
                  <p className="text-xs font-medium text-gray-400 mb-1.5">{d.label}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {rows.map((item) => {
                      const score = latest.answers.find((a) => a.itemId === item.id)?.score;
                      const label = scale.options.find((o: { score: number }) => o.score === score)?.label ?? '—';
                      const ratio = score !== undefined && worst ? score / worst : 0;
                      const severe = ratio >= 0.75;
                      return (
                        <div key={item.id} className="bg-gray-50 rounded-lg px-3 py-2.5">
                          <p className="text-sm text-gray-700 leading-snug">{item.text}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <div className="flex-1 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                              <div className={`h-full rounded-full ${tone(ratio)}`} style={{ width: `${ratio * 100}%` }} />
                            </div>
                            <span className={`text-xs font-medium ${severe ? 'text-danger-500' : 'text-gray-900'}`}>{label}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
