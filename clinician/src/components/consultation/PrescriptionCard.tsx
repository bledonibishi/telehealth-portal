'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { CANCEL_PRESCRIPTION, CHANGE_DOSE, PATIENT_HISTORY } from '@/graphql/consultations';
import { CREATE_REPEAT_ORDER, GET_ORDERS, PATIENT_ORDERS } from '@/graphql/orders';
import { GET_PATIENT } from '@/graphql/patients';
import { PROCESS_PRESCRIPTION_NOW } from '@/graphql/checkins';
import { openAuthedDocument } from '@/lib/documents';
import { hasAccess } from '@/lib/role';
import { PrescriptionForm, PrescriptionSubmission, Row } from './PrescriptionForm';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { InlineError } from '@/components/ui/Alert';
import { CopyId } from '@/components/ui/CopyId';
import { Dialog } from '@/components/ui/Dialog';

const STATUS_STYLE: Record<string, { label: string; border: string; text: string }> = {
  ACTIVE: { label: 'Prescription issued', border: 'border-green-200', text: 'text-green-700' },
  SUPERSEDED: { label: 'Prescription superseded', border: 'border-gray-200', text: 'text-gray-500' },
  CANCELLED: { label: 'Prescription cancelled', border: 'border-danger-500', text: 'text-danger-500' },
};

