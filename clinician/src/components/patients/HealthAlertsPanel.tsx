'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@apollo/client';
import { HEALTH_ALERTS } from '@/graphql/dashboard';
import { EFFECT_LABEL } from '@/components/checkins/SideEffectSummary';
import { useI18n } from '@/lib/i18n/I18nProvider';

type Alert = {
  id: string;
  level: 'RED' | 'YELLOW' | 'ORANGE';
  kind: 'WEIGHT_GAIN' | 'SEVERE_SIDE_EFFECT' | 'PENDING_REVIEWS' | 'OVERDUE_CHECK_INS' | 'WEIGHT_ENTRY_CHECK' | 'PRESCRIPTIONS_EXPIRING';
  count: number;
  value?: number | null;
  other?: number | null;
  effects: string[];
  patients: { id: string; name: string }[];
};

// A coloured dot, and a thin edge, so a red alert can be told from an amber one at a glance.
const LEVEL: Record<Alert['level'], { dot: string; edge: string }> = {
  RED: { dot: 'bg-red-500', edge: 'shadow-[inset_2px_0_0_theme(colors.red.500)]' },
  YELLOW: { dot: 'bg-yellow-400', edge: 'shadow-[inset_2px_0_0_theme(colors.yellow.400)]' },
  ORANGE: { dot: 'bg-orange-400', edge: 'shadow-[inset_2px_0_0_theme(colors.orange.400)]' },
};

/** Alerts shown before the list is collapsed. */
const SHOWN = 3;

/**
 * What to look at first: a rising weight, a severe side effect, consultations waiting, check-ins overdue,
 * prescriptions about to end. Only appears when there is something. It points; the doctor decides.
 */
export default function HealthAlertsPanel() {
  const { t } = useI18n();
  const { data } = useQuery(HEALTH_ALERTS, { pollInterval: 60_000, fetchPolicy: 'cache-and-network' });
  const [all, setAll] = useState(false);
  const alerts: Alert[] = data?.healthAlerts ?? [];
  if (alerts.length === 0) return null;
  const shown = all ? alerts : alerts.slice(0, SHOWN);

  const describe = (a: Alert): { title: string; detail: string } => {
    const who = a.patients[0]?.name ?? '';
    const names = a.patients.map((p) => p.name).join(', ') + (a.count > a.patients.length ? ` +${a.count - a.patients.length}` : '');
    switch (a.kind) {
      case 'WEIGHT_GAIN':
        return { title: t('{name}: weight up {pct}% in 4 weeks', { name: who, pct: a.value ?? 0 }), detail: t('Needs a review. Open the record to see the trend.') };
      case 'SEVERE_SIDE_EFFECT':
        return { title: t('{name}: severe side effect reported', { name: who }), detail: `${a.effects.map((e) => t(EFFECT_LABEL[e] ?? e)).join(', ')} · ${t('not yet acknowledged')}` };
      case 'PENDING_REVIEWS':
        return { title: t('{n} consultations waiting for review', { n: a.count }), detail: t('Waiting {days} days on average', { days: a.value ?? 0 }) };
      case 'OVERDUE_CHECK_INS':
        return { title: t('{n} patients overdue for a check-in', { n: a.count }), detail: names };
      case 'WEIGHT_ENTRY_CHECK':
        return { title: t('{name}: last weight may be a typing mistake', { name: who }), detail: t('{latest} kg after {previous} kg', { latest: a.value ?? 0, previous: a.other ?? 0 }) };
      case 'PRESCRIPTIONS_EXPIRING':
        return { title: t('{n} prescriptions end within 7 days', { n: a.count }), detail: names };
    }
  };

  return (
    <section className="shrink-0 overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-card)]" aria-label={t('Important alerts')}>
      <h2 className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-[color:var(--t-muted)] border-b border-[color:var(--border-subtle)]">
        {t('Important alerts')}
        <span className="rounded-full bg-[color:var(--bg-hover)] px-1.5 text-[11px] text-[color:var(--t-body)]">{alerts.length}</span>
      </h2>
      <ul className="divide-y divide-[color:var(--border-subtle)]">
        {shown.map((a) => {
          const { title, detail } = describe(a);
          const single = a.kind === 'WEIGHT_GAIN' || a.kind === 'SEVERE_SIDE_EFFECT' || a.kind === 'WEIGHT_ENTRY_CHECK';
          const link = 'text-xs font-medium text-brand-500 hover:underline whitespace-nowrap';
          return (
            <li key={a.id} className={`flex items-center gap-3 px-4 py-2 ${LEVEL[a.level].edge}`}>
              <span className={`h-2 w-2 shrink-0 rounded-full ${LEVEL[a.level].dot}`} aria-hidden />
              <p className="min-w-0 flex-1 truncate text-[13px]">
                <span className="font-medium text-[color:var(--t-strong)]">{title}</span>
                <span className="text-[color:var(--t-muted)]">
                  {' · '}
                  {a.kind === 'PRESCRIPTIONS_EXPIRING' ? (
                    // Each name opens that patient's record: there is no page that lists prescriptions by when they end.
                    <>
                      {a.patients.map((p, i) => (
                        <span key={p.id}>{i > 0 && ', '}<Link href={`/patients?patient=${p.id}`} className="text-brand-500 hover:underline">{p.name}</Link></span>
                      ))}
                      {a.count > a.patients.length && ` +${a.count - a.patients.length}`}
                    </>
                  ) : (
                    detail
                  )}
                </span>
              </p>
              {single && a.patients[0] && <Link href={`/patients?patient=${a.patients[0].id}`} className={link}>{t('Open record')}</Link>}
              {a.kind === 'PENDING_REVIEWS' && <Link href="/queue" className={link}>{t('Go to the review queue')}</Link>}
              {a.kind === 'OVERDUE_CHECK_INS' && <Link href="/check-ins" className={link}>{t('Open check-ins')}</Link>}
            </li>
          );
        })}
      </ul>
      {alerts.length > SHOWN && (
        <button type="button" onClick={() => setAll(!all)} className="w-full border-t border-[color:var(--border-subtle)] px-4 py-1.5 text-xs text-[color:var(--t-muted)] hover:text-[color:var(--t-strong)]">
          {all ? t('Show fewer') : t('Show all ({n})', { n: alerts.length })}
        </button>
      )}
    </section>
  );
}
