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

  return (
    <div className="p-5 space-y-5">
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-gray-50 rounded-xl px-3 py-2.5">
          <p className="text-xs text-gray-400">{t('Latest')}</p>
          <p className="text-sm font-semibold text-gray-900 mt-0.5">{latest.totalScore} · {latest.severity}</p>
        </div>
        <div className="bg-gray-50 rounded-xl px-3 py-2.5">
          <p className="text-xs text-gray-400">{t('First recorded')}</p>
          <p className="text-sm font-semibold text-gray-900 mt-0.5">{first.totalScore} · {first.severity}</p>
        </div>
        <div className="bg-gray-50 rounded-xl px-3 py-2.5">
          <p className="text-xs text-gray-400">{t('Range')}</p>
          <p className="text-sm font-semibold text-gray-900 mt-0.5">{latest.minScore}–{latest.maxScore} <span className="font-normal text-gray-400">{t('(lower is better)')}</span></p>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t(SCALE_NAME[latest.scale])}</p>
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
      </div>

      {scale && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('Latest answers')} · {fmt(latest.recordedAt, 'd MMM yyyy')}</p>
          <ul className="divide-y divide-gray-100">
            {scale.items.map((item: { id: string; text: string }) => {
              const score = latest.answers.find((a) => a.itemId === item.id)?.score;
              const label = scale.options.find((o: { score: number }) => o.score === score)?.label ?? '—';
              const severe = score !== undefined && worst !== undefined && score >= worst - 1;
              return (
                <li key={item.id} className="flex items-start justify-between gap-3 py-1.5 text-sm">
                  <span className="text-gray-600">{item.text}</span>
                  <span className={`flex-shrink-0 font-medium ${severe ? 'text-danger-500' : 'text-gray-900'}`}>{label}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
