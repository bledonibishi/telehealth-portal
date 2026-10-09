'use client';

import { useState } from 'react';
import { useQuery } from '@apollo/client';
import { MONTHLY_REPORT } from '@/graphql/insights';
import ExportCsvButton from '@/components/ExportCsvButton';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { hasAccess } from '@/lib/role';
import type { CsvColumn } from '@/lib/csv';
import { Alert, InlineError } from '@/components/ui/Alert';

type Money = { currency: string; amountCents: number };
type Row = {
  month: string; newLeads: number; newPatients: number; subscriptionsEnded: number; ordersDispatched: number; checkInsReviewed: number;
  continued: number; held: number; stopped: number; revenue: Money[]; weighedPatients: number; avgLossPct: number | null; successRatePct: number | null;
};

const MONTH_OPTIONS = [3, 6, 12];

const money = (m: Money) => {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: m.currency }).format(m.amountCents / 100);
  } catch {
    return `${(m.amountCents / 100).toFixed(2)} ${m.currency}`;
  }
};
const moneyList = (list: Money[]) => (list.length ? list.map(money).join(' + ') : '—');
const pct = (n: number | null) => (n === null ? '—' : `${n}%`);

/** "+3 vs Sep": how a figure moved from the month before. Nothing when there is no month before. */
function Delta({ now, before, label }: { now: number; before?: number; label: string }) {
  if (before === undefined) return null;
  const d = now - before;
  return <span className={`text-xs ${d > 0 ? 'text-green-700' : d < 0 ? 'text-red-600' : 'text-gray-400'}`}>{d > 0 ? '+' : ''}{d} {label}</span>;
}

function Card({ label, value, children }: { label: string; value: string | number; children?: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 min-w-0">
      <p className="text-xs text-gray-500">{t(label)}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1 truncate">{value}</p>
      <div className="mt-0.5 min-h-[1rem]">{children}</div>
    </div>
  );
}

