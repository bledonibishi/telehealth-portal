'use client';

import { useState } from 'react';
import { useMutation } from '@apollo/client';
import type { DocumentNode } from 'graphql';
import { CANCEL_ORDER, DISPATCH_ORDER, MARK_ORDER_DELIVERED, MARK_ORDER_HANDED_OVER, MARK_ORDER_OUT_FOR_DELIVERY, MARK_ORDER_READY_FOR_PICKUP, REPORT_ORDER_CANNOT_FULFIL, UPDATE_ORDER_SHIPPING } from '@/graphql/orders';
import { openAuthedDocument } from '@/lib/documents';
import { hasAccess } from '@/lib/role';
import { useI18n } from '@/lib/i18n/I18nProvider';
import PartnerStatus from './PartnerStatus';
import { TRACKING_LABEL, openProblem, overdueSince } from '@/lib/tracking';
import { printPackingSlip } from '@/lib/packing-slip';

const KIND_BADGE: Record<string, string> = {
  HRT: 'bg-violet-100 text-violet-700',
  GLP1: 'bg-teal-100 text-teal-700',
};

const STAGES = ['Preparing', 'Shipped', 'Out for delivery', 'Delivered'] as const;
const STAGE_OF: Record<string, number> = { PENDING: 0, DISPATCHED: 1, OUT_FOR_DELIVERY: 2, DELIVERED: 3 };

const inputCls = 'border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';
const actionCls = 'px-3 py-1.5 border border-gray-200 text-sm text-gray-700 rounded-lg hover:bg-gray-100 disabled:opacity-40';

export function orderStage(order: { status: string }) {
  return STAGE_OF[order.status] ?? -1;
}

/**
 * The order's journey as four steps: done steps are filled with a tick, the current one is ringed, and the
 * date each step happened sits under it. While it is on its way, the expected delivery date sits under the last one.
 */
