'use client';

import { useState } from 'react';
import { useMutation } from '@apollo/client';
import type { DocumentNode } from 'graphql';
import { CANCEL_ORDER, DISPATCH_ORDER, MARK_ORDER_DELIVERED, MARK_ORDER_OUT_FOR_DELIVERY } from '@/graphql/orders';
import { openAuthedDocument } from '@/lib/documents';
import { hasAccess } from '@/lib/role';
import { useI18n } from '@/lib/i18n/I18nProvider';
import PartnerStatus from './PartnerStatus';

const KIND_BADGE: Record<string, string> = {
  HRT: 'bg-violet-100 text-violet-700',
  GLP1: 'bg-teal-100 text-teal-700',
};

const STAGES = ['Prescribed', 'Dispatched', 'Out for delivery', 'Delivered'] as const;
const STAGE_OF: Record<string, number> = { PENDING: 0, DISPATCHED: 1, OUT_FOR_DELIVERY: 2, DELIVERED: 3 };

const inputCls = 'border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';
const actionCls = 'px-3 py-1.5 border border-gray-200 text-sm text-gray-700 rounded-lg hover:bg-gray-100 disabled:opacity-40';

export function orderStage(order: { status: string }) {
  return STAGE_OF[order.status] ?? -1;
}

function StageTracker({ current }: { current: number }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center max-w-md">
      {STAGES.map((stage, i) => (
        <div key={stage} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center">
            <div className={`w-2.5 h-2.5 rounded-full ${i <= current ? 'bg-brand-500' : 'bg-gray-200'} ${i === current ? 'ring-4 ring-brand-50' : ''}`} />
            <span className={`text-[10px] mt-1 whitespace-nowrap ${i <= current ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>{t(stage)}</span>
          </div>
          {i < STAGES.length - 1 && <div className={`h-0.5 flex-1 mx-1.5 mb-4 ${i < current ? 'bg-brand-500' : 'bg-gray-200'}`} />}
        </div>
      ))}
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
  const [mode, setMode] = useState<'dispatch' | 'ship' | 'cancel' | null>(null);
  const [pharmacyRef, setPharmacyRef] = useState('');
  const [carrier, setCarrier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackingUrl, setTrackingUrl] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const opts = { refetchQueries, onCompleted: () => setMode(null), onError: (e: Error) => setError(e.message) };
  const [dispatch, { loading: dispatching }] = useMutation(DISPATCH_ORDER, opts);
  const [ship, { loading: shipping }] = useMutation(MARK_ORDER_OUT_FOR_DELIVERY, opts);
  const [deliver, { loading: delivering }] = useMutation(MARK_ORDER_DELIVERED, opts);
  const [cancel, { loading: cancelling }] = useMutation(CANCEL_ORDER, opts);

  const canFulfil = hasAccess(['ADMIN', 'PROVIDER']);
  const canCancel = hasAccess(['ADMIN', 'PROVIDER', 'DOCTOR']);
  const rx = order.prescription;
  const kind = rx.consultation?.kind;
  const stage = orderStage(order);
  const cancelled = order.status === 'CANCELLED';
  const coldChain = rx.items?.some((i: any) => i.product.requiresColdChain);
  // Dispatched orders show where they went; pending ones where they will go.
  const address = formatAddress(order.shippingAddress ?? order.patient);
  const rxBlocked = rx.status !== 'ACTIVE' || (rx.validUntil && new Date(rx.validUntil) < new Date());

  const run = (fn: () => void) => { setError(''); fn(); };

  return (
    <div className={`px-6 py-4 bg-white hover:bg-gray-50 ${cancelled ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {kind && <span className={`text-xs font-medium px-2 py-0.5 rounded ${KIND_BADGE[kind] ?? 'bg-gray-100 text-gray-600'}`}>{kind}</span>}
            <span className="text-xs text-gray-700 font-medium">{cancelled ? t('Cancelled') : t(STAGES[stage])}</span>
            <span className="text-xs text-gray-400">{order.sequence === 1 ? t('First supply') : t('Repeat {n}', { n: order.sequence - 1 })}</span>
            {coldChain && <span className="text-xs font-medium px-2 py-0.5 rounded bg-blue-50 text-blue-700">{t('Cold chain')}</span>}
          </div>

          {showPatient && (
            <p className="font-medium text-gray-900 text-sm">
              {order.patient.firstName} {order.patient.lastName}
              <span className="font-normal text-gray-400 ml-2">{order.patient.email}</span>
            </p>
          )}

          <p className="mt-1.5 text-xs text-gray-500">
            <span className="font-medium text-gray-700">{rx.medication}</span> · {rx.dosage}
          </p>
          <p className="text-xs text-gray-400 mt-0.5 whitespace-pre-line">{rx.instructions}</p>

          <p className={`text-xs mt-1.5 ${address ? 'text-gray-600' : 'text-danger-500 font-medium'}`}>
            {address ?? t('No delivery address on file — ask the patient to add one before dispatch')}
            {order.patient.phone && address && <span className="text-gray-400"> · {order.patient.phone}</span>}
          </p>

          {!cancelled && <div className="mt-3"><StageTracker current={stage} /></div>}

          {canFulfil && <PartnerStatus order={order} />}

          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-gray-400">
            <span>{t('Ordered {when}', { when: timeAgo(order.createdAt) })}</span>
            {order.dispatchedAt && <span>{t('Dispatched {date}', { date: fmt(order.dispatchedAt, 'dd MMM yyyy') })}</span>}
            {order.outForDeliveryAt && <span>{t('Out for delivery {date}', { date: fmt(order.outForDeliveryAt, 'dd MMM yyyy') })}</span>}
            {order.deliveredAt && <span>{t('Delivered {date}', { date: fmt(order.deliveredAt, 'dd MMM yyyy') })}</span>}
            {order.pharmacyRef && <span>{t('Ref:')} <span className="font-mono text-gray-600">{order.pharmacyRef}</span></span>}
            <button onClick={() => openAuthedDocument(rx.documentUrl)} className="text-brand-500 hover:underline">{t('Prescription PDF')}</button>
          </div>

          {(order.carrier || order.trackingNumber || order.trackingUrl) && (
            <div className="mt-1 text-xs text-gray-500">
              {order.carrier && <span>{order.carrier} </span>}
              {order.trackingNumber && <span className="font-mono">{order.trackingNumber}</span>}
              {order.trackingUrl && (
                <a href={order.trackingUrl} target="_blank" rel="noreferrer" className="text-brand-500 hover:text-brand-900 ml-2">{t('Track package →')}</a>
              )}
            </div>
          )}

          {cancelled && order.cancelReason && <p className="mt-1 text-xs text-danger-500">{t('Cancelled:')} {order.cancelReason}</p>}
          {!cancelled && stage === 0 && rxBlocked && (
            <p className="mt-1 text-xs text-danger-500 font-medium">{t('The prescription is {state} — do not dispense.', { state: rx.status === 'ACTIVE' ? t('expired') : t(rx.status.toLowerCase()) })}</p>
          )}
          {error && <p className="mt-2 text-xs text-danger-500">{error}</p>}

          {mode === 'dispatch' && (
            <div className="mt-3 flex gap-2 items-center">
              <input placeholder={t('Pharmacy reference…')} value={pharmacyRef} onChange={(e) => setPharmacyRef(e.target.value)} className={`${inputCls} w-64`} autoFocus />
              <button
                onClick={() => run(() => dispatch({ variables: { id: order.id, pharmacyRef: pharmacyRef.trim() } }))}
                disabled={!pharmacyRef.trim() || dispatching}
                className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-40"
              >
                {dispatching ? '…' : t('Confirm dispatch')}
              </button>
              <button onClick={() => setMode(null)} className="text-xs text-gray-400 hover:text-gray-600">{t('Back')}</button>
            </div>
          )}

          {mode === 'ship' && (
            <div className="mt-3 space-y-2">
              <div className="flex gap-2">
                <input placeholder={t('Carrier')} value={carrier} onChange={(e) => setCarrier(e.target.value)} className={`${inputCls} w-40`} autoFocus />
                <input placeholder={t('Tracking number')} value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} className={`${inputCls} w-40`} />
                <input placeholder={t('Tracking URL (optional)')} value={trackingUrl} onChange={(e) => setTrackingUrl(e.target.value)} className={`${inputCls} flex-1`} />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => run(() => ship({
                    variables: { id: order.id, carrier: carrier.trim() || null, trackingNumber: trackingNumber.trim() || null, trackingUrl: trackingUrl.trim() || null },
                  }))}
                  disabled={shipping}
                  className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-40"
                >
                  {shipping ? '…' : t('Confirm')}
                </button>
                <button onClick={() => setMode(null)} className="text-xs text-gray-400 hover:text-gray-600">{t('Back')}</button>
              </div>
            </div>
          )}

          {mode === 'cancel' && (
            <div className="mt-3 flex gap-2 items-center">
              <input placeholder={t('Reason for cancelling…')} value={reason} onChange={(e) => setReason(e.target.value)} className={`${inputCls} w-72`} autoFocus />
              <button
                onClick={() => run(() => cancel({ variables: { id: order.id, reason: reason.trim() } }))}
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
              <button onClick={() => setMode('dispatch')} disabled={rxBlocked || !address} className={actionCls}>{t('Mark dispatched')}</button>
            )}
            {canFulfil && order.status === 'DISPATCHED' && (
              <button onClick={() => setMode('ship')} className={actionCls}>{t('Mark out for delivery')}</button>
            )}
            {canFulfil && order.status === 'OUT_FOR_DELIVERY' && (
              <button onClick={() => run(() => deliver({ variables: { id: order.id } }))} disabled={delivering} className={actionCls}>
                {delivering ? '…' : t('Mark delivered')}
              </button>
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
