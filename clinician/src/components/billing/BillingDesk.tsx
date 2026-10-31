'use client';

import { useState } from 'react';
import { useLazyQuery, useMutation, useQuery } from '@apollo/client';
import { DECIDE_REFUND_REQUEST, MARK_ORDER_RETURNED } from '@/graphql/orders';
import { AWAITING_PAYMENT, BILLING_OVERVIEW, BILLING_REFUND_REQUESTS, PAYMENT_FAILURES, REFUND_DECISIONS, REFUND_WHEN_RETURNED, REFUNDS_AWAITING_RETURN, RETRY_PATIENT_PAYMENT } from '@/graphql/billing';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { InlineError } from '@/components/ui/Alert';

const money = (cents: number | null | undefined, currency: string | null | undefined) => {
  if (cents == null) return '—';
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: (currency ?? 'eur').toUpperCase() }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency ?? ''}`;
  }
};

const ORDER_LABEL: Record<string, string> = {
  AWAITING_PAYMENT: 'Awaiting payment', PENDING: 'At the pharmacy', DISPATCHED: 'Shipped', OUT_FOR_DELIVERY: 'Out for delivery', DELIVERED: 'Delivered', CANCELLED: 'Cancelled',
};
const PLAN_LABEL: Record<string, string> = {
  SUBSCRIPTION: 'Subscription (renews every month)', ONE_TIME: 'Pays for each supply (nothing renews)', UNKNOWN: 'No Stripe subscription found',
};

/** Still with the courier: it can still be stopped or come back. */
const WITH_COURIER = ['DISPATCHED', 'OUT_FOR_DELIVERY'];

/** The supply is on its way or delivered: the medicine can no longer be taken back. */
const LEFT_PHARMACY = ['DISPATCHED', 'OUT_FOR_DELIVERY', 'DELIVERED'];

type TabKey = 'refunds' | 'returns' | 'awaiting' | 'failed' | 'history';

/** The money side of the clinic in one place (admin only): refund requests with what the patient paid, unpaid supplies, failed cards, and past decisions. */
export default function BillingDesk() {
  const { t } = useI18n();
  const opts = { pollInterval: 60_000, fetchPolicy: 'cache-and-network' as const };
  const { data: refundData } = useQuery(BILLING_REFUND_REQUESTS, opts);
  const { data: returnsData } = useQuery(REFUNDS_AWAITING_RETURN, opts);
  const { data: awaitingData } = useQuery(AWAITING_PAYMENT, opts);
  const { data: failedData } = useQuery(PAYMENT_FAILURES, opts);
  const { data: historyData } = useQuery(REFUND_DECISIONS, opts);
  const refunds: any[] = refundData?.refundRequests ?? [];
  const returns: any[] = returnsData?.refundsAwaitingReturn ?? [];
  const awaiting: any[] = awaitingData?.awaitingPayment ?? [];
  const failed: any[] = failedData?.paymentFailures ?? [];
  const history: any[] = historyData?.refundDecisions ?? [];

  const [tab, setTab] = useState<TabKey | null>(null);
  // Open on the first tab that has something waiting, so the page opens on what needs doing.
  const active: TabKey = tab ?? (refunds.length ? 'refunds' : returns.length ? 'returns' : awaiting.length ? 'awaiting' : failed.length ? 'failed' : 'refunds');

  const TABS: Array<{ key: TabKey; label: string; n: number; hint: string }> = [
    { key: 'refunds', label: 'Refund requests', n: refunds.length, hint: 'Patients asking for their money back' },
    { key: 'returns', label: 'Waiting for return', n: returns.length, hint: 'Refunds that wait for a parcel to come back' },
    { key: 'awaiting', label: 'Awaiting payment', n: awaiting.length, hint: 'Supplies approved but not yet paid for' },
    { key: 'failed', label: 'Payment failed', n: failed.length, hint: 'Renewals that were declined' },
    { key: 'history', label: 'Decided', n: history.length, hint: 'Refund requests already answered' },
  ];

  return (
    <div>
      <div className="px-4 sm:px-6 pt-4 grid grid-cols-2 lg:grid-cols-5 gap-3">
        {TABS.map((x) => (
          <button key={x.key} type="button" onClick={() => setTab(x.key)}
            aria-pressed={active === x.key}
            className={`text-left rounded-xl border px-4 py-3 transition-colors ${active === x.key ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
            <span className={`block text-2xl font-semibold ${x.n > 0 && x.key !== 'history' ? 'text-gray-900' : 'text-gray-400'}`}>{x.n}</span>
            <span className="block text-sm font-medium text-gray-800">{t(x.label)}</span>
            <span className="block text-xs text-gray-500 mt-0.5">{t(x.hint)}</span>
          </button>
        ))}
      </div>

      <div className="px-4 sm:px-6 py-4">
        {active === 'refunds' && <RefundRequests requests={refunds} />}
        {active === 'returns' && <WaitingForReturn rows={returns} />}
        {active === 'awaiting' && <AwaitingPayment rows={awaiting} />}
        {active === 'failed' && <PaymentFailures rows={failed} />}
        {active === 'history' && <Decisions rows={history} />}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-gray-300 bg-white px-5 py-8 text-center text-sm text-gray-500">{children}</p>;
}

