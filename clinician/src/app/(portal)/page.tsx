'use client';

import { useState } from 'react';
import { useQuery } from '@apollo/client';
import Link from 'next/link';
import { GET_DASHBOARD_METRICS } from '@/graphql/dashboard';
import { getCurrentRole } from '@/lib/role';
import RevenuePanel from '@/components/insights/RevenuePanel';
import { TrendChart } from '@/components/charts/TrendChart';
import { ActionTile } from '@/components/home/ActionTile';
import DoctorHome from '@/components/home/DoctorHome';
import { MONTHLY_REPORT } from '@/graphql/insights';
import { BILLING_REFUND_REQUESTS, PAYMENT_FAILURES } from '@/graphql/billing';
import { InlineError } from '@/components/ui/Alert';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { SkeletonStat } from '@telehealth/loading';

type Metrics = {
  totalLeads: number;
  leadsThisWeek: number;
  newLeadsToday: number;
  totalPatients: number;
  activePatients: number;
  newPatientsThisWeek: number;
  conversionRate: number;
  pendingConsultations: number;
  approvedConsultations: number;
  pendingOrders: number;
  dispatchedOrders: number;
};

type Money = { currency: string; amountCents: number };
type MonthRow = {
  month: string; newLeads: number; newPatients: number; ordersDispatched: number; continued: number; held: number; stopped: number; revenue: Money[];
};

/** One figure in the all-time strip. */
function Kpi({ label, value, href }: { label: string; value: string | number; href?: string }) {
  const { t } = useI18n();
  const inner = (
    <div className="px-4 py-3">
      <p className="text-xl font-bold tabular-nums text-gray-900">{value}</p>
      <p className="text-xs text-gray-500">{t(label)}</p>
    </div>
  );
  return href ? <Link href={href} className="hover:bg-gray-50">{inner}</Link> : inner;
}

function ChartCard({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 min-w-0">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Heading({ title, children }: { title: string; children?: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t(title)}</h2>
      {children}
    </div>
  );
}