function Report() {
  const { t, fmt } = useI18n();
  const [months, setMonths] = useState(6);
  const { data, loading, error } = useQuery(MONTHLY_REPORT, { variables: { months }, fetchPolicy: 'cache-and-network' });
  const report = data?.monthlyReport;
  const rows: Row[] = report?.months ?? [];
  const label = (m: string) => fmt(`${m}-01T12:00:00Z`, 'MMM yyyy');
  const [latest, previous] = rows;
  const prevLabel = previous ? label(previous.month) : '';

  const columns: CsvColumn<Row>[] = [
    { header: 'Month', value: (r) => r.month },
    { header: 'Revenue (before refunds)', value: (r) => r.revenue.map((m) => `${(m.amountCents / 100).toFixed(2)} ${m.currency}`).join('; ') },
    { header: 'New leads', value: (r) => r.newLeads },
    { header: 'New patients', value: (r) => r.newPatients },
    { header: 'Subscriptions ended', value: (r) => r.subscriptionsEnded },
    { header: 'Orders dispatched', value: (r) => r.ordersDispatched },
    { header: 'Check-ins reviewed', value: (r) => r.checkInsReviewed },
    { header: 'Continued', value: (r) => r.continued },
    { header: 'On hold', value: (r) => r.held },
    { header: 'Stopped', value: (r) => r.stopped },
    { header: 'Patients weighed', value: (r) => r.weighedPatients },
    { header: 'Average weight lost (%)', value: (r) => r.avgLossPct },
    { header: 'Reached 5% (%)', value: (r) => r.successRatePct },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{t('Monthly report')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t('The clinic month by month: patients, revenue, check-in decisions and weight lost.')}</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={months} onChange={(e) => setMonths(Number(e.target.value))} className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-brand-500" aria-label={t('Months to show')}>
            {MONTH_OPTIONS.map((n) => <option key={n} value={n}>{t('Last {n} months', { n })}</option>)}
          </select>
          <ExportCsvButton resource="monthly-report" rows={rows} columns={columns} />
        </div>
      </div>

      {!report && <InlineError error={error} />}
      {loading && !report && <p className="text-sm text-gray-400">{t('Loading…')}</p>}
      {report && !report.revenueConfigured && <p className="text-xs bg-amber-50 text-amber-800 rounded-lg px-3 py-2">{t('Stripe is not set up, so revenue is not shown. Everything else is counted from your own records.')}</p>}
      {report?.revenueError && <Alert tone="warning">{t('Stripe refused the request, so revenue is not shown: {error}', { error: report.revenueError })}</Alert>}
      {report?.revenueTruncated && <p className="text-xs bg-amber-50 text-amber-800 rounded-lg px-3 py-2">{t('Stripe has more invoices than one request reads, so the oldest months of revenue may be short.')}</p>}

      {latest && (
        <>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label(latest.month)} · {t('so far')}</h2>
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            <Card label="Revenue" value={moneyList(latest.revenue)} />
            <Card label="New patients" value={latest.newPatients}><Delta now={latest.newPatients} before={previous?.newPatients} label={`${t('vs')} ${prevLabel}`} /></Card>
            <Card label="New leads" value={latest.newLeads}><Delta now={latest.newLeads} before={previous?.newLeads} label={`${t('vs')} ${prevLabel}`} /></Card>
            <Card label="Check-ins reviewed" value={latest.checkInsReviewed}><Delta now={latest.checkInsReviewed} before={previous?.checkInsReviewed} label={`${t('vs')} ${prevLabel}`} /></Card>
            <Card label="Average weight lost" value={pct(latest.avgLossPct)}><span className="text-xs text-gray-400">{t('{n} patients', { n: latest.weighedPatients })}</span></Card>
            <Card label="Reached 5% loss" value={pct(latest.successRatePct)} />
          </div>
        </>
      )}

      {rows.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3">{t('Month')}</th>
                <th className="px-4 py-3">{t('Revenue')}</th>
                <th className="px-4 py-3 text-right">{t('New leads')}</th>
                <th className="px-4 py-3 text-right">{t('New patients')}</th>
                <th className="px-4 py-3 text-right">{t('Ended')}</th>
                <th className="px-4 py-3 text-right">{t('Orders sent')}</th>
                <th className="px-4 py-3 text-right">{t('Check-ins')}</th>
                <th className="px-4 py-3 text-right">{t('Continued / hold / stop')}</th>
                <th className="px-4 py-3 text-right">{t('Avg lost')}</th>
                <th className="px-4 py-3 text-right">{t('Reached 5%')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.month} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{label(r.month)}</td>
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{moneyList(r.revenue)}</td>
                  <td className="px-4 py-3 text-right">{r.newLeads}</td>
                  <td className="px-4 py-3 text-right">{r.newPatients}</td>
                  <td className="px-4 py-3 text-right">{r.subscriptionsEnded}</td>
                  <td className="px-4 py-3 text-right">{r.ordersDispatched}</td>
                  <td className="px-4 py-3 text-right">{r.checkInsReviewed}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">{r.continued} / {r.held} / {r.stopped}</td>
                  <td className="px-4 py-3 text-right">{pct(r.avgLossPct)}</td>
                  <td className="px-4 py-3 text-right">{pct(r.successRatePct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ul className="text-xs text-gray-400 space-y-1 list-disc pl-4">
        <li>{t('Revenue is what Stripe collected in the month, before refunds.')}</li>
        <li>{t('Weight lost is each weight-programme patient’s last check-in of the month against the weight they started at, averaged. Patients who gained weight are included. Reached 5% is the share who had lost at least 5%.')}</li>
        <li>{t('Months are calendar months in UTC.')}</li>
      </ul>
    </div>
  );
}

export default function ReportsPage() {
  const { t } = useI18n();
  // The menu hides this page from other roles, but the address still works: the backend refuses them too.
  if (!hasAccess(['ADMIN'])) return <p className="p-6 text-sm text-gray-400">{t('Only admins can see the monthly report.')}</p>;
  return <Report />;
}
