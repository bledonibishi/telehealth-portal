'use client';

import { useI18n } from '@/lib/i18n/I18nProvider';

export type SideEffectSummaryData = {
  lastLoggedAt?: string | null;
  daysSinceLastLog?: number | null;
  stale: boolean;
  needsAttention: boolean;
  reasons: string[];
  roughDoses: number;
  scores: { key: string; label: string; latest: number; previous?: number | null; peak: number; flagged: boolean; rising: boolean }[];
  reports: { id: string; effects: string[]; severity: 'MILD' | 'MODERATE' | 'SEVERE'; note?: string | null; createdAt: string; acknowledgedAt?: string | null }[];
};

// Same wording the patient picks from.
const EFFECT_LABEL: Record<string, string> = {
  nausea: 'Nausea', vomiting: 'Vomiting', diarrhoea: 'Diarrhoea', constipation: 'Constipation', abdominal_pain: 'Stomach pain', reflux: 'Heartburn or reflux',
  fatigue: 'Tiredness', headache: 'Headache', dizziness: 'Dizziness', injection_site: 'Reaction where they inject', allergic_reaction: 'Rash, itching or swelling', other: 'Something else',
};
const SEVERITY_CLS: Record<string, string> = { SEVERE: 'bg-danger-100 text-danger-500', MODERATE: 'bg-warn-100 text-warn-900', MILD: 'bg-gray-100 text-gray-700' };
const scoreCls = (n: number, flagged: boolean) => (flagged ? 'text-danger-500 font-semibold' : n >= 4 ? 'text-warn-900 font-medium' : 'text-gray-700');

/**
 * What the patient has said about side effects, laid out to be read before approving a dose or supply:
 * the weekly scores (now, before, peak), what they reported themselves, and how recent doses went.
 * Red and expanded when something needs a look; quiet when nothing does.
 */
export default function SideEffectSummary({ summary }: { summary: SideEffectSummaryData }) {
  const { t, timeAgo } = useI18n();
  const hot = summary.needsAttention;

  return (
    <section className={`rounded-lg border p-4 ${hot ? 'border-danger-500/40 bg-danger-50/60' : 'border-gray-200 bg-white'}`} aria-label={t('Side effects')}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className={`text-sm font-semibold ${hot ? 'text-danger-500' : 'text-gray-900'}`}>
          {hot ? t('Side effects to look at before approving') : t('Side effects')}
        </h3>
        <span className="text-xs text-gray-500">
          {summary.lastLoggedAt ? t('Weekly scores logged {when}', { when: timeAgo(summary.lastLoggedAt) }) : t('No weekly scores logged')}
        </span>
      </div>

      {hot && (
        <ul className="mt-2 space-y-0.5">
          {summary.reasons.map((r) => (
            <li key={r} className="text-sm text-danger-500 font-medium">• {r}</li>
          ))}
        </ul>
      )}
      {!hot && <p className="text-xs text-gray-500 mt-1">{t('Nothing flagged.')}</p>}

      {summary.scores.length > 0 ? (
        <table className="w-full text-sm mt-3">
          <thead>
            <tr className="text-left text-xs text-gray-500">
              <th className="py-1 font-medium">{t('Symptom')}</th>
              <th className="py-1 font-medium text-right">{t('Now')}</th>
              <th className="py-1 font-medium text-right">{t('Before')}</th>
              <th className="py-1 font-medium text-right">{t('Peak, 28 days')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {summary.scores.map((r) => (
              <tr key={r.key}>
                <td className="py-1.5 text-gray-700">{t(r.label)}{r.rising && <span className="ml-1.5 text-xs font-medium text-warn-900">↑ {t('rising')}</span>}</td>
                <td className={`py-1.5 text-right ${scoreCls(r.latest, r.flagged)}`}>{r.latest}/10</td>
                <td className="py-1.5 text-right text-gray-500">{r.previous != null ? `${r.previous}/10` : '—'}</td>
                <td className={`py-1.5 text-right ${scoreCls(r.peak, r.peak >= 7)}`}>{r.peak}/10</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-xs text-gray-500 mt-3">{t('No weekly scores yet. That is not the same as no side effects: ask the patient, or check their reports below.')}</p>
      )}
      {summary.scores.length > 0 && summary.stale && (
        <p className="text-xs text-warn-900 mt-2">{t('The last scores are {n} days old, so they may be out of date.', { n: summary.daysSinceLastLog ?? 0 })}</p>
      )}

      {summary.reports.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-200/70">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('Reported by the patient, last 28 days')}</p>
          <ul className="mt-1.5 space-y-1.5">
            {summary.reports.map((r) => (
              <li key={r.id} className="text-xs text-gray-700">
                <span className={`inline-block px-1.5 py-0.5 rounded font-medium mr-1.5 ${SEVERITY_CLS[r.severity]}`}>{t(r.severity.charAt(0) + r.severity.slice(1).toLowerCase())}</span>
                {r.effects.map((e) => t(EFFECT_LABEL[e] ?? e)).join(', ')} · {timeAgo(r.createdAt)}{!r.acknowledgedAt && <span className="text-danger-500 font-medium"> · {t('not yet acknowledged')}</span>}
                {r.note && <span className="block text-gray-500 italic">“{r.note}”</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