/* ── Refund requests, with what the patient paid so the decision is an informed one ── */
function RefundRequests({ requests }: { requests: any[] }) {
  const { t, timeAgo } = useI18n();
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [endSubscription, setEndSubscription] = useState<Record<string, boolean>>({});
  // Refunding takes two steps: first the consequences are shown, then it is confirmed. A supply that has left the pharmacy
  // also needs the admin to say they know the patient keeps the medicine.
  const [confirming, setConfirming] = useState<string | null>(null);
  const [understood, setUnderstood] = useState<Record<string, boolean>>({});
  const [load, { data, loading: loadingOverview, error: overviewError }] = useLazyQuery(BILLING_OVERVIEW, { fetchPolicy: 'network-only' });
  const [decide, { loading }] = useMutation(DECIDE_REFUND_REQUEST, { refetchQueries: [BILLING_REFUND_REQUESTS, REFUNDS_AWAITING_RETURN, REFUND_DECISIONS], onError: (e) => setError(e) });
  const [waitForReturn, { loading: waiting }] = useMutation(REFUND_WHEN_RETURNED, { refetchQueries: [BILLING_REFUND_REQUESTS, REFUNDS_AWAITING_RETURN], onError: (e) => setError(e) });
  const overview = data?.billingOverview;

  if (requests.length === 0) return <Empty>{t('No refund requests waiting. A patient asks from their Settings, and the request appears here.')}</Empty>;

  return (
    <ul className="space-y-3">
      {requests.map((r) => {
        const open = openId === r.id;
        const shown = open && overview?.patientId === r.patientId ? overview : null;
        const latestPaid = shown?.invoices?.find((i: any) => i.status === 'PAID');
        // Only a confirmed "no paid payment": Stripe was reachable and listed none.
        const nothingPaid = !!shown?.invoicesAvailable && !latestPaid;
        const shipped = LEFT_PHARMACY.includes(r.latestOrderStatus);
        const withCourier = WITH_COURIER.includes(r.latestOrderStatus);
        const confirm = confirming === r.id;
        return (
          <li key={r.id} className={`rounded-xl border bg-white overflow-hidden ${open ? 'border-gray-300 shadow-sm' : 'border-gray-200'}`}>
            <div className="px-4 py-3.5 flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-50 text-sm font-semibold text-amber-800" aria-hidden>
                {r.patientName?.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 truncate">{r.patientName} <span className="font-normal text-gray-500">· {r.patientEmail}</span></p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                  {shipped && <span className="rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-800">{t('Already shipped')}</span>}
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-700">{t(r.latestOrderStatus ? (ORDER_LABEL[r.latestOrderStatus] ?? r.latestOrderStatus) : 'No order yet')}</span>
                  <span className="text-gray-500">{t('Asked {when}', { when: timeAgo(r.requestedAt) })}</span>
                </div>
              </div>
              <button type="button" aria-expanded={open} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                onClick={() => { setError(null); setConfirming(null); if (open) setOpenId(null); else { setOpenId(r.id); load({ variables: { patientId: r.patientId } }); } }}>
                {open ? t('Hide details') : t('Review')}
                <svg viewBox="0 0 24 24" className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
              </button>
            </div>

            {open && (
              <div className="border-t border-gray-100 bg-gray-50/60 px-4 py-4 space-y-4 text-sm">
                {loadingOverview && !shown && <p className="text-gray-500">{t('Loading…')}</p>}
                {overviewError && !shown && <InlineError error={overviewError} size="xs" />}
                {shown && <PatientMoney overview={shown} />}
                {shown && shipped && (
                  <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-900">
                    <p className="font-semibold">{t('This supply has already left the pharmacy.')}</p>
                    <p className="mt-0.5 text-sm">{t('Medicine cannot be taken back into stock. If you refund now, the patient keeps the medicine and you lose both the money and the medicine. Ask the courier to stop or return the parcel, or decline.')}</p>
                  </div>
                )}
                {shown && !shown.refundPreview && !nothingPaid && (
                  // No preview, but not because nothing was paid: Stripe couldn't be read, or the preview failed. Saying "nothing
                  // to refund" here could lead an admin to decline a request that should be refunded.
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-amber-900">{t('Payments could not be checked')}</p>
                      <p className="mt-0.5 text-amber-900/80">{t('Stripe could not be read, so we can’t show what a refund would return. Try again before deciding.')}</p>
                    </div>
                    <button type="button" disabled={loadingOverview} className="px-3 py-1.5 border border-gray-300 bg-white text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-40" onClick={() => { setError(null); load({ variables: { patientId: r.patientId } }); }}>{loadingOverview ? t('Loading…') : t('Try again')}</button>
                  </div>
                )}
                {shown && !shown.refundPreview && nothingPaid && (
                  // Stripe was read and shows no paid payment; the backend refuses a refund then, so only Decline is offered.
                  <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-gray-900">{t('Nothing to refund')}</p>
                      <p className="mt-0.5 text-gray-600">{t('This patient has no paid payment. Decline the request, and message the patient to explain why.')}</p>
                    </div>
                    <button type="button" disabled={loading} className="px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-40" onClick={() => { setError(null); decide({ variables: { id: r.id, approve: false } }); }}>{t('Decline')}</button>
                  </div>
                )}
                {shown?.refundPreview && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 space-y-3">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <p className="flex-1 min-w-0 text-amber-900">
                        {t('Refunding returns')} <b>{money(shown.refundPreview.amountCents, shown.refundPreview.currency)}</b> {t('to the card ending')} {latestPaid?.cardLast4 ?? '····'}
                        {shown.refundPreview.feeKeptCents > 0 && <> · {t('the prescription fee of')} <b>{money(shown.refundPreview.feeKeptCents, shown.refundPreview.currency)}</b> {t('is kept, because the doctor’s work cannot be undone')}</>}
                      </p>
                      <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" checked={endSubscription[r.id] ?? true} onChange={(e) => setEndSubscription({ ...endSubscription, [r.id]: e.target.checked })} />
                        {t('End the subscription')}
                      </label>
                      {!confirm && (
                        <div className="flex items-center gap-3">
                          <button type="button" disabled={loading} className="px-3 py-1.5 border border-gray-300 bg-white text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-40" onClick={() => { setError(null); decide({ variables: { id: r.id, approve: false } }); }}>{t('Decline')}</button>
                          <button type="button" disabled={loading} className="px-3 py-1.5 bg-danger-500 text-white text-sm font-medium rounded-lg disabled:opacity-40" onClick={() => { setError(null); setConfirming(r.id); }}>{t('Refund last payment')}</button>
                        </div>
                      )}
                    </div>
                    {confirm && (
                      <div className="rounded-md border border-red-200 bg-white px-3 py-3 space-y-2" role="group" aria-label={t('Confirm the refund')}>
                        <p className="text-sm text-gray-900">
                          {t('This returns the money to the card and')} {(endSubscription[r.id] ?? true) ? t('ends the subscription now, cancels supplies that have not shipped, and cannot be undone.') : t('leaves the subscription running. It cannot be undone.')}
                        </p>
                        {shipped && (
                          <label className="flex items-start gap-2 text-sm text-red-900">
                            <input type="checkbox" className="mt-0.5" checked={!!understood[r.id]} onChange={(e) => setUnderstood({ ...understood, [r.id]: e.target.checked })} />
                            {t('I understand the medicine has shipped and the patient keeps it.')}
                          </label>
                        )}
                        {withCourier && (
                          <div className="rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-900">
                            <p>{t('The parcel is still with the courier. The safer choice is to refund once it is back: the patient is told not to open it, and the refund is made on its own when the parcel is reported returned.')}</p>
                            <button type="button" disabled={waiting} className="mt-2 px-3 py-1.5 bg-emerald-600 text-white text-sm rounded-lg disabled:opacity-40"
                              onClick={() => { setError(null); setConfirming(null); waitForReturn({ variables: { id: r.id, endSubscription: endSubscription[r.id] ?? true } }); }}>{t('Refund when the parcel is returned')}</button>
                          </div>
                        )}
                        <div className="flex items-center gap-3">
                          <button type="button" disabled={loading || (shipped && !understood[r.id])} className="px-3 py-1.5 bg-danger-500 text-white text-sm rounded-lg disabled:opacity-40"
                            onClick={() => { setError(null); setConfirming(null); decide({ variables: { id: r.id, approve: true, endSubscription: endSubscription[r.id] ?? true } }); }}>{t('Yes, refund')}</button>
                          <button type="button" className="text-xs text-gray-600 hover:text-gray-900" onClick={() => setConfirming(null)}>{t('Back')}</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </li>
        );
      })}
      <InlineError error={error} size="xs" />
    </ul>
  );
}

/** How one patient pays and what they have paid, supplied and asked for before. */
function PatientMoney({ overview }: { overview: any }) {
  const { t, fmt } = useI18n();
  const d = (x?: string | null) => (x ? fmt(x, 'd MMM yyyy') : '—');
  const sub = overview.subscription;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div className="rounded-lg border border-gray-200 bg-white p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('How they pay')}</p>
        <p className="mt-1 text-gray-900">{t(PLAN_LABEL[overview.plan] ?? overview.plan)}</p>
        {sub && (
          <p className="text-xs text-gray-600 mt-0.5">
            {t('Subscription')}: {sub.status}{sub.endsAtPeriodEnd ? ` · ${t('stopped, ends')} ${d(sub.endsAt)}` : ''}
          </p>
        )}
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('Earlier refund requests')}</p>
        {overview.refundHistory.length <= 1 ? <p className="mt-1 text-gray-600">{t('None before this one')}</p> : (
          <ul className="mt-1 space-y-0.5 text-xs text-gray-600">
            {overview.refundHistory.filter((x: any) => x.status !== 'REQUESTED').map((x: any) => (
              <li key={x.id}>{d(x.requestedAt)} · {x.status === 'APPROVED' ? t('Refunded') : t('Declined')}{x.outcome ? ` · ${x.outcome}` : ''}</li>
            ))}
          </ul>
        )}
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('Payments')}</p>
        {!overview.invoicesAvailable && <p className="mt-1 text-xs text-amber-700">{t('Stripe could not be reached, so this list may be incomplete.')}</p>}
        {overview.invoices.length === 0 ? <p className="mt-1 text-gray-600">{t('No payments found')}</p> : (
          <ul className="mt-1 divide-y divide-gray-100">
            {overview.invoices.map((i: any) => (
              <li key={i.id} className="py-1.5 flex items-center gap-3 text-xs">
                <span className="w-24 text-gray-600">{d(i.createdAt)}</span>
                <span className="w-20 font-semibold text-gray-900">{money(i.amountCents, i.currency)}</span>
                <span className={i.status === 'PAID' ? 'text-emerald-700' : 'text-amber-700'}>{i.status === 'PAID' ? t('Paid') : t('Unpaid')}</span>
                <span className="text-gray-500 truncate">{i.cardLast4 ? `${i.cardBrand ?? ''} ••${i.cardLast4}` : ''}{i.description ? ` · ${i.description}` : ''}</span>
                {i.viewUrl && <a className="ml-auto text-brand-600 hover:underline" href={i.viewUrl} target="_blank" rel="noreferrer">{t('Open')}</a>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('Supplies')}</p>
        {overview.orders.length === 0 ? <p className="mt-1 text-gray-600">{t('No orders yet')}</p> : (
          <ul className="mt-1 divide-y divide-gray-100">
            {overview.orders.map((o: any) => (
              <li key={o.id} className="py-1.5 flex items-center gap-3 text-xs">
                <span className="w-16 text-gray-600">#{o.sequence}</span>
                <span className="w-32 font-medium text-gray-900">{t(ORDER_LABEL[o.status] ?? o.status)}</span>
                <span className="text-gray-500">{d(o.createdAt)}{o.dispatchedAt ? ` → ${t('shipped')} ${d(o.dispatchedAt)}` : ''}{o.paidAt ? ` · ${t('paid')} ${d(o.paidAt)}` : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ── Supplies a doctor approved that the patient has not paid for ── */
function AwaitingPayment({ rows }: { rows: any[] }) {
  const { t, timeAgo } = useI18n();
  const [copied, setCopied] = useState<string | null>(null);
  if (rows.length === 0) return <Empty>{t('Nothing is waiting for a payment. A repeat for a patient who pays for each supply waits here until they have paid.')}</Empty>;
  return (
    <ul className="space-y-3">
      {rows.map((o) => (
        <li key={o.orderId} className="rounded-lg border border-gray-200 bg-white px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900">{o.patientName} <span className="font-normal text-gray-500">· {o.patientEmail}</span></p>
            <p className="text-xs text-gray-600">
              {[o.medication, o.dosage].filter(Boolean).join(' ')} · {t('repeat')} {Math.max(o.sequence - 1, 1)} · {o.reference} · {t('approved')} {timeAgo(o.createdAt)}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{o.reminderSentAt ? `${t('Reminder sent')} ${timeAgo(o.reminderSentAt)}` : t('No reminder sent yet (it goes out after 3 days)')}</p>
          </div>
          <span className="text-sm font-semibold text-gray-900">{money(o.paymentAmountCents, o.paymentCurrency)}</span>
          {o.paymentUrl ? (
            <>
              <button type="button" className="text-xs font-medium text-brand-600 hover:text-brand-700"
                onClick={() => { void navigator.clipboard?.writeText(o.paymentUrl).then(() => { setCopied(o.orderId); setTimeout(() => setCopied(null), 2000); }).catch(() => undefined); }}>
                {copied === o.orderId ? t('Copied') : t('Copy payment link')}
              </button>
              <a className="text-xs font-medium text-gray-600 hover:text-gray-900" href={o.paymentUrl} target="_blank" rel="noreferrer">{t('Open')}</a>
            </>
          ) : <span className="text-xs text-amber-700">{t('Payment link is still being made')}</span>}
        </li>
      ))}
    </ul>
  );
}

/* ── Declined renewals ── */
function PaymentFailures({ rows }: { rows: any[] }) {
  const { t, timeAgo } = useI18n();
  const [retry, { loading }] = useMutation(RETRY_PATIENT_PAYMENT, { refetchQueries: [PAYMENT_FAILURES] });
  const [note, setNote] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  if (rows.length === 0) return <Empty>{t('No failed payments. When a renewal is declined, the patient is listed here and no further supply is ordered for them.')}</Empty>;
  return (
    <ul className="space-y-3">
      {rows.map((p) => (
        <li key={p.patientId} className="rounded-lg border border-red-200 bg-white px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900">{p.patientName} <span className="font-normal text-gray-500">· {p.patientEmail}</span></p>
            <p className="text-xs text-gray-600">{t('Payment failed')} {timeAgo(p.failedAt)} · {t('they were emailed to update their card; no further supply is ordered until a payment goes through')}</p>
            {note[p.patientId] && <p className="text-xs text-emerald-700 mt-0.5">{note[p.patientId]}</p>}
          </div>
          <button type="button" disabled={loading} className="px-3 py-1.5 border border-gray-300 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-40"
            onClick={async () => {
              setError(null);
              try { const r = await retry({ variables: { patientId: p.patientId } }); setNote({ ...note, [p.patientId]: r.data?.retryPatientPayment ?? '' }); } catch (e) { setError(e); }
            }}>{t('Try the payment again')}</button>
        </li>
      ))}
      <InlineError error={error} size="xs" />
    </ul>
  );
}

/* ── What was decided, by whom, and what happened to the money ── */
function Decisions({ rows }: { rows: any[] }) {
  const { t, fmt } = useI18n();
  if (rows.length === 0) return <Empty>{t('No refund requests have been decided yet.')}</Empty>;
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
          <tr><th className="px-4 py-2 text-left">{t('Patient')}</th><th className="px-4 py-2 text-left">{t('Asked')}</th><th className="px-4 py-2 text-left">{t('Decided')}</th><th className="px-4 py-2 text-left">{t('Result')}</th><th className="px-4 py-2 text-left">{t('Decided by')}</th></tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="px-4 py-2"><span className="font-medium text-gray-900">{r.patientName}</span><span className="block text-xs text-gray-500">{r.patientEmail}</span></td>
              <td className="px-4 py-2 text-gray-600">{fmt(r.requestedAt, 'd MMM yyyy')}</td>
              <td className="px-4 py-2 text-gray-600">{r.decidedAt ? fmt(r.decidedAt, 'd MMM yyyy') : '—'}</td>
              <td className="px-4 py-2"><span className={r.status === 'APPROVED' ? 'text-emerald-700 font-medium' : 'text-gray-600'}>{r.status === 'APPROVED' ? t('Refunded') : t('Declined')}</span>{r.outcome && <span className="block text-xs text-gray-500">{r.outcome}</span>}</td>
              <td className="px-4 py-2 text-gray-600">{r.decidedByName ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Refunds that wait for a parcel to come back ── */
const TRACKING_LABEL: Record<string, string> = {
  READY_FOR_PICKUP: 'Packed, waiting for the courier', PICKED_UP: 'Collected by the courier', IN_TRANSIT: 'On its way', OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered', DELIVERY_FAILED: 'Delivery attempt failed', RETURNED: 'Returned to the pharmacy', EXCEPTION: 'Delivery problem',
};

function WaitingForReturn({ rows }: { rows: any[] }) {
  const { t, timeAgo } = useI18n();
  const [error, setError] = useState<unknown>(null);
  const refresh = [BILLING_REFUND_REQUESTS, REFUNDS_AWAITING_RETURN, REFUND_DECISIONS];
  const [returned, { loading: marking }] = useMutation(MARK_ORDER_RETURNED, { refetchQueries: refresh, onError: (e) => setError(e) });
  const [decide, { loading: deciding }] = useMutation(DECIDE_REFUND_REQUEST, { refetchQueries: refresh, onError: (e) => setError(e) });
  const [sure, setSure] = useState<string | null>(null);
  if (rows.length === 0) return <Empty>{t('No refunds are waiting for a parcel. From a refund request whose parcel is with the courier, choose “Refund when the parcel is returned”.')}</Empty>;
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.id} className="rounded-lg border border-emerald-200 bg-white px-4 py-3 space-y-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900">{r.patientName} <span className="font-normal text-gray-500">· {r.patientEmail}</span></p>
              <p className="text-xs text-gray-600">
                {[r.carrier, r.trackingNumber].filter(Boolean).join(' ') || t('No tracking recorded')} · {r.latestTrackingStatus ? t(TRACKING_LABEL[r.latestTrackingStatus] ?? r.latestTrackingStatus) : t(ORDER_LABEL[r.orderStatus] ?? r.orderStatus ?? '')} · {t('waiting since')} {timeAgo(r.requestedAt)}
              </p>
              {r.trackingUrl && <a className="text-xs text-brand-600 hover:underline" href={r.trackingUrl} target="_blank" rel="noreferrer">{t('Track the parcel')}</a>}
            </div>
            {r.awaitingOrderId && (
              <button type="button" disabled={marking} className="px-3 py-1.5 bg-emerald-600 text-white text-sm rounded-lg disabled:opacity-40"
                onClick={() => { setError(null); returned({ variables: { id: r.awaitingOrderId } }); }}>{t('The parcel came back')}</button>
            )}
          </div>
          <p className="text-xs text-gray-500">{t('The refund is made on its own when the courier reports the parcel returned, or when you press the button above. If it is delivered instead, the request returns to Refund requests for you to decide.')}</p>
          <div className="flex items-center gap-4 text-xs">
            {sure === r.id ? (
              <>
                <span className="text-red-800">{t('The patient keeps the medicine and is refunded now. Sure?')}</span>
                <button type="button" disabled={deciding} className="font-semibold text-red-700" onClick={() => { setError(null); setSure(null); decide({ variables: { id: r.id, approve: true, endSubscription: true } }); }}>{t('Yes, refund now')}</button>
                <button type="button" className="text-gray-600" onClick={() => setSure(null)}>{t('Back')}</button>
              </>
            ) : (
              <>
                <button type="button" className="text-red-700 hover:underline" onClick={() => setSure(r.id)}>{t('Refund now anyway')}</button>
                <button type="button" disabled={deciding} className="text-gray-600 hover:underline" onClick={() => { setError(null); decide({ variables: { id: r.id, approve: false } }); }}>{t('Decline')}</button>
              </>
            )}
          </div>
        </li>
      ))}
      <InlineError error={error} size="xs" />
    </ul>
  );
}
