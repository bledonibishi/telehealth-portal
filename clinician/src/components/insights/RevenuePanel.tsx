'use client';

import { useState } from 'react';
import { useQuery } from '@apollo/client';
import { REVENUE_OVERVIEW, SALES_FUNNEL } from '@/graphql/insights';
import { useI18n } from '@/lib/i18n/I18nProvider';
import PeriodSelect, { type Period } from './PeriodSelect';
import { InlineError } from '@/components/ui/Alert';
import { LoadingState } from '@telehealth/loading';

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

/** One figure in the revenue strip: a small label, the number, one line under it. Numbers stay in ink; only a problem is coloured. */
function Stat({ label, value, sub, alert = false }: { label: string; value: string | string[]; sub?: string; alert?: boolean }) {
  const [main, ...rest] = Array.isArray(value) ? value : [value];
  return (
    <div className="min-w-0 px-5 py-4">
      <p className="truncate text-xs font-medium text-gray-500" title={label}>{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${alert ? 'text-red-700' : 'text-gray-900'}`}>
        {main}
        {/* One amount per currency: they can't be added together, so none may stand in for the total. */}
        {rest.length > 0 && <span className="ml-2 text-sm font-medium text-gray-500">· {rest.join(' · ')}</span>}
      </p>
      {sub && <p className="mt-0.5 line-clamp-2 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

/** The money and the sales funnel, for the owner. Admin only (the API refuses anyone else). */
export default function RevenuePanel() {
  const { t, locale } = useI18n();
  const [days, setDays] = useState<Period>(30);
  const [hover, setHover] = useState<number | null>(null);
  const revenue = useQuery(REVENUE_OVERVIEW, { variables: { days }, pollInterval: 5 * 60_000 });
  const funnel = useQuery(SALES_FUNNEL, { variables: { days }, pollInterval: 5 * 60_000 });

  const r = revenue.data?.revenueOverview;
  const funnelData = funnel.data?.salesFunnel;
  const stages: any[] = funnelData?.stages ?? [];
  const top = stages[0]?.count ?? 0;
  const last = stages[stages.length - 1]?.count ?? 0;
  // The step that keeps the smallest share of the people before it.
  const worst = stages.reduce((w, s, i) => (i > 0 && s.percentOfPrevious != null && (w < 0 || s.percentOfPrevious < stages[w].percentOfPrevious) ? i : w), -1);

  const money = (cents: number, currency: string) =>
    new Intl.NumberFormat({ sq: 'sq-AL', en: 'en-GB', de: 'de-DE', es: 'es-ES' }[locale], { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100);
  const mrr: Array<{ currency: string; amountCents: number }> = r?.mrr ?? [];

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('Revenue & sales funnel')}</h2>
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
          <div className="grid grid-cols-2 lg:grid-cols-5 divide-x divide-y lg:divide-y-0 divide-gray-100 rounded-xl border border-gray-200 bg-white overflow-hidden">
            <Stat
              label={t('Monthly recurring revenue')}
              value={mrr.length ? mrr.map((m) => money(m.amountCents, m.currency)) : '—'}
              sub={mrr.length > 1 ? t('One amount per currency, not added together. List prices, before discounts') : t('List prices, before discounts')}
            />
            <Stat label={t('Active subscribers')} value={String(r.activeSubscribers)} sub={r.pastDueSubscribers ? t('{n} with a failed payment', { n: r.pastDueSubscribers }) : undefined} />
            <Stat label={t('New subscribers')} value={String(r.newSubscribers)} sub={t('Last {n} days', { n: days })} />
            <Stat
              label={t('Churn rate')}
              value={r.churnRate === null || r.churnRate === undefined ? '—' : `${r.churnRate}%`}
              sub={t('{n} left · {m} declined by a doctor', { n: r.cancellations - r.clinicalDeclines, m: r.clinicalDeclines })}
              alert={!!r.churnRate && r.churnRate >= 10}
            />
            <Stat label={t('Failed payments')} value={String(r.pastDueSubscribers)} sub={t('Need attention')} alert={r.pastDueSubscribers > 0} />
          </div>
          {r.truncated && <p className="text-xs text-gray-400 mt-2">{t('Only the most recent 2,000 subscriptions were read, so these figures are partial.')}</p>}
        </>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6 mt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{t('From the landing page to the first shipment')}</h3>
            <p className="mt-0.5 text-xs text-gray-500">{t('Last {n} days', { n: days })}</p>
          </div>
          {stages.length > 1 && top > 0 && (
            <div className="text-right">
              <p className="text-2xl font-semibold tabular-nums text-gray-900">{Math.round((last / top) * 1000) / 10}%</p>
              <p className="text-xs text-gray-500">{t('{n} of {m} reached the end', { n: last, m: top })}</p>
            </div>
          )}
        </div>

        <InlineError error={funnel.error} className="mt-3" />
        {funnel.loading && !stages.length && <LoadingState variant="inline" label={t('Loading…')} />}

        {stages.length > 0 && (
          <div className="mt-6 overflow-x-auto">
            <ol className="flex min-w-[40rem]" onMouseLeave={() => setHover(null)}>
              {stages.map((s, i) => {
                const label = t(STAGE_LABEL[s.key]);
                const prev = i > 0 ? stages[i - 1].count : null;
                const h = (n: number) => `${top > 0 ? Math.max((n / top) * 100, n > 0 ? 2 : 0) : 0}%`;
                const pct = s.percentOfPrevious;
                const flagged = i === worst;
                return (
                  <li key={s.key} className="relative flex min-w-0 flex-1 flex-col" onMouseEnter={() => setHover(i)}>
                    {/* The step into this stage: what share carried on. */}
                    <div className="flex h-7 items-center justify-center">
                      {i > 0 && pct != null && (
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${flagged ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>
                          {flagged && <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden><path d="M12 5v14m-6-6 6 6 6-6" /></svg>}
                          {pct}%
                        </span>
                      )}
                    </div>
                    <div className={`mx-1.5 rounded-lg px-1.5 pt-2 transition-colors ${hover === i ? 'bg-gray-50' : ''}`}>
                      <p className="text-center text-lg font-semibold tabular-nums text-gray-900">{s.count}</p>
                      {/* The column: last stage's people as a faint bar, this stage's as the solid one, so the gap is who dropped. */}
                      <div className="relative mt-1.5 h-40" role="img" aria-label={`${label}: ${s.count}`}>
                        {prev !== null && <div className="absolute inset-x-1 bottom-0 rounded-t-md bg-gray-100" style={{ height: h(prev) }} />}
                        <div className="absolute inset-x-1 bottom-0 rounded-t-md bg-brand-500" style={{ height: h(s.count) }} />
                      </div>
                    </div>
                    <div className="mx-1.5 border-t border-gray-200 px-1 pt-2">
                      <p className="flex items-start gap-1.5 text-xs leading-snug text-gray-700">
                        <span className="mt-px flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] font-semibold text-gray-500">{i + 1}</span>
                        <span className="line-clamp-2">{label}</span>
                      </p>
                    </div>
                    {hover === i && prev !== null && (
                      <div className="pointer-events-none absolute left-1/2 top-8 z-10 w-44 -translate-x-1/2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-lg">
                        <p className="font-semibold text-gray-900">{label}</p>
                        <p className="mt-1 flex justify-between text-gray-600"><span>{t('Reached this step')}</span><b className="tabular-nums text-gray-900">{s.count}</b></p>
                        <p className="flex justify-between text-gray-600"><span>{t('Dropped before it')}</span><b className="tabular-nums text-gray-900">{Math.max(prev - s.count, 0)}</b></p>
                        <p className="flex justify-between text-gray-600"><span>{t('Of everyone at the start')}</span><b className="tabular-nums text-gray-900">{s.percentOfFirst ?? '—'}%</b></p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        <div className="mt-5 space-y-1.5 border-t border-gray-100 pt-4 text-xs text-gray-500">
          {worst > 0 && (
            <p className="flex items-center gap-1.5">
              <span className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-amber-800"><svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden><path d="M12 5v14m-6-6 6 6 6-6" /></svg></span>
              <span>{t('Biggest drop')}: {t(STAGE_LABEL[stages[worst - 1].key])} → {t(STAGE_LABEL[stages[worst].key])}</span>
            </p>
          )}
          {funnelData && !funnelData.visitorsConfigured && (
            <p className="flex gap-1.5">
              <svg viewBox="0 0 24 24" className="mt-px h-3.5 w-3.5 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v4h1" /></svg>
              <span>{t('Website visits and quiz starts are not shown: PostHog is not connected. Set POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID in the backend settings.')}</span>
            </p>
          )}
          {funnelData?.visitorsError && <p className="text-amber-700">{t('PostHog could not be read: {message}', { message: funnelData.visitorsError })}</p>}
          <p>{t('Patients pay at checkout before a doctor reviews them (and are refunded if declined), so payment comes before approval. Website visits and quiz starts are counted per person, as PostHog sees them.')}</p>
        </div>
      </div>
    </section>
  );
}
