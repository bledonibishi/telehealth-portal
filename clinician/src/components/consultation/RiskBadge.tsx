'use client';

import { useI18n } from '@/lib/i18n/I18nProvider';

// The triage tag the server works out from the patient's answers.
const RISK: Record<string, { label: string; hint: string; cls: string }> = {
  RED: { label: 'High risk', hint: 'A disqualifying answer — not suitable for online treatment', cls: 'bg-danger-100 text-danger-500' },
  ORANGE: { label: 'Manual review', hint: 'Needs the doctor’s closer attention', cls: 'bg-warn-100 text-warn-900' },
  GREEN: { label: 'Standard', hint: 'No flags — standard approval', cls: 'bg-green-100 text-green-800' },
};

export function RiskBadge({ tag }: { tag?: string | null }) {
  const { t } = useI18n();
  const risk = tag ? RISK[tag] : undefined;
  if (!risk) return null;
  return (
    <span title={t(risk.hint)} className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${risk.cls}`}>
      {t(risk.label)}
    </span>
  );
}
