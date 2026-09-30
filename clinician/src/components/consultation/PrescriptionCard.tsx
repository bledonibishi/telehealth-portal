'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { CANCEL_PRESCRIPTION, CHANGE_DOSE, PATIENT_HISTORY } from '@/graphql/consultations';
import { CREATE_REPEAT_ORDER, GET_ORDERS } from '@/graphql/orders';
import { openAuthedDocument } from '@/lib/documents';
import { hasAccess } from '@/lib/role';
import { PrescriptionForm, PrescriptionSubmission, Row } from './PrescriptionForm';

const STATUS_STYLE: Record<string, { label: string; border: string; text: string }> = {
  ACTIVE: { label: 'Prescription issued', border: 'border-green-200', text: 'text-green-700' },
  SUPERSEDED: { label: 'Prescription superseded', border: 'border-gray-200', text: 'text-gray-500' },
  CANCELLED: { label: 'Prescription cancelled', border: 'border-danger-500', text: 'text-danger-500' },
};

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString('en-GB') : '—');

function ChangeDoseForm({ rx, patientId, kind, onDone }: { rx: any; patientId: string; kind: 'HRT' | 'GLP1'; onDone: () => void }) {
  const { data: history } = useQuery(PATIENT_HISTORY, { variables: { patientId } });
  // The prescribing rules re-check the patient's intake answers, which live on a consultation of this kind.
  const consultationId = history?.patientHistory?.find((c: any) => c.kind === kind)?.id;

  const [reasonForChange, setReasonForChange] = useState('');
  const [messageToPatient, setMessageToPatient] = useState('');
  const [error, setError] = useState('');
  const [changeDose, { loading }] = useMutation(CHANGE_DOSE, {
    refetchQueries: [{ query: GET_ORDERS }],
    onCompleted: onDone,
    onError: (e) => setError(e.message),
  });

  const currentItems: Row[] = (rx.items ?? []).map((i: any) => ({
    productId: i.product.id,
    strengthId: i.strength.id,
    quantity: i.quantity,
    directions: i.directions,
  }));

  if (!consultationId) {
    return <p className="text-xs text-gray-500">Can’t find this patient’s {kind} consultation to check the prescribing rules against.</p>;
  }

  return (
    <div className="space-y-3 border-t border-gray-100 pt-3">
      <label className="block">
        <span className="block text-xs font-medium text-gray-700 mb-1">Reason for changing the dose (required)</span>
        <textarea
          rows={2}
          required
          value={reasonForChange}
          onChange={(e) => setReasonForChange(e.target.value)}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </label>
      <label className="block">
        <span className="block text-xs font-medium text-gray-700 mb-1">Message to the patient (optional)</span>
        <textarea
          rows={2}
          value={messageToPatient}
          onChange={(e) => setMessageToPatient(e.target.value)}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </label>

      {error && <p className="text-xs text-danger-500">{error}</p>}

      <PrescriptionForm
        consultationId={consultationId}
        kind={kind}
        submitting={loading}
        submitLabel="Confirm dose change"
        initialItems={currentItems}
        stepUp={kind === 'GLP1'}
        onCancel={onDone}
        onSubmit={(input: PrescriptionSubmission) => {
          if (!reasonForChange.trim()) return setError('A reason for the change is required');
          setError('');
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
    </div>
  );
}

export function PrescriptionCard({ prescription: rx, patientId }: { prescription: any; patientId?: string }) {
  const [cancelling, setCancelling] = useState(false);
  const [changingDose, setChangingDose] = useState(false);
  const [reason, setReason] = useState('');
  const [repeatMessage, setRepeatMessage] = useState('');
  const [cancel, { loading, error }] = useMutation(CANCEL_PRESCRIPTION, { onCompleted: () => setCancelling(false) });
  const [orderRepeat, { loading: ordering }] = useMutation(CREATE_REPEAT_ORDER, {
    refetchQueries: [{ query: GET_ORDERS }],
    onCompleted: () => setRepeatMessage('Repeat sent to the pharmacy queue'),
    onError: (e) => setRepeatMessage(e.message),
  });
  const style = STATUS_STYLE[rx.status] ?? STATUS_STYLE.ACTIVE;
  const isPrescriber = hasAccess(['ADMIN', 'DOCTOR']);
  const canCancel = rx.status === 'ACTIVE' && isPrescriber;
  const expired = rx.validUntil && new Date(rx.validUntil) < new Date();
  const canRepeat = rx.status === 'ACTIVE' && !expired && isPrescriber && (rx.repeatsRemaining ?? 0) > 0;
  const kind = rx.items?.[0]?.product?.kind as 'HRT' | 'GLP1' | undefined;
  const canChangeDose = rx.status === 'ACTIVE' && !expired && isPrescriber && !!patientId && !!kind;

  return (
    <div className={`bg-white rounded-lg border ${style.border} p-4 space-y-3`}>
      <h3 className={`text-xs font-semibold uppercase tracking-wide ${style.text}`}>{style.label}</h3>

      {rx.items?.length ? (
        <ul className="space-y-2 text-sm">
          {rx.items.map((item: any) => (
            <li key={item.id}>
              <p className="font-medium text-gray-900">
                {item.product.name}{item.product.brandName ? ` (${item.product.brandName})` : ''} {item.strength.label}
              </p>
              <p className="text-xs text-gray-500">
                {item.quantity} × {item.strength.packDescription ?? 'pack'}
                {item.strength.titrationStep ? ` · step ${item.strength.titrationStep}` : ''}
                {item.product.requiresColdChain ? ' · cold chain' : ''}
              </p>
              <p className="text-xs text-gray-700 mt-0.5">{item.directions}</p>
            </li>
          ))}
        </ul>
      ) : (
        // Issued before structured prescribing
        <dl className="space-y-2 text-sm">
          <div><dt className="text-gray-500">Medication</dt><dd>{rx.medication}</dd></div>
          <div><dt className="text-gray-500">Dosage</dt><dd>{rx.dosage}</dd></div>
          <div><dt className="text-gray-500">Instructions</dt><dd>{rx.instructions}</dd></div>
        </dl>
      )}

      <dl className="grid grid-cols-2 gap-2 text-xs">
        <div><dt className="text-gray-500">Issued</dt><dd>{fmt(rx.issuedAt)}</dd></div>
        <div><dt className="text-gray-500">Valid until</dt><dd>{fmt(rx.validUntil)}</dd></div>
        <div>
          <dt className="text-gray-500">Repeats left</dt>
          <dd>{rx.repeatsRemaining ?? rx.refillsAllowed ?? 0} of {rx.refillsAllowed ?? 0}</dd>
        </div>
        {rx.prescriber && (
          <div><dt className="text-gray-500">Prescriber</dt><dd>Dr {rx.prescriber.lastName}</dd></div>
        )}
      </dl>

      {rx.overrideReason && (
        <p className="text-xs bg-warn-50 text-gray-800 rounded p-2">
          <span className="font-medium">Rule overridden:</span> {rx.overrideReason}
        </p>
      )}
      {rx.cancelReason && <p className="text-xs text-danger-500">Cancelled: {rx.cancelReason}</p>}
      {expired && rx.status === 'ACTIVE' && <p className="text-xs text-danger-500">Expired — a new prescription is needed.</p>}
      {repeatMessage && <p className="text-xs text-gray-600">{repeatMessage}</p>}

      {!changingDose && (
        <div className="flex gap-3">
          <button onClick={() => openAuthedDocument(rx.documentUrl)} className="text-xs font-medium text-brand-500 hover:underline">
            View PDF
          </button>
          {canRepeat && (
            <button
              onClick={() => { setRepeatMessage(''); orderRepeat({ variables: { prescriptionId: rx.id } }); }}
              disabled={ordering}
              className="text-xs font-medium text-brand-500 hover:underline disabled:opacity-50"
            >
              {ordering ? 'Ordering…' : 'Order repeat'}
            </button>
          )}
          {canChangeDose && !cancelling && (
            <button onClick={() => setChangingDose(true)} className="text-xs font-medium text-brand-500 hover:underline">
              Change dose
            </button>
          )}
          {canCancel && !cancelling && (
            <button onClick={() => setCancelling(true)} className="text-xs text-danger-500 hover:underline">
              Cancel prescription
            </button>
          )}
        </div>
      )}

      {changingDose && kind && (
        <ChangeDoseForm rx={rx} patientId={patientId!} kind={kind} onDone={() => setChangingDose(false)} />
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
            placeholder="Reason (recorded and shown to the pharmacy)"
            className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          {error && <p className="text-xs text-danger-500">{error.message}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={loading} className="text-xs bg-danger-500 text-white rounded px-2.5 py-1 disabled:opacity-50">
              {loading ? 'Cancelling…' : 'Confirm cancel'}
            </button>
            <button type="button" onClick={() => setCancelling(false)} className="text-xs text-gray-500">Keep</button>
          </div>
        </form>
      )}
    </div>
  );
}