function StageTracker({ order, expected }: { order: any; expected: string | null }) {
  const { t, fmt } = useI18n();
  const current = orderStage(order);
  const delivered = current === 3;
  const when = [order.createdAt, order.dispatchedAt, order.outForDeliveryAt, order.deliveredAt];
  return (
    <ol className="grid grid-cols-4 max-w-xl" aria-label={t('Order progress')}>
      {STAGES.map((stage, i) => {
        const done = i < current || delivered;
        const here = i === current && !delivered;
        const tone = delivered ? 'bg-green-600 border-green-600' : 'bg-brand-500 border-brand-500';
        return (
          <li key={stage} className="relative flex flex-col items-center text-center" aria-current={here ? 'step' : undefined}>
            {i < STAGES.length - 1 && (
              <span className={`absolute top-[11px] left-1/2 w-full h-0.5 ${i < current ? (delivered ? 'bg-green-600' : 'bg-brand-500') : 'bg-gray-200'}`} aria-hidden />
            )}
            <span
              className={`relative z-10 flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 ${
                done ? `${tone} text-white` : here ? 'border-brand-500 bg-white ring-4 ring-brand-50' : 'border-gray-300 bg-white'
              }`}
            >
              {done ? (
                <svg viewBox="0 0 20 20" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"><path d="M4 10.5l4 4 8-9" strokeLinecap="round" strokeLinejoin="round" /></svg>
              ) : here ? (
                <span className="h-2 w-2 rounded-full bg-brand-500" />
              ) : null}
            </span>
            <span className={`mt-1.5 text-xs leading-tight ${done || here ? 'font-semibold text-gray-800' : 'text-gray-400'}`}>{t(stage)}</span>
            <span className="mt-0.5 text-[11px] leading-tight text-gray-400">
              {when[i] && (done || here) ? fmt(when[i], 'd MMM') : i === 3 && expected ? <span className="text-brand-500">{t('Expected {when}', { when: expected })}</span> : '\u00a0'}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** One labelled block of facts: a small heading, then the content. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">{label}</p>
      <div className="text-sm text-gray-700 space-y-0.5">{children}</div>
    </div>
  );
}

function formatAddress(a: any) {
  if (!a?.addressLine1) return null;
  return [a.addressLine1, a.addressLine2, a.city, a.postcode, a.country].filter(Boolean).join(', ');
}

/** One order (a single supply of a prescription) with the pharmacy's actions. */
export function OrderCard({
  order, showPatient = true, refetchQueries = [],
}: {
  order: any;
  showPatient?: boolean;
  refetchQueries?: { query: DocumentNode; variables?: Record<string, unknown> }[];
}) {
  const { t, timeAgo, fmt } = useI18n();
  const [mode, setMode] = useState<'dispatch' | 'edit' | 'cancel' | 'issue' | 'handover' | null>(null);
  const [pharmacyRef, setPharmacyRef] = useState('');
  const [carrier, setCarrier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackingUrl, setTrackingUrl] = useState('');
  const [expectedFrom, setExpectedFrom] = useState('');
  const [expectedTo, setExpectedTo] = useState('');
  const [reason, setReason] = useState('');
  const [issueReason, setIssueReason] = useState('');
  // A first order that is cancelled normally means the patient never got what they paid for, so refunding is the default.
  const [refund, setRefund] = useState(order.sequence === 1);
  const [endSubscription, setEndSubscription] = useState(order.sequence === 1);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const opts = { refetchQueries, onCompleted: () => setMode(null), onError: (e: Error) => setError(e.message) };
  const [dispatch, { loading: dispatching }] = useMutation(DISPATCH_ORDER, opts);
  const [ship, { loading: shipping }] = useMutation(MARK_ORDER_OUT_FOR_DELIVERY, opts);
  const [markReady, { loading: markingReady }] = useMutation(MARK_ORDER_READY_FOR_PICKUP, opts);
  const [handOver, { loading: handingOver }] = useMutation(MARK_ORDER_HANDED_OVER, opts);
  const [updateShipping, { loading: updatingShipping }] = useMutation(UPDATE_ORDER_SHIPPING, opts);
  const [deliver, { loading: delivering }] = useMutation(MARK_ORDER_DELIVERED, opts);
  const [cancel, { loading: cancelling }] = useMutation(CANCEL_ORDER, opts);
  const [reportIssue, { loading: reporting }] = useMutation(REPORT_ORDER_CANNOT_FULFIL, { ...opts, onCompleted: () => { setMode(null); setIssueReason(''); } });

  const canFulfil = hasAccess(['ADMIN', 'PROVIDER']);
  // Delivery is ours, not the pharmacy's: only our own team enters the courier and tracking, says it has shipped, and
  // says by hand that it is out or arrived. The pharmacy packs the order and marks it ready, nothing more.
  const canConfirmDelivery = hasAccess(['ADMIN']);
  // Cancelling carries a refund decision: ours. The pharmacy reports that it can't supply an order instead.
  const canCancel = hasAccess(['ADMIN', 'DOCTOR']);
  const rx = order.prescription;
  const kind = rx.consultation?.kind;
  const stage = orderStage(order);
  const cancelled = order.status === 'CANCELLED';
  const coldChain = rx.items?.some((i: any) => i.product.requiresColdChain);
  // Dispatched orders show where they went; pending ones where they will go.
  const address = formatAddress(order.shippingAddress ?? order.patient);
  // The pharmacy is not told where the parcel goes (the courier is ours), so a missing address only blocks our own team.
  const addressMissing = !address && canConfirmDelivery;
  const rxBlocked = rx.status !== 'ACTIVE' || (rx.validUntil && new Date(rx.validUntil) < new Date());

  const run = (fn: () => void) => { setError(''); fn(); };
  const problem = openProblem(order.trackingEvents);
  const overdue = overdueSince(order);

  // Dates are kept at midday UTC, so the day stays the same whatever time zone the server or patient is in.
  const toDate = (day: string) => (day ? `${day}T12:00:00.000Z` : null);
  const shippingVars = () => ({
    carrier: carrier.trim() || null,
    trackingNumber: trackingNumber.trim() || null,
    trackingUrl: trackingUrl.trim() || null,
    estimatedDeliveryFrom: toDate(expectedFrom),
    estimatedDeliveryTo: toDate(expectedTo || expectedFrom),
  });
  const openShippingForm = (next: 'dispatch' | 'edit') => {
    setCarrier(order.carrier ?? '');
    setTrackingNumber(order.trackingNumber ?? '');
    setTrackingUrl(order.trackingUrl ?? '');
    setExpectedFrom(order.estimatedDeliveryFrom ? String(order.estimatedDeliveryFrom).slice(0, 10) : '');
    setExpectedTo(order.estimatedDeliveryTo ? String(order.estimatedDeliveryTo).slice(0, 10) : '');
    setMode(next);
  };
  const shippingForm = mode === 'dispatch' || mode === 'edit';
  const expected =
    order.estimatedDeliveryFrom || order.estimatedDeliveryTo
      ? [order.estimatedDeliveryFrom, order.estimatedDeliveryTo]
          .filter(Boolean)
          .map((d: string) => fmt(d, 'EEE d MMM'))
          .filter((d: string, i: number, all: string[]) => all.indexOf(d) === i)
          .join(' – ')
      : null;

  // One status for the header, most urgent first.
  const pill = cancelled
    ? { label: 'Cancelled', cls: 'bg-gray-100 text-gray-600' }
    : order.status !== 'DELIVERED' && problem
    ? { label: 'Problem', cls: 'bg-danger-50 text-danger-900 ring-1 ring-danger-500/30' }
    : overdue
    ? { label: 'Overdue', cls: 'bg-warn-50 text-warn-900 ring-1 ring-warn-500/30' }
    : order.status === 'DELIVERED'
    ? { label: 'Delivered', cls: 'bg-green-50 text-green-700' }
    : order.status === 'OUT_FOR_DELIVERY'
    ? { label: 'Out for delivery', cls: 'bg-blue-50 text-blue-700' }
    : order.status === 'DISPATCHED'
    ? { label: 'Shipped', cls: 'bg-blue-50 text-blue-700' }
    : order.readyForPickupAt
    ? { label: 'Ready for pickup', cls: 'bg-brand-50 text-brand-900' }
    : { label: 'Preparing', cls: 'bg-amber-50 text-amber-700' };

  // Finished orders are history: one line until someone asks for the detail.
  const finished = cancelled || order.status === 'DELIVERED';
  const [open, setOpen] = useState(!finished);
  const showDetail = open || !finished;

  return (
    <div className={`px-6 py-5 bg-white hover:bg-gray-50/60 ${cancelled ? 'opacity-70' : ''}`}>
      <div className="flex items-start gap-6">
        <div className="flex-1 min-w-0">
          {/* Who it is for, where it stands, and the code on the parcel */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {kind && <span className={`text-xs font-semibold px-2 py-0.5 rounded ${KIND_BADGE[kind] ?? 'bg-gray-100 text-gray-600'}`}>{kind}</span>}
            {showPatient && (
              <h3 className="text-[15px] font-semibold text-gray-900">
                {order.patient.firstName} {order.patient.lastName}
                <span className="ml-2 text-xs font-normal text-gray-400">{order.patient.email}</span>
              </h3>
            )}
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${pill.cls}`}>{t(pill.label)}</span>
            <button
              type="button"
              onClick={() => { navigator.clipboard?.writeText(order.reference); setCopied(true); setTimeout(() => setCopied(false), 1800); }}
              title={t('Click to copy the parcel code')}
              aria-label={`${t('Parcel code')} ${order.reference}. ${t('Click to copy the parcel code')}`}
              className={`group inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 text-left transition-colors ${
                copied ? 'border-green-600 bg-green-50' : 'border-gray-300 bg-white hover:border-brand-500 hover:bg-brand-50'
              }`}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{t('Parcel code')}</span>
              <span className="font-mono text-sm font-semibold tracking-wide text-gray-900">{order.reference}</span>
              {copied ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
                  <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M4 10.5l4 4 8-9" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  {t('Copied!')}
                </span>
              ) : (
                <svg viewBox="0 0 20 20" className="h-4 w-4 text-gray-400 group-hover:text-brand-500" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                  <rect x="7" y="7" width="9" height="9" rx="1.5" />
                  <path d="M13 7V5.5A1.5 1.5 0 0011.5 4h-6A1.5 1.5 0 004 5.5v6A1.5 1.5 0 005.5 13H7" strokeLinecap="round" />
                </svg>
              )}
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-400">
            {order.sequence === 1 ? t('First supply') : t('Repeat {n}', { n: order.sequence - 1 })}
            {coldChain && <span className="ml-2 font-medium text-blue-700">· {t('Cold chain')}</span>}
            {finished && !showDetail && (
              <>
                <span> · {rx.medication}</span>
                {order.deliveredAt && <span> · {t('Delivered {date}', { date: fmt(order.deliveredAt, 'dd MMM yyyy') })}</span>}
                {cancelled && order.cancelReason && <span> · {t('Cancelled:')} {order.cancelReason}</span>}
              </>
            )}
          </p>

          {finished && (
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={showDetail} className="mt-1 text-xs font-medium text-brand-500 hover:underline">
              {showDetail ? t('Hide details') : t('Show details')}
            </button>
          )}

          {showDetail && (
            <>
              {!cancelled && <div className="mt-4"><StageTracker order={order} expected={expected && !order.deliveredAt ? expected : null} /></div>}

              {!cancelled && order.status === 'PENDING' && order.readyForPickupAt && (
                <p className="mt-3 text-xs font-medium text-brand-900 bg-brand-50 rounded-lg px-3 py-1.5 inline-block">
                  {t('Packed, waiting for the courier')} · {t('since {when}', { when: timeAgo(order.readyForPickupAt) })} · {t('they should quote')} <span className="font-mono">{order.reference}</span>
                </p>
              )}
              {!cancelled && !problem && overdue && (
                <div role="alert" className="mt-3 rounded-lg border border-warn-500 bg-warn-50 px-3 py-2 text-xs text-warn-900">
                  <p className="font-semibold">{t('Past its expected delivery date ({date}). Check with the courier.', { date: fmt(overdue, 'EEE d MMM') })}</p>
                </div>
              )}
              {!cancelled && order.status !== 'DELIVERED' && problem && (
                <div role="alert" className="mt-3 rounded-lg border border-danger-500 bg-danger-50 px-3 py-2 text-xs text-danger-900">
                  <p className="font-semibold">{t(TRACKING_LABEL[problem.status] ?? problem.status)} · {timeAgo(problem.occurredAt)}</p>
                  {(problem.note || problem.location) && <p className="mt-0.5">{[problem.note, problem.location].filter(Boolean).join(' · ')}</p>}
                  <p className="mt-0.5 text-danger-500">
                    {problem.status === 'CANNOT_FULFIL'
                      ? canCancel
                        ? t('Decide whether to cancel and refund the patient, or ask the pharmacy again.')
                        : t('Reported to our team. We’ll be in touch.')
                      : t('Contact the courier or the patient to sort it out.')}
                  </p>
                </div>
              )}
              {cancelled && order.cancelReason && <p className="mt-3 text-xs text-danger-500">{t('Cancelled:')} {order.cancelReason}</p>}
              {cancelled && order.cancelBillingNote && canConfirmDelivery && <p className="mt-1 text-xs text-gray-500">{order.cancelBillingNote}</p>}
              {!cancelled && stage === 0 && rxBlocked && (
                <p className="mt-3 text-xs text-danger-500 font-medium">{t('The prescription is {state} — do not dispense.', { state: rx.status === 'ACTIVE' ? t('expired') : t(rx.status.toLowerCase()) })}</p>
              )}

              {/* The three things the pharmacy and our team look for: what, where, and how it is travelling */}
              <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-3">
                <Fact label={t('Medicine')}>
                  <p className="font-medium text-gray-900">{rx.medication}</p>
                  <p className="text-gray-500">{rx.dosage}</p>
                  {rx.instructions && <p className="text-xs text-gray-400 whitespace-pre-line line-clamp-3" title={rx.instructions}>{rx.instructions}</p>}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1.5">
                    <button
                      type="button"
                      onClick={() => openAuthedDocument(rx.documentUrl)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-brand-500 px-2.5 py-1 text-xs font-semibold text-brand-500 hover:bg-brand-50"
                    >
                      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M5 2.5h6.5L15 6v11.5H5z" strokeLinejoin="round" /><path d="M11 2.5V6h4M7.5 10h5M7.5 13h5" strokeLinecap="round" /></svg>
                      {t('Open prescription')}
                    </button>
                    {rx.validUntil && <span className="text-xs text-gray-400">{t('Valid until {date}', { date: fmt(rx.validUntil, 'dd MMM yyyy') })}</span>}
                  </div>
                </Fact>
                <Fact label={t('Deliver to')}>
                  {address ? (
                    <>
                      <p className="font-medium text-gray-900">{order.shippingAddress?.name || `${order.patient.firstName} ${order.patient.lastName}`}</p>
                      <p className="text-gray-600">{address}</p>
                      {(order.shippingAddress?.phone || order.patient.phone) && <p className="text-gray-500">{order.shippingAddress?.phone || order.patient.phone}</p>}
                    </>
                  ) : canConfirmDelivery ? (
                    <p className="font-medium text-danger-500">{t('No delivery address on file — ask the patient to add one before dispatch')}</p>
                  ) : (
                    <>
                      <p className="font-medium text-gray-900">{`${order.patient.firstName} ${order.patient.lastName}`}</p>
                      <p className="text-gray-500">{t('Our courier delivers it. You hand the parcel over, nothing else.')}</p>
                    </>
                  )}
                </Fact>
                <Fact label={t('Delivery')}>
                  {order.deliveredAt ? (
                    <p className="font-medium text-gray-900">{t('Delivered {date}', { date: fmt(order.deliveredAt, 'dd MMM yyyy') })}</p>
                  ) : expected ? (
                    <p className="font-medium text-gray-900">{t('Expected {when}', { when: expected })}</p>
                  ) : order.status === 'PENDING' ? (
                    <p className="text-gray-400">{t('Not shipped yet')}</p>
                  ) : null}
                  {(order.carrier || order.trackingNumber || order.trackingUrl) && (
                    <p className="text-gray-600">
                      {order.carrier && <span>{order.carrier}</span>}
                      {order.trackingNumber && <span className="ml-1.5 font-mono text-xs text-gray-500">{order.trackingNumber}</span>}
                      {order.trackingUrl && (
                        <a href={order.trackingUrl} target="_blank" rel="noreferrer" className="ml-2 text-brand-500 hover:text-brand-900">{t('Track package →')}</a>
                      )}
                    </p>
                  )}
                </Fact>
              </div>

              {canConfirmDelivery && <PartnerStatus order={order} />}

              {/* The small print */}
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
                <span>{t('Ordered {when}', { when: timeAgo(order.createdAt) })}</span>
                {order.pharmacyRef && <span>{t('Ref:')} <span className="font-mono text-gray-500">{order.pharmacyRef}</span></span>}
              </div>

              {order.trackingEvents?.length > 0 && (
                <details className="mt-2 text-xs text-gray-500">
                  <summary className="cursor-pointer hover:text-gray-700">{t('Tracking history ({n})', { n: order.trackingEvents.length })}</summary>
                  <ul className="mt-1.5 space-y-1 border-l border-gray-200 pl-3">
                    {order.trackingEvents.map((e: any) => (
                      <li key={e.id}>
                        <span className="font-medium text-gray-700">{t(TRACKING_LABEL[e.status] ?? e.status)}</span>
                        <span className="text-gray-400"> · {fmt(e.occurredAt, 'dd MMM, HH:mm')}{e.location ? ` · ${e.location}` : ''}{e.source && e.source !== 'MANUAL' ? ` · ${t('from the courier')}` : ''}</span>
                        {e.note && <span className="block text-gray-400">{e.note}</span>}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
          {error && <p className="mt-2 text-xs text-danger-500">{error}</p>}

          {shippingForm && (
            <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
              <p className="text-sm font-medium text-gray-800">{mode === 'dispatch' ? t('Ship this order') : t('Courier and tracking')}</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-xs font-medium text-gray-600 mb-1">{t('Courier')}</span>
                  <input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="DHL, Post…" className={`${inputCls} w-full`} autoFocus />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-gray-600 mb-1">{t('Tracking number')}</span>
                  <input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} className={`${inputCls} w-full`} />
                </label>
              </div>
              <label className="block">
                <span className="block text-xs font-medium text-gray-600 mb-1">{t('Tracking link (optional)')}</span>
                <input value={trackingUrl} onChange={(e) => setTrackingUrl(e.target.value)} placeholder="https://…" className={`${inputCls} w-full`} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-xs font-medium text-gray-600 mb-1">{t('Expected from')}</span>
                  <input type="date" value={expectedFrom} onChange={(e) => setExpectedFrom(e.target.value)} className={`${inputCls} w-full`} />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-gray-600 mb-1">{t('Expected by')}</span>
                  <input type="date" value={expectedTo} min={expectedFrom || undefined} onChange={(e) => setExpectedTo(e.target.value)} className={`${inputCls} w-full`} />
                </label>
              </div>
              {mode === 'dispatch' && (
                <label className="block">
                  <span className="block text-xs font-medium text-gray-600 mb-1">{t('Pharmacy reference (optional)')}</span>
                  <input value={pharmacyRef} onChange={(e) => setPharmacyRef(e.target.value)} className={`${inputCls} w-full`} />
                </label>
              )}
              <p className="text-xs text-gray-400">{t('The patient is emailed this, and sees it on their order.')}</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    run(() =>
                      mode === 'dispatch'
                        ? dispatch({ variables: { id: order.id, pharmacyRef: pharmacyRef.trim() || null, ...shippingVars() } })
                        : updateShipping({ variables: { id: order.id, ...shippingVars() } }),
                    )
                  }
                  disabled={!carrier.trim() || dispatching || updatingShipping}
                  className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-40"
                >
                  {dispatching || updatingShipping ? '…' : mode === 'dispatch' ? t('Mark shipped') : t('Save')}
                </button>
                <button onClick={() => setMode(null)} className="text-xs text-gray-400 hover:text-gray-600">{t('Back')}</button>
              </div>
            </div>
          )}

          {mode === 'handover' && (
            <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
              <p className="text-sm font-medium text-gray-800">{t('Has the courier collected this parcel?')}</p>
              <p className="text-xs text-gray-500">{t('The patient will be emailed that their order is on its way. You don’t need to enter a courier or tracking: our team adds those.')}</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => run(() => handOver({ variables: { id: order.id } }))}
                  disabled={handingOver}
                  className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-40"
                >
                  {handingOver ? '…' : t('Yes, the courier has it')}
                </button>
                <button onClick={() => setMode(null)} className="text-xs text-gray-400 hover:text-gray-600">{t('Back')}</button>
              </div>
            </div>
          )}

          {mode === 'issue' && (
            <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
              <p className="text-sm font-medium text-gray-800">{t('Report that you can’t fulfil this order')}</p>
              <label className="block">
                <span className="block text-xs font-medium text-gray-600 mb-1">{t('What is the problem?')}</span>
                <textarea
                  rows={3}
                  value={issueReason}
                  onChange={(e) => setIssueReason(e.target.value)}
                  placeholder={t('e.g. Out of stock until next week')}
                  className={`${inputCls} w-full`}
                  autoFocus
                />
              </label>
              <p className="text-xs text-gray-400">{t('Nothing is cancelled. Our team will decide what to do and be in touch.')}</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => run(() => reportIssue({ variables: { id: order.id, reason: issueReason.trim() } }))}
                  disabled={!issueReason.trim() || reporting}
                  className="px-3 py-1.5 bg-danger-500 text-white text-sm rounded-lg disabled:opacity-40"
                >
                  {reporting ? '…' : t('Report to our team')}
                </button>
                <button onClick={() => setMode(null)} className="text-xs text-gray-400 hover:text-gray-600">{t('Back')}</button>
              </div>
            </div>
          )}

          {mode === 'cancel' && (
            <div className="mt-3 flex flex-wrap gap-2 items-center">
              <input placeholder={t('Reason for cancelling…')} value={reason} onChange={(e) => setReason(e.target.value)} className={`${inputCls} w-72`} autoFocus />
              {canConfirmDelivery && (
                <div className="w-full flex flex-col gap-1 text-xs text-gray-600">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={refund} onChange={(e) => setRefund(e.target.checked)} />
                    {t('Refund the patient’s last payment')}
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={endSubscription} onChange={(e) => setEndSubscription(e.target.checked)} />
                    {t('End the subscription')}
                  </label>
                </div>
              )}
              <button
                onClick={() => run(() => cancel({ variables: { id: order.id, reason: reason.trim(), ...(canConfirmDelivery ? { refund, endSubscription } : {}) } }))}
                disabled={!reason.trim() || cancelling}
                className="px-3 py-1.5 bg-danger-500 text-white text-sm rounded-lg disabled:opacity-40"
              >
                {cancelling ? '…' : t('Cancel order')}
              </button>
              <button onClick={() => setMode(null)} className="text-xs text-gray-400 hover:text-gray-600">{t('Keep')}</button>
            </div>
          )}
        </div>

        {!mode && !cancelled && (
          <div className="shrink-0 flex flex-col gap-2">
            {canFulfil && order.status === 'PENDING' && (
              <button onClick={() => { if (!printPackingSlip(order)) setError(t('Allow pop-ups for this site to print the packing slip.')); }} className={actionCls}>{t('Print packing slip')}</button>
            )}
            {canFulfil && order.status === 'PENDING' && (
              <>
                {!order.readyForPickupAt && (
                  <button onClick={() => run(() => markReady({ variables: { id: order.id } }))} disabled={rxBlocked || addressMissing || markingReady} className={actionCls}>
                    {markingReady ? '…' : t('Ready for pickup')}
                  </button>
                )}
                <button
                  onClick={() => setMode('handover')}
                  disabled={rxBlocked || addressMissing}
                  className="px-3 py-1.5 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-900 disabled:opacity-40"
                >
                  {t('Handed to courier')}
                </button>
                {canConfirmDelivery && (
                  <button onClick={() => openShippingForm('dispatch')} disabled={rxBlocked || addressMissing} className={actionCls}>{t('Mark shipped')}</button>
                )}
              </>
            )}
            {canConfirmDelivery && order.status === 'DISPATCHED' && (
              <button onClick={() => run(() => ship({ variables: { id: order.id } }))} disabled={shipping} className={actionCls}>
                {shipping ? '…' : t('Mark out for delivery')}
              </button>
            )}
            {!canConfirmDelivery && (order.status === 'DISPATCHED' || order.status === 'OUT_FOR_DELIVERY') && (
              <p className="max-w-[11rem] text-right text-xs text-gray-400">{t('With the courier. This updates by itself when it is delivered.')}</p>
            )}
            {canConfirmDelivery && (order.status === 'DISPATCHED' || order.status === 'OUT_FOR_DELIVERY') && (
              <button onClick={() => openShippingForm('edit')} className="text-xs text-gray-400 hover:text-brand-500">{t('Edit courier and tracking')}</button>
            )}
            {canConfirmDelivery && order.status === 'OUT_FOR_DELIVERY' && (
              <button onClick={() => run(() => deliver({ variables: { id: order.id } }))} disabled={delivering} className={actionCls}>
                {delivering ? '…' : t('Mark delivered')}
              </button>
            )}
            {!canCancel && canFulfil && order.status === 'PENDING' && problem?.status !== 'CANNOT_FULFIL' && (
              <button onClick={() => setMode('issue')} className="text-xs text-gray-400 hover:text-danger-500">{t('Can’t fulfil')}</button>
            )}
            {canCancel && order.status === 'PENDING' && (
              <button onClick={() => setMode('cancel')} className="text-xs text-gray-400 hover:text-danger-500">{t('Cancel order')}</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
