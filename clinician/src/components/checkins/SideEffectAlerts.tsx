'use client';

import Link from 'next/link';
import { useMutation, useQuery } from '@apollo/client';
import { ACKNOWLEDGE_SIDE_EFFECT, SIDE_EFFECT_ALERTS } from '@/graphql/checkins';
import { useI18n } from '@/lib/i18n/I18nProvider';

type Alert = {
  id: string;
  patientId: string;
  patientName: string;
  effects: string[];
  severity: 'MILD' | 'MODERATE' | 'SEVERE';
  note?: string | null;
  medication?: string | null;
  createdAt: string;
};

// Same wording the patient picks from.
const EFFECT_LABEL: Record<string, string> = {
  nausea: 'Nausea', vomiting: 'Vomiting', diarrhoea: 'Diarrhoea', constipation: 'Constipation', reflux: 'Heartburn or reflux',
  fatigue: 'Tiredness', headache: 'Headache', dizziness: 'Dizziness', injection_site: 'Reaction where they inject', other: 'Something else',
};
const SEVERITY: Record<Alert['severity'], { label: string; cls: string }> = {
  SEVERE: { label: 'Severe', cls: 'bg-danger-100 text-danger-500' },
  MODERATE: { label: 'Moderate', cls: 'bg-warn-100 text-warn-900' },
  MILD: { label: 'Mild', cls: 'bg-gray-100 text-gray-700' },
};

/**
 * Side effects patients reported between check-ins, most severe first. Each stays until a doctor
 * acknowledges it (which is recorded against the patient), so a report can't be missed.
 */
export function SideEffectAlerts() {
  const { t, timeAgo } = useI18n();
  const { data } = useQuery(SIDE_EFFECT_ALERTS, { pollInterval: 60_000 });
  const [acknowledge, { loading }] = useMutation(ACKNOWLEDGE_SIDE_EFFECT, { refetchQueries: [{ query: SIDE_EFFECT_ALERTS }] });
  const alerts: Alert[] = data?.sideEffectAlerts ?? [];
  if (alerts.length === 0) return null;

  return (
    <div className="border-b border-gray-200 bg-red-50/50">
      <div className="px-5 pt-3 pb-1">
        <p className="text-xs font-semibold text-red-900 uppercase tracking-wide">{t('Side effects reported')} · {alerts.length}</p>
        <p className="text-xs text-red-900/70 mt-0.5">{t('Reported by patients between check-ins. Acknowledge once you have looked at it.')}</p>
      </div>
      <ul className="divide-y divide-red-100">
        {alerts.map((a) => (
          <li key={a.id} className="px-5 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <Link href={`/patients?patient=${a.patientId}`} className="text-sm font-medium text-gray-900 hover:underline">{a.patientName}</Link>
              <span className={`text-xs font-medium px-2 py-0.5 rounded ${SEVERITY[a.severity].cls}`}>{t(SEVERITY[a.severity].label)}</span>
            </div>
            <p className="text-xs text-gray-600 mt-0.5">
              {a.effects.map((e) => t(EFFECT_LABEL[e] ?? e)).join(', ')}
              {a.medication ? ` · ${a.medication}` : ''} · {timeAgo(a.createdAt)}
            </p>
            {a.note && <p className="text-xs text-gray-500 italic mt-0.5">“{a.note}”</p>}
            <button
              type="button"
              disabled={loading}
              onClick={() => acknowledge({ variables: { id: a.id } })}
              className="text-xs font-medium text-brand-500 hover:text-brand-900 mt-1"
            >
              {t('Acknowledge')}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
