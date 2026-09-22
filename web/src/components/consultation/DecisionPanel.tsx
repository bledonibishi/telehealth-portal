'use client';

import { useState } from 'react';
import { useMutation } from '@apollo/client';
import { useRouter } from 'next/navigation';
import { APPROVE_CONSULTATION, DECLINE_CONSULTATION, REQUEST_MORE_INFO } from '@/graphql/consultations';

type Action = 'approve' | 'decline' | 'more_info' | null;

export function DecisionPanel({ consultationId, status }: { consultationId: string; status: string }) {
  const router = useRouter();
  const [action, setAction] = useState<Action>(null);
  const [medication, setMedication] = useState('');
  const [dosage, setDosage] = useState('');
  const [instructions, setInstructions] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const reviewable = ['SUBMITTED', 'IN_REVIEW', 'MORE_INFO_REQUESTED'].includes(status);

  const [approve, { loading: approving }] = useMutation(APPROVE_CONSULTATION, {
    onCompleted() { router.push('/queue'); },
    onError(e) { setError(e.message); },
  });

  const [decline, { loading: declining }] = useMutation(DECLINE_CONSULTATION, {
    onCompleted() { router.push('/queue'); },
    onError(e) { setError(e.message); },
  });

  const [requestInfo, { loading: requesting }] = useMutation(REQUEST_MORE_INFO, {
    onCompleted() { router.push('/queue'); },
    onError(e) { setError(e.message); },
  });

  if (!reviewable) {
    return (
      <div className="p-4 bg-gray-50 rounded-lg text-sm text-gray-500">
        This consultation has been {status.toLowerCase().replace(/_/g, ' ')}.
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (action === 'approve') {
      approve({ variables: { input: { consultationId, medication, dosage, instructions } } });
    } else if (action === 'decline') {
      decline({ variables: { input: { consultationId, reason } } });
    } else if (action === 'more_info') {
      requestInfo({ variables: { consultationId } });
    }
  };

  return (
    <div className="border border-gray-200 rounded-lg p-4 space-y-4">
      <h3 className="text-sm font-semibold text-gray-900">Decision</h3>

      {error && <p className="text-sm text-danger-500">{error}</p>}

      {!action && (
        <div className="flex gap-3">
          <button
            onClick={() => setAction('approve')}
            className="flex-1 bg-green-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-green-700"
          >
            Approve
          </button>
          <button
            onClick={() => setAction('more_info')}
            className="flex-1 bg-warn-500 text-white rounded px-4 py-2 text-sm font-medium hover:bg-warn-900"
          >
            Request info
          </button>
          <button
            onClick={() => setAction('decline')}
            className="flex-1 bg-danger-500 text-white rounded px-4 py-2 text-sm font-medium hover:bg-danger-900"
          >
            Decline
          </button>
        </div>
      )}

      {action === 'approve' && (
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Medication" value={medication} onChange={setMedication} required />
          <Field label="Dosage" value={dosage} onChange={setDosage} required />
          <Field label="Instructions" value={instructions} onChange={setInstructions} required textarea />
          <div className="flex gap-2">
            <button type="submit" disabled={approving} className="bg-green-600 text-white rounded px-4 py-2 text-sm font-medium disabled:opacity-50">
              {approving ? 'Approving…' : 'Confirm approval'}
            </button>
            <button type="button" onClick={() => setAction(null)} className="text-sm text-gray-500 px-4 py-2">Cancel</button>
          </div>
        </form>
      )}

      {action === 'decline' && (
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Reason for declining (required)" value={reason} onChange={setReason} required textarea />
          <div className="flex gap-2">
            <button type="submit" disabled={declining} className="bg-danger-500 text-white rounded px-4 py-2 text-sm font-medium disabled:opacity-50">
              {declining ? 'Declining…' : 'Confirm decline'}
            </button>
            <button type="button" onClick={() => setAction(null)} className="text-sm text-gray-500 px-4 py-2">Cancel</button>
          </div>
        </form>
      )}

      {action === 'more_info' && (
        <form onSubmit={handleSubmit} className="space-y-3">
          <p className="text-sm text-gray-600">This will move the consultation to "Awaiting info" and open a message thread with the patient.</p>
          <div className="flex gap-2">
            <button type="submit" disabled={requesting} className="bg-warn-500 text-white rounded px-4 py-2 text-sm font-medium disabled:opacity-50">
              {requesting ? 'Sending…' : 'Request info'}
            </button>
            <button type="button" onClick={() => setAction(null)} className="text-sm text-gray-500 px-4 py-2">Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}

function Field({
  label, value, onChange, required, textarea,
}: {
  label: string; value: string; onChange: (v: string) => void; required?: boolean; textarea?: boolean;
}) {
  const cls = 'w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      {textarea ? (
        <textarea rows={3} required={required} value={value} onChange={(e) => onChange(e.target.value)} className={cls} />
      ) : (
        <input type="text" required={required} value={value} onChange={(e) => onChange(e.target.value)} className={cls} />
      )}
    </div>
  );
}
