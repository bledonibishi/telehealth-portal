'use client';

import { useQuery } from '@apollo/client';
import { format } from 'date-fns';
import { MY_INVOICES } from '@/graphql/billing';
import { Card, CardHeader } from '@/components/portal/Card';
import { ManageSubscriptionButton } from './ManageSubscriptionCard';
import { InlineError } from '@/components/common/Alert';
import { LoadingState } from '@telehealth/loading';

type Invoice = { id: string; createdAt: string; amountCents: number; currency: string; status: 'PAID' | 'UNPAID'; description?: string | null; cardBrand?: string | null; cardLast4?: string | null; viewUrl?: string | null; pdfUrl?: string | null };

const money = (cents: number, currency: string) => {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
};
const brand = (b?: string | null) => (b ? b.charAt(0).toUpperCase() + b.slice(1) : 'Card');

/** What the patient has paid, with the card used and a PDF of each invoice. Updating the card is in Stripe's portal. */
export function PaymentsCard() {
  const { data, loading, error } = useQuery(MY_INVOICES, { fetchPolicy: 'cache-and-network' });
  const invoices: Invoice[] = data?.myInvoices ?? [];

  return (
    <Card labelledBy="payments-title" className="mt-5">
      <CardHeader id="payments-title" title="Payments & invoices" subtitle="What you’ve paid for your treatment.">
        <ManageSubscriptionButton />
      </CardHeader>

      {loading && !data && <LoadingState variant="inline" label="Loading…" />}
      {!data && <InlineError error={error} />}
      {data && invoices.length === 0 && <p className="text-sm text-slate-500">Your payments will show here, each with a downloadable invoice.</p>}

      {invoices.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {invoices.map((i) => (
            <li key={i.id} className="py-3 first:pt-0 last:pb-0 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink-900">
                  {money(i.amountCents, i.currency)}
                  {i.status === 'UNPAID' && <span className="ml-2 text-xs font-semibold rounded-full px-2 py-0.5 bg-amber-100 text-amber-800">Payment due</span>}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {format(new Date(i.createdAt), 'd MMM yyyy')}
                  {i.status === 'PAID' && i.cardLast4 ? ` · ${brand(i.cardBrand)} •••• ${i.cardLast4}` : ''}
                  {i.description ? ` · ${i.description}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs font-semibold">
                {i.pdfUrl && <a href={i.pdfUrl} target="_blank" rel="noreferrer" className="text-ink-600 hover:text-ink-800">Download PDF</a>}
                {!i.pdfUrl && i.viewUrl && <a href={i.viewUrl} target="_blank" rel="noreferrer" className="text-ink-600 hover:text-ink-800">View invoice</a>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