/** Month by month, from the same report as the Reports page (which also shows it as a table). */
function Trends() {
  const { t, fmt, locale } = useI18n();
  const [months, setMonths] = useState(12);
  const { data, loading, error } = useQuery(MONTHLY_REPORT, { variables: { months }, fetchPolicy: 'cache-and-network' });
  // The report lists the newest month first; charts read left to right, oldest first.
  const rows: MonthRow[] = [...(data?.monthlyReport?.months ?? [])].reverse();
  const labels = rows.map((r) => fmt(`${r.month}-01T12:00:00Z`, 'MMM'));
  // Amounts in different currencies can't be added: chart the main one and say so if there are others.
  const totals = new Map<string, number>();
  rows.forEach((r) => r.revenue.forEach((m) => totals.set(m.currency, (totals.get(m.currency) ?? 0) + m.amountCents)));
  const currency = [...totals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const others = [...totals.keys()].filter((c) => c !== currency);
  const nf = { sq: 'sq-AL', en: 'en-GB', de: 'de-DE', es: 'es-ES' }[locale];
  const money = (cents: number) => (currency ? new Intl.NumberFormat(nf, { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100) : String(cents));

  return (
    <section>
      <Heading title="Month by month">
        <div className="flex items-center gap-3">
          <Link href="/reports" className="text-xs font-medium text-brand-500 hover:underline">{t('See as a table')}</Link>
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-xs" role="group" aria-label={t('Period')}>
            {[6, 12].map((m) => (
              <button key={m} type="button" onClick={() => setMonths(m)} aria-pressed={months === m}
                className={`px-2.5 py-1 rounded-md font-medium ${months === m ? 'bg-brand-500 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                {t('{n} months', { n: m })}
              </button>
            ))}
          </div>
        </div>
      </Heading>
      <InlineError error={error} className="mb-3" />
      {loading && !rows.length ? (
        <div className="grid gap-4 lg:grid-cols-2">{[1, 2, 3, 4].map((k) => <div key={k} className="h-72 rounded-xl bg-gray-100 animate-pulse" />)}</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title={t('New leads and new patients')} sub={t('People who started, and people who became patients')}>
            <TrendChart kind="line" labels={labels} ariaLabel={t('New leads and new patients')}
              series={[{ key: 'leads', label: t('New leads'), values: rows.map((r) => r.newLeads) }, { key: 'patients', label: t('New patients'), values: rows.map((r) => r.newPatients) }]} />
          </ChartCard>
          <ChartCard title={t('Revenue')} sub={others.length ? t('In {currency} only. Other currencies: {others}', { currency: currency ?? '', others: others.join(', ') }) : t('Paid invoices each month')}>
            {currency ? (
              <TrendChart labels={labels} format={money} ariaLabel={t('Revenue')}
                series={[{ key: 'revenue', label: t('Revenue'), values: rows.map((r) => r.revenue.find((m) => m.currency === currency)?.amountCents ?? 0) }]} />
            ) : <p className="py-16 text-center text-sm text-gray-400">{t('No revenue yet, or Stripe is not connected.')}</p>}
          </ChartCard>
          <ChartCard title={t('Supplies dispatched')} sub={t('Parcels that left the pharmacy')}>
            <TrendChart labels={labels} ariaLabel={t('Supplies dispatched')} series={[{ key: 'orders', label: t('Dispatched'), values: rows.map((r) => r.ordersDispatched) }]} />
          </ChartCard>
          <ChartCard title={t('Check-in decisions')} sub={t('What doctors decided at each monthly check-in')}>
            <TrendChart stacked labels={labels} ariaLabel={t('Check-in decisions')}
              series={[
                { key: 'continued', label: t('Continued'), values: rows.map((r) => r.continued) },
                { key: 'held', label: t('Held'), values: rows.map((r) => r.held) },
                { key: 'stopped', label: t('Stopped'), values: rows.map((r) => r.stopped) },
              ]} />
          </ChartCard>
        </div>
      )}
    </section>
  );
}

export default function DashboardPage() {
  const { t, fmt } = useI18n();
  const role = getCurrentRole();
  const admin = role === 'ADMIN';
  const opts = { pollInterval: 60_000, skip: !admin };
  const { data, loading } = useQuery(GET_DASHBOARD_METRICS, opts);
  const { data: refundData } = useQuery(BILLING_REFUND_REQUESTS, opts);
  const { data: failedData } = useQuery(PAYMENT_FAILURES, opts);

  const m: Metrics | undefined = data?.dashboardMetrics;
  const refunds = refundData?.refundRequests?.length ?? 0;
  const failed = failedData?.paymentFailures?.length ?? 0;

  if (role === 'DOCTOR') return <DoctorHome />;
  if (!admin) {
    return (
      <div className="p-8 text-center text-gray-400 text-sm">
        {t('Select a section from the sidebar to get started.')}
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl">
      <div data-guide="page-header">
        <h1 className="text-2xl font-semibold text-gray-900">{t('Good morning')}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{fmt(new Date(), 'PPPP')}</p>
      </div>

      <section data-guide="dashboard:attention">
        <Heading title="Needs attention" />
        {loading && !m ? (
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">{[1, 2, 3, 4].map((k) => <SkeletonStat key={k} />)}</div>
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <ActionTile label="Awaiting review" sub="Consultations a doctor has to decide" value={m?.pendingConsultations ?? 0} href="/queue" tone="red" />
            <ActionTile label="Pending dispatch" sub="Supplies waiting at the pharmacy" value={m?.pendingOrders ?? 0} href="/orders" tone="amber" />
            <ActionTile label="Refund requests" sub="Patients asking for their money back" value={refunds} href="/billing" tone="amber" />
            <ActionTile label="Payment failed" sub="Renewals that were declined" value={failed} href="/billing" tone="red" />
          </div>
        )}
      </section>

      <div data-guide="dashboard:revenue"><RevenuePanel /></div>

      <div data-guide="dashboard:trends"><Trends /></div>

      <section data-guide="dashboard:totals">
        <Heading title="All time" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-x divide-y lg:divide-y-0 divide-gray-100 rounded-xl border border-gray-200 bg-white overflow-hidden">
          <Kpi label="Leads" value={m?.totalLeads ?? '—'} href="/leads" />
          <Kpi label="New leads today" value={m?.newLeadsToday ?? '—'} href="/leads" />
          <Kpi label="Patients" value={m?.totalPatients ?? '—'} href="/patients" />
          <Kpi label="Active patients" value={m?.activePatients ?? '—'} href="/patients" />
          <Kpi label="Conversion rate" value={m ? `${m.conversionRate}%` : '—'} />
          <Kpi label="Supplies dispatched" value={m?.dispatchedOrders ?? '—'} href="/orders" />
        </div>
      </section>
    </div>
  );
}
