'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@apollo/client';
import { format } from 'date-fns';
import { MY_LAB_RESULTS, MY_PRESCRIPTION_HISTORY } from '@/graphql/portal';
import { openAuthedFile } from '@/lib/upload';
import { useCareStage } from '@/lib/useCareStage';
import { ManageSubscriptionButton } from '@/components/billing/ManageSubscriptionCard';
import { Card, CardHeader } from '@/components/portal/Card';
import { PageHeader } from '@/components/portal/PageHeader';
import { Icon } from '@/components/portal/Icon';

const RX_STATUS: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: 'Active', cls: 'bg-emerald-50 text-emerald-700' },
  SUPERSEDED: { label: 'Replaced', cls: 'bg-slate-100 text-slate-600' },
  CANCELLED: { label: 'Cancelled', cls: 'bg-slate-100 text-slate-500' },
  EXPIRED: { label: 'Expired', cls: 'bg-slate-100 text-slate-500' },
};

/** Everything on paper in one place: prescriptions as PDFs, blood results, and invoices (kept by our payment provider). */
export default function DocumentsPage() {
  const { data: rxData, loading } = useQuery(MY_PRESCRIPTION_HISTORY, { fetchPolicy: 'cache-and-network' });
  const { data: labData } = useQuery(MY_LAB_RESULTS, { fetchPolicy: 'cache-and-network' });
  const next = useCareStage();
  const [opening, setOpening] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const prescriptions: any[] = rxData?.myPrescriptions ?? [];
  const labs: any[] = labData?.myLabResults ?? [];

  const open = async (rx: any) => {
    setProblem(null);
    setOpening(rx.id);
    try {
      await openAuthedFile(rx.documentUrl);
    } catch (err: any) {
      setProblem(err?.message ?? 'Couldn’t open that document.');
    } finally {
      setOpening(null);
    }
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 pb-8 max-w-4xl space-y-5">
      <PageHeader title="Documents" subtitle="Your prescriptions, results and invoices." />

      <Card>
        <CardHeader title="Prescriptions" subtitle="Every prescription you’ve had, newest first." href="/prescription" action="Current prescription →" />
        {loading && !prescriptions.length && <p className="text-sm text-slate-400">Loading…</p>}
        {!loading && !prescriptions.length && (
          <p className="text-sm text-slate-500">
            Your prescriptions appear here once a doctor has issued one. {next.stage !== 'TREATING' && next.stage !== 'LOADING' && <>{next.title}. {next.action && <Link href={next.action.href} className="text-ink-600 underline">{next.action.label}</Link>}</>}
          </p>
        )}
        {problem && <p role="alert" className="text-sm text-red-600 mb-2">{problem}</p>}
        <ul className="divide-y divide-slate-100">
          {prescriptions.map((rx) => (
            <li key={rx.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
              <span className="w-10 h-10 rounded-xl bg-ink-50 text-ink-700 flex items-center justify-center flex-shrink-0"><Icon name="rx" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink-900 truncate">{rx.medication} {rx.dosage}</p>
                <p className="text-xs text-slate-500">
                  Issued {format(new Date(rx.issuedAt), 'd MMM yyyy')}
                  {rx.validUntil ? ` · valid until ${format(new Date(rx.validUntil), 'd MMM yyyy')}` : ''}
                  {rx.prescriber ? ` · Dr. ${rx.prescriber.firstName} ${rx.prescriber.lastName}` : ''}
                </p>
              </div>
              <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${RX_STATUS[rx.status]?.cls ?? 'bg-slate-100 text-slate-600'}`}>{RX_STATUS[rx.status]?.label ?? rx.status}</span>
              <button type="button" onClick={() => open(rx)} disabled={opening === rx.id} className="text-xs font-semibold text-ink-600 hover:text-ink-800 border border-slate-200 rounded-lg px-3 py-1.5 disabled:opacity-50">
                {opening === rx.id ? 'Opening…' : 'Open PDF'}
              </button>
            </li>
          ))}
        </ul>
      </Card>

      {labs.length > 0 && (
        <Card>
          <CardHeader title="Laboratory results" subtitle="Entered by your care team from your blood tests." />
          <ul className="divide-y divide-slate-100">
            {labs.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink-900">{l.analyteName ?? l.kind.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c: string) => c.toUpperCase())}</p>
                  <p className="text-xs text-slate-500">Taken {format(new Date(l.collectedAt), 'd MMM yyyy')}{l.referenceRangeLow != null && l.referenceRangeHigh != null ? ` · usual range ${l.referenceRangeLow}–${l.referenceRangeHigh} ${l.unit}` : ''}</p>
                </div>
                <p className={`text-sm font-bold ${l.flagged ? 'text-amber-700' : 'text-ink-900'}`}>{l.value} {l.unit}{l.flagged && <span className="ml-2 text-[11px] font-semibold rounded-full bg-amber-50 px-2 py-0.5">Your doctor is reviewing</span>}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader title="Invoices & payments" subtitle="Receipts, payment history and your saved card are kept by our payment provider." />
        <div className="flex"><ManageSubscriptionButton /></div>
      </Card>

      <p className="text-xs text-slate-500">Need a consultation summary or another document? <Link href="/messages" className="text-ink-600 underline">Ask your care team</Link>.</p>
    </div>
  );
}