function ChangeDoseForm({ rx, patientId, kind, onDone }: { rx: any; patientId: string; kind: 'HRT' | 'GLP1' | 'TRT'; onDone: () => void }) {
  const { t } = useI18n();
  const { data: history } = useQuery(PATIENT_HISTORY, { variables: { patientId } });
  // The prescribing rules re-check the patient's intake answers, which live on a consultation of this kind.
  const consultationId = history?.patientHistory?.find((c: any) => c.kind === kind)?.id;

  const [reasonForChange, setReasonForChange] = useState('');
  const [messageToPatient, setMessageToPatient] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [changeDose, { loading }] = useMutation(CHANGE_DOSE, {
    refetchQueries: [{ query: GET_ORDERS }],
    onCompleted: onDone,
    onError: (e) => setError(e),
  });

  const currentItems: Row[] = (rx.items ?? []).map((i: any) => ({
    productId: i.product.id,
    strengthId: i.strength.id,
    quantity: i.quantity,
    directions: i.directions,
  }));

  if (!consultationId) {
    return <p className="px-6 py-5 text-xs text-gray-500">{t('Can’t find this patient’s {kind} consultation to check the prescribing rules against.', { kind })}</p>;
  }

  const top = (
    <>
      <p className="text-xs text-gray-600 bg-blue-50/60 border border-blue-100 rounded-lg px-3 py-2.5">
        {t('Saving issues a corrected prescription that replaces this one. The original stays on record.')}
      </p>
      <div className="rounded-lg border border-gray-200 p-4">
        <p className="text-xs font-semibold text-gray-700 mb-3">{t('Why is it changing?')}</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs text-gray-500 mb-1">{t('Reason for the edit (required)')}</span>
            <textarea
              rows={3}
              value={reasonForChange}
              onChange={(e) => setReasonForChange(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-gray-500 mb-1">{t('Message to the patient (optional)')}</span>
            <textarea
              rows={3}
              value={messageToPatient}
              onChange={(e) => setMessageToPatient(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </label>
        </div>
      </div>
    </>
  );

  return (
      <PrescriptionForm
        top={top}
        error={error}
        consultationId={consultationId}
        kind={kind}
        submitting={loading}
        submitLabel="Save and issue corrected prescription"
        dialog
        initialItems={currentItems}
        stepUp={kind === 'GLP1'}
        onCancel={onDone}
        onSubmit={(input: PrescriptionSubmission) => {
          if (!reasonForChange.trim()) return setError('A reason for the change is required');
          setError(null);
          changeDose({
            variables: {
              input: {
                prescriptionId: rx.id,
                items: input.items,
                reasonForChange: reasonForChange.trim(),
                messageToPatient: messageToPatient.trim() || undefined,
                notes: input.notes,
                validityDays: input.validityDays,
                refillsAllowed: input.refillsAllowed,
                overrideReason: input.overrideReason,
              },
            },
          });
        }}
      />
  );
}

const ORDER_STATE: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'Preparing', cls: 'bg-amber-50 text-amber-700' },
  DISPATCHED: { label: 'Shipped', cls: 'bg-blue-50 text-blue-700' },
  OUT_FOR_DELIVERY: { label: 'Out for delivery', cls: 'bg-blue-50 text-blue-700' },
  DELIVERED: { label: 'Delivered', cls: 'bg-green-50 text-green-700' },
  CANCELLED: { label: 'Cancelled', cls: 'bg-gray-100 text-gray-500' },
};
const STATUS_PILL: Record<string, string> = {
  ACTIVE: 'bg-green-50 text-green-700',
  SUPERSEDED: 'bg-gray-100 text-gray-500',
  CANCELLED: 'bg-red-50 text-red-700',
};
const short = (id: string) => `#${id.slice(-8)}`;

/**
 * One prescription, with what it is connected to: the orders sent on it, the check-in that led to it or is due on it,
 * and the prescription it replaced. `orders`, `checkIns` (numbered, oldest first) and `siblings` are the patient's own,
 * passed by the patient panel; without them the card shows the prescription alone.
 */
export function PrescriptionCard({
  prescription: rx,
  patientId,
  orders = [],
  checkIns = [],
  siblings = [],
  onOpenCheckIn,
}: {
  prescription: any;
  patientId?: string;
  orders?: any[];
  checkIns?: any[];
  siblings?: any[];
  onOpenCheckIn?: () => void;
}) {
  const { t, fmt, timeAgo } = useI18n();
  const fmtDate = (d?: string | null) => (d ? fmt(d, 'dd/MM/yyyy') : '—');
  const [cancelling, setCancelling] = useState(false);
  const [changingDose, setChangingDose] = useState(false);
  const [reason, setReason] = useState('');
  const [repeatSent, setRepeatSent] = useState(false);
  const [repeatError, setRepeatError] = useState<unknown>(null);
  const [processError, setProcessError] = useState<unknown>(null);
  const [cancel, { loading, error }] = useMutation(CANCEL_PRESCRIPTION, { onCompleted: () => setCancelling(false) });
  const [orderRepeat, { loading: ordering }] = useMutation(CREATE_REPEAT_ORDER, {
    refetchQueries: [{ query: GET_ORDERS }],
    onCompleted: () => { setRepeatError(null); setRepeatSent(true); },
    onError: (e) => { setRepeatSent(false); setRepeatError(e); },
  });
  const [processNow, { loading: processing }] = useMutation(PROCESS_PRESCRIPTION_NOW, {
    refetchQueries: [{ query: GET_ORDERS }, ...(patientId ? [{ query: PATIENT_ORDERS, variables: { patientId } }, { query: GET_PATIENT, variables: { id: patientId } }] : [])],
    onError: (e) => setProcessError(e),
  });
  const style = STATUS_STYLE[rx.status] ?? STATUS_STYLE.ACTIVE;
  const isPrescriber = hasAccess(['ADMIN', 'DOCTOR']);
  const canCancel = rx.status === 'ACTIVE' && isPrescriber;
  const expired = rx.validUntil && new Date(rx.validUntil) < new Date();
  const canRepeat = rx.status === 'ACTIVE' && !expired && isPrescriber && (rx.repeatsRemaining ?? 0) > 0;
  const kind = rx.items?.[0]?.product?.kind as 'HRT' | 'GLP1' | 'TRT' | undefined;
  const canChangeDose = rx.status === 'ACTIVE' && !expired && isPrescriber && !!patientId && !!kind;

  const myOrders = orders.filter((o) => o.prescription?.id === rx.id).sort((a, b) => a.sequence - b.sequence);
  const waiting = myOrders.find((o) => o.status === 'PENDING');
  const canProcess = process.env.NODE_ENV !== 'production' && isPrescriber && rx.status === 'ACTIVE' && !!waiting && !!patientId;
  // The check-in that decided this prescription, the ones held while it was current, and the one still to come.
  const cameFrom = checkIns.find((c) => c.resultPrescriptionId === rx.id);
  const nextCheckIn = rx.status === 'ACTIVE' ? checkIns.filter((c) => c.status !== 'COMPLETED').slice(-1)[0] : undefined;
  const reviewedOn = checkIns.filter((c) => c.status === 'COMPLETED' && c.prescription?.id === rx.id);
  const replaces = rx.supersedesId ? siblings.find((x) => x.id === rx.supersedesId) : undefined;
  const replacedBy = siblings.find((x) => x.supersedesId === rx.id);
  const hasLinks = myOrders.length > 0 || cameFrom || nextCheckIn || reviewedOn.length > 0 || rx.supersedesId || replacedBy;
  const ckLabel = (c: any) => t('Check-in {n}', { n: c.number ?? 1 });

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded ${STATUS_PILL[rx.status] ?? STATUS_PILL.ACTIVE}`}>{t(style.label)}</span>
            <CopyId id={rx.id} />
          </div>
          <p className="text-xs text-gray-500 mt-1.5">
            {t('Issued')} {fmtDate(rx.issuedAt)}
            {rx.prescriber && <> · {t('Dr {name}', { name: rx.prescriber.lastName })}</>}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => openAuthedDocument(rx.documentUrl, t)} className="text-xs font-medium px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700">
            {t('View PDF')}
          </button>
          {canChangeDose && !changingDose && !cancelling && (
            <button onClick={() => setChangingDose(true)} className="text-xs font-medium px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 text-brand-500">
              {t('Edit')}
            </button>
          )}
        </div>
      </div>

      {rx.items?.length ? (
        <ul className="space-y-3">
          {rx.items.map((item: any) => (
            <li key={item.id} className="rounded-lg border border-gray-100 p-4">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <p className="text-sm font-semibold text-gray-900">
                  {item.product.brandName ?? item.product.name}
                  <span className="font-normal text-gray-500"> {item.strength.label}</span>
                </p>
                {item.product.brandName && <p className="text-xs text-gray-400">{item.product.name}</p>}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {item.quantity} × {item.strength.packDescription ?? t('pack')}
                {item.strength.titrationStep ? ` · ${t('step {n}', { n: item.strength.titrationStep })}` : ''}
                {item.product.requiresColdChain ? ` · ${t('cold chain')}` : ''}
              </p>
              <p className="text-xs text-gray-700 mt-2 bg-gray-50 rounded-md px-3 py-2">{item.directions}</p>
            </li>
          ))}
        </ul>
      ) : (
        // Issued before structured prescribing
        <dl className="space-y-2 text-sm rounded-lg border border-gray-100 p-4">
          <div><dt className="text-xs text-gray-500">{t('Medication')}</dt><dd>{rx.medication}</dd></div>
          <div><dt className="text-xs text-gray-500">{t('Dosage')}</dt><dd>{rx.dosage}</dd></div>
          <div><dt className="text-xs text-gray-500">{t('Instructions')}</dt><dd>{rx.instructions}</dd></div>
        </dl>
      )}

      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
        <div>
          <dt className="text-gray-400">{t('Valid until')}</dt>
          <dd className={`mt-0.5 font-medium ${expired ? 'text-red-600' : 'text-gray-800'}`}>{fmtDate(rx.validUntil)}{rx.validUntil && <span className="font-normal text-gray-400"> · {timeAgo(rx.validUntil)}</span>}</dd>
        </div>
        <div>
          <dt className="text-gray-400">{t('Supply')}</dt>
          <dd className="mt-0.5 font-medium text-gray-800">
            {(rx.refillsAllowed ?? 0) === 0 ? t('One supply') : t('{left} of {total} repeats left', { left: rx.repeatsRemaining ?? rx.refillsAllowed, total: rx.refillsAllowed })}
          </dd>
        </div>
      </dl>

      {rx.overrideReason && (
        <p className="text-xs bg-warn-50 text-gray-800 rounded p-2">
          <span className="font-medium">{t('Rule overridden:')}</span> {rx.overrideReason}
        </p>
      )}
      {rx.cancelReason && <p className="text-xs text-danger-500">{t('Cancelled:')} {rx.cancelReason}</p>}
      {expired && rx.status === 'ACTIVE' && <p className="text-xs text-danger-500">{t('Expired — a new prescription is needed.')}</p>}

      {hasLinks && (
        <div className="rounded-lg bg-gray-50/70 border border-gray-100 p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-700">{t('Connected to')}</p>

          {myOrders.length > 0 && (
            <div className="space-y-1.5">
              {myOrders.map((o) => {
                const st = ORDER_STATE[o.status] ?? ORDER_STATE.PENDING;
                return (
                  <div key={o.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-gray-700">{t('Order {n}', { n: o.sequence })} <span className="text-gray-400 font-mono">{o.reference ?? short(o.id)}</span></span>
                    <span className="flex items-center gap-2">
                      {o.dispatchedAt && <span className="text-gray-400">{t('Shipped {date}', { date: fmt(o.dispatchedAt, 'dd MMM') })}</span>}
                      <span className={`px-2 py-0.5 rounded font-medium ${st.cls}`}>{t(st.label)}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {cameFrom && (
            <p className="text-xs text-gray-600">
              {t('Issued after')}{' '}
              <button type="button" onClick={onOpenCheckIn} className="font-medium text-brand-500 hover:underline">{ckLabel(cameFrom)}</button>
              {cameFrom.reviewedAt && <span className="text-gray-400"> · {fmt(cameFrom.reviewedAt, 'dd MMM yyyy')}</span>}
            </p>
          )}
          {reviewedOn.map((c) => (
            <p key={c.id} className="text-xs text-gray-600">
              {t('Reviewed at')}{' '}
              <button type="button" onClick={onOpenCheckIn} className="font-medium text-brand-500 hover:underline">{ckLabel(c)}</button>
              <span className="text-gray-400"> · {fmt(c.completedAt, 'dd MMM yyyy')}</span>
            </p>
          ))}
          {nextCheckIn && (
            <p className="text-xs text-gray-600">
              {t('Next check-in')}{' '}
              <button type="button" onClick={onOpenCheckIn} className="font-medium text-brand-500 hover:underline">{ckLabel(nextCheckIn)}</button>
              <span className="text-gray-400"> · {fmt(nextCheckIn.dueAt, 'dd MMM yyyy')}</span>
            </p>
          )}
          {replaces && <p className="text-xs text-gray-600">{t('Replaces')} <span className="font-mono text-gray-500">{short(replaces.id)}</span></p>}
          {replacedBy && <p className="text-xs text-gray-600">{t('Replaced by')} <span className="font-mono text-gray-500">{short(replacedBy.id)}</span></p>}
        </div>
      )}

      {canProcess && (
        <div className="border-t border-dashed border-gray-200 pt-3">
          <p className="text-xs text-gray-400 mb-2">{t('Development only')}</p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => { setProcessError(null); processNow({ variables: { prescriptionId: rx.id } }); }}
              disabled={processing}
              className="text-xs px-3 py-1.5 rounded-lg bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-40"
            >
              {processing ? t('Processing…') : t('Process now')}
            </button>
            <span className="text-xs text-gray-400">{t('Ships the waiting order as the pharmacy would, then schedules the check-in straight away.')}</span>
          </div>
          <InlineError error={processError} size="xs" className="mt-2" />
        </div>
      )}

      {repeatSent && <p className="text-xs text-gray-600" role="status">{t('Repeat sent to the pharmacy queue')}</p>}
      <InlineError error={repeatError} size="xs" />

      {!changingDose && (canRepeat || (canCancel && !cancelling)) && (
        <div className="flex gap-4">
          {canRepeat && (
            <button
              onClick={() => { setRepeatSent(false); setRepeatError(null); orderRepeat({ variables: { prescriptionId: rx.id } }); }}
              disabled={ordering}
              className="text-xs font-medium text-brand-500 hover:underline disabled:opacity-50"
            >
              {ordering ? t('Ordering…') : t('Order repeat')}
            </button>
          )}
          {canCancel && !cancelling && (
            <button onClick={() => setCancelling(true)} className="text-xs text-danger-500 hover:underline">
              {t('Cancel prescription')}
            </button>
          )}
        </div>
      )}

      {changingDose && kind && (
        <Dialog
          title={t('Edit prescription')}
          subtitle={`${rx.items?.map((i: any) => i.product.brandName ?? i.product.name).join(' + ') || rx.medication} · ${short(rx.id)}`}
          onClose={() => setChangingDose(false)}
        >
          <ChangeDoseForm rx={rx} patientId={patientId!} kind={kind} onDone={() => setChangingDose(false)} />
        </Dialog>
      )}

      {cancelling && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            cancel({ variables: { id: rx.id, reason } });
          }}
        >
          <textarea
            rows={2}
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('Reason (recorded and shown to the pharmacy)')}
            className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <InlineError error={error} size="xs" />
          <div className="flex gap-2">
            <button type="submit" disabled={loading} className="text-xs bg-danger-500 text-white rounded px-2.5 py-1 disabled:opacity-50">
              {loading ? t('Cancelling…') : t('Confirm cancel')}
            </button>
            <button type="button" onClick={() => setCancelling(false)} className="text-xs text-gray-500">{t('Keep')}</button>
          </div>
        </form>
      )}
    </div>
  );
}
