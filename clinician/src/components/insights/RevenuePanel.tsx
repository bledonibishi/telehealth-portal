'use client';

import { useState } from 'react';
import { useQuery } from '@apollo/client';
import { REVENUE_OVERVIEW, SALES_FUNNEL } from '@/graphql/insights';
import { useI18n } from '@/lib/i18n/I18nProvider';
import PeriodSelect, { type Period } from './PeriodSelect';
import { InlineError } from '@/components/ui/Alert';

const STAGE_LABEL: Record<string, string> = {
  LANDING_VISITORS: 'Visited the landing page',
  QUIZ_STARTED: 'Started the quiz',
  PASSED_ELIGIBILITY: 'Passed the eligibility check',
  PAID: 'Paid at checkout',
  ACCOUNT_ACTIVATED: 'Activated their account',
  CONSULTATION_SUBMITTED: 'Submitted the medical questionnaire',
  DOCTOR_APPROVED: 'Approved by a doctor',
  FIRST_SHIPMENT: 'First shipment sent',
};

function Card({ label, value, sub, tone = 'text-gray-900' }: { label: string; value: string | string[]; sub?: string; tone?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-1">
      <p className="text-sm font-medium text-gray-700">{label}</p>
      {Array.isArray(value) ? (
        // One line per currency: they can't be added together, so none may stand in for the total.
        <div className="flex flex-col">
          {value.map((v, i) => (
            <p key={i} className={`font-bold tabular-nums ${tone} ${value.length > 1 ? 'text-xl leading-tight' : 'text-3xl'}`}>{v}</p>
          ))}
        </div>
      ) : (
        <p className={`text-3xl font-bold ${tone}`}>{value}</p>
      )}
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

/** The money and the sales funnel, for the owner. Admin only (the API refuses anyone else). */
export default function RevenuePanel() {
  const { t, locale } = useI18n();
  const [days, setDays] = useState<Period>(30);
  const revenue = useQuery(REVENUE_OVERVIEW, { variables: { days }, pollInterval: 5 * 60_000 });
  const funnel = useQuery(SALES_FUNNEL, { variables: { days }, pollInterval: 5 * 60_000 });

  const r = revenue.data?.revenueOverview;
  const funnelData = funnel.data?.salesFunnel;
  const stages: any[] = funnelData?.stages ?? [];
  const top = stages[0]?.count ?? 0;

  const money = (cents: number, currency: string) =>
    new Intl.NumberFormat({ sq: 'sq-AL', en: 'en-GB', de: 'de-DE', es: 'es-ES' }[locale], { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100);
  const mrr: Array<{ currency: string; amountCents: number }> = r?.mrr ?? [];

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t('Revenue & sales funnel')}</h2>
        <PeriodSelect value={days} onChange={setDays} />
      </div>

      <InlineError error={revenue.error} className="mb-3" />
      {r && !r.configured && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-3">
          {t('Stripe is not connected here, so revenue figures are unavailable. The sales funnel below still works.')}
        </p>
      )}

      {r?.error && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-3">
          {t('Stripe could not be read: {message}', { message: r.error })} {t('Check STRIPE_SECRET_KEY in the backend settings.')}
        </p>
      )}

      {r?.configured && !r.error && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <Card
              label={t('Monthly recurring revenue')}
              value={mrr.length ? mrr.map((m) => money(m.amountCents, m.currency)) : '—'}
              sub={mrr.length > 1 ? t('One amount per currency, not added together. List prices, before discounts') : t('List prices, before discounts')}
              tone="text-green-700"
            />
            <Card label={t('Active subscribers')} value={String(r.activeSubscribers)} sub={r.pastDueSubscribers ? t('{n} with a failed payment', { n: r.pastDueSubscribers }) : undefined} />
            <Card label={t('New subscribers')} value={String(r.newSubscribers)} sub={t('Last {n} days', { n: days })} tone="text-blue-700" />
            <Card
              label={t('Churn rate')}
              value={r.churnRate === null || r.churnRate === undefined ? '—' : `${r.churnRate}%`}
              sub={t('{n} left · {m} declined by a doctor', { n: r.cancellations - r.clinicalDeclines, m: r.clinicalDeclines })}
              tone={r.churnRate && r.churnRate >= 10 ? 'text-red-700' : 'text-gray-900'}
            />
            <Card label={t('Failed payments')} value={String(r.pastDueSubscribers)} sub={t('Need attention')} tone={r.pastDueSubscribers ? 'text-amber-700' : 'text-gray-900'} />
          </div>
          {r.truncated && <p className="text-xs text-gray-400 mt-2">{t('Only the most recent 2,000 subscriptions were read, so these figures are partial.')}</p>}
        </>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-5 mt-4">
        <p className="text-sm font-medium text-gray-700 mb-4">{t('From the landing page to the first shipment')}</p>
        <InlineError error={funnel.error} />
        {funnelData && !funnelData.visitorsConfigured && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-3">
            {t('Website visits and quiz starts are not shown: PostHog is not connected. Set POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID in the backend settings.')}
          </p>
        )}
        {funnelData?.visitorsError && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-3">
            {t('PostHog could not be read: {message}', { message: funnelData.visitorsError })}
          </p>
        )}
        {funnel.loading && !stages.length && <p className="text-sm text-gray-400">{t('Loading…')}</p>}
        <ol className="space-y-3">
          {stages.map((s, i) => (
            <li key={s.key} className="grid grid-cols-[minmax(160px,260px)_1fr_auto] items-center gap-3">
              <span className="text-sm text-gray-700">{t(STAGE_LABEL[s.key])}</span>
              <div className="h-6 bg-gray-100 rounded-md overflow-hidden" role="img" aria-label={`${t(STAGE_LABEL[s.key])}: ${s.count}`}>
                <div
                  className={`h-full rounded-md ${i === stages.length - 1 ? 'bg-green-500' : 'bg-brand-500'}`}
                  style={{ width: `${top > 0 ? Math.max((s.count / top) * 100, s.count > 0 ? 2 : 0) : 0}%` }}
                />
              </div>
              <span className="text-sm tabular-nums text-gray-900 w-36 text-right">
                <b>{s.count}</b>
                {s.percentOfPrevious !== null && s.percentOfPrevious !== undefined && (
                  <span className="text-xs text-gray-400 ml-2">{s.percentOfPrevious}%</span>
                )}
              </span>
            </li>
          ))}
        </ol>
        <p className="text-xs text-gray-400 mt-4">
          {t('Patients pay at checkout before a doctor reviews them (and are refunded if declined), so payment comes before approval. Website visits and quiz starts are counted per person, as PostHog sees them.')}
        </p>
      </div>
    </section>
  );
}
