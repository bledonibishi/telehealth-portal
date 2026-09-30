'use client';

import { useState } from 'react';
import { useMutation } from '@apollo/client';
import { useRouter } from 'next/navigation';
import {
  APPROVE_CONSULTATION,
  CLAIM_CONSULTATION,
  DECLINE_CONSULTATION,
  RELEASE_CONSULTATION,
  REQUEST_MORE_INFO,
} from '@/graphql/consultations';
import { hasAccess } from '@/lib/role';
import { PrescriptionForm, PrescriptionSubmission } from './PrescriptionForm';
import { Modal } from './Modal';

type Action = 'approve' | 'decline' | 'more_info' | null;

const REFUND_LABEL: Record<string, { text: string; cls: string }> = {
  REFUNDED: { text: 'Subscription cancelled and payment refunded', cls: 'text-green-700' },
  NOT_REQUIRED: { text: 'No refund needed — patient has another active treatment or no payment on file', cls: 'text-gray-500' },
  FAILED: { text: 'Automatic refund failed — refund this patient manually in Stripe', cls: 'text-danger-500 font-medium' },
};

// Patient-facing wording, sent as a message. The clinical reason is recorded separately.
const DECLINE_TEMPLATES = [
  {
    key: 'medical_history',
    label: 'Not safe to prescribe online',
    message:
      'Thank you for your answers. Based on your medical history, this treatment isn’t safe for us to prescribe online. Please speak to your own doctor, who can look at your options in person.',
  },
  {
    key: 'bmi',
    label: 'BMI below threshold',
    message:
      'Thank you for your answers. Based on the height and weight you gave us, your BMI is below the level at which this treatment can be prescribed.',
  },
  {
    key: 'in_person',
    label: 'Needs in-person assessment',
    message:
      'Thank you for your answers. Before starting this treatment you need an in-person assessment. Please book an appointment with your own doctor and share our message with them.',
  },
  {
    key: 'identity',
    label: 'Identity not verified',
    message: 'We weren’t able to verify your identity, so we can’t prescribe this treatment. Please contact us if you think this is a mistake.',
  },
  { key: 'custom', label: 'Write my own', message: '' },
];

const cls = 'w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';

export function DecisionPanel({
  consultationId, kind, status, declineReason, refundStatus, clinician, currentUserId,
}: {
  consultationId: string;
  kind: 'HRT' | 'GLP1' | 'TRT';
  status: string;
  declineReason?: string | null;
  refundStatus?: string | null;
  clinician?: { id: string; firstName: string; lastName: string } | null;
  currentUserId: string | null;
}) {
  const router = useRouter();
  const [action, setAction] = useState<Action>(null);
  const [reason, setReason] = useState('');
  const [template, setTemplate] = useState(DECLINE_TEMPLATES[0].key);
  const [patientMessage, setPatientMessage] = useState(DECLINE_TEMPLATES[0].message);
  const [infoMessage, setInfoMessage] = useState('');
  const [error, setError] = useState('');

  const reviewable = ['SUBMITTED', 'IN_REVIEW', 'MORE_INFO_REQUESTED'].includes(status);
  const claimedByMe = status === 'IN_REVIEW' && clinician?.id === currentUserId;
  const claimedByOther = status === 'IN_REVIEW' && !!clinician && clinician.id !== currentUserId;
  const isAdmin = hasAccess(['ADMIN']);
  const blocked = claimedByOther && !isAdmin;

  const toQueue = { onCompleted() { router.push('/queue'); }, onError(e: Error) { setError(e.message); } };
  const [approve, { loading: approving }] = useMutation(APPROVE_CONSULTATION, toQueue);
  const [decline, { loading: declining }] = useMutation(DECLINE_CONSULTATION, toQueue);
  const [requestInfo, { loading: requesting }] = useMutation(REQUEST_MORE_INFO, toQueue);
  const [claim, { loading: claiming }] = useMutation(CLAIM_CONSULTATION, { onError: (e) => setError(e.message) });
  const [release, { loading: releasing }] = useMutation(RELEASE_CONSULTATION, { onError: (e) => setError(e.message) });

  if (!reviewable) {
    return (
      <div className="px-6 py-2.5 bg-gray-50 border-t border-gray-200 text-sm text-gray-500 flex flex-wrap items-center gap-x-4 gap-y-1">
        <p>This consultation has been {status.toLowerCase().replace(/_/g, ' ')}.</p>
        {declineReason && <p>Reason: <span className="text-gray-700">{declineReason}</span></p>}
        {refundStatus && REFUND_LABEL[refundStatus] && (
          <p className={REFUND_LABEL[refundStatus].cls}>{REFUND_LABEL[refundStatus].text}</p>
        )}
      </div>
    );
  }

  const chooseTemplate = (key: string) => {
    setTemplate(key);
    setPatientMessage(DECLINE_TEMPLATES.find((t) => t.key === key)?.message ?? '');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (action === 'decline') {
      decline({ variables: { input: { consultationId, reason, messageToPatient: patientMessage } } });
    } else if (action === 'more_info') {
      requestInfo({ variables: { consultationId, message: infoMessage } });
    }
  };

  const close = () => { setAction(null); setError(''); };

  return (
    <div className="px-6 py-2.5 bg-gray-50 border-t border-gray-200 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
      <div className="text-xs min-w-0">
        {claimedByMe && <p className="text-gray-500">You’re reviewing this consultation.</p>}
        {claimedByOther && (
          <p className="text-warn-900">
            Being reviewed by Dr {clinician!.lastName}.{isAdmin ? ' As an admin you can still decide or release it.' : ''}
          </p>
        )}
        {status === 'MORE_INFO_REQUESTED' && (
          <p className="text-warn-900">Waiting for the patient to reply or update their answers.</p>
        )}
        {status === 'SUBMITTED' && <p className="text-gray-500">Not yet claimed — claim it so colleagues know you’re on it.</p>}
        {!action && error && <p className="text-danger-500 text-sm">{error}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {status === 'SUBMITTED' && (
          <button
            onClick={() => claim({ variables: { id: consultationId } })}
            disabled={claiming}
            className="text-sm font-medium border border-brand-500 text-brand-500 bg-white rounded-lg px-3 py-1.5 hover:bg-brand-50 disabled:opacity-50"
          >
            {claiming ? 'Claiming…' : 'Claim for review'}
          </button>
        )}
        {(claimedByMe || (claimedByOther && isAdmin)) && (
          <button
            onClick={() => release({ variables: { id: consultationId } })}
            disabled={releasing}
            className="text-sm text-gray-500 hover:text-gray-800 px-2 py-1.5 disabled:opacity-50"
          >
            Release to queue
          </button>
        )}
        {!blocked && (
          <>
            {status !== 'MORE_INFO_REQUESTED' && (
              <button onClick={() => setAction('more_info')} className="text-sm font-medium border border-warn-500 text-warn-900 bg-white rounded-lg px-3.5 py-1.5 hover:bg-warn-50">
                Request info
              </button>
            )}
            <button onClick={() => setAction('decline')} className="text-sm font-medium border border-danger-500 text-danger-500 bg-white rounded-lg px-3.5 py-1.5 hover:bg-danger-50">
              Decline
            </button>
            <button onClick={() => setAction('approve')} className="text-sm font-medium bg-green-600 text-white rounded-lg px-4 py-1.5 hover:bg-green-700 shadow-sm">
              Approve
            </button>
          </>
        )}
      </div>

      {action === 'approve' && (
        <Modal title="Approve and prescribe" subtitle="Issues the prescription and sends it to the pharmacy queue." onClose={close} wide>
          {error && <p className="text-sm text-danger-500 mb-3">{error}</p>}
          <PrescriptionForm
            consultationId={consultationId}
            kind={kind}
            submitting={approving}
            onCancel={close}
            onSubmit={(rx: PrescriptionSubmission) => {
              setError('');
              approve({ variables: { input: { consultationId, ...rx } } });
            }}
          />
        </Modal>
      )}

      {action === 'decline' && (
        <Modal title="Decline consultation" onClose={close}>
          <form onSubmit={handleSubmit} className="space-y-3">
            {error && <p className="text-sm text-danger-500">{error}</p>}
            <label className="block">
              <span className="block text-xs font-medium text-gray-700 mb-1">Clinical reason (internal, required)</span>
              <textarea rows={2} required value={reason} onChange={(e) => setReason(e.target.value)} className={cls} />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-gray-700 mb-1">Message to the patient</span>
              <select value={template} onChange={(e) => chooseTemplate(e.target.value)} className={`${cls} mb-2`}>
                {DECLINE_TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
              <textarea rows={4} required value={patientMessage} onChange={(e) => setPatientMessage(e.target.value)} className={cls} />
            </label>
            <p className="text-xs text-gray-500">
              Unless the patient already has an approved treatment, their subscription is cancelled and their payment refunded automatically.
            </p>
            <div className="flex gap-2">
              <button type="submit" disabled={declining} className="bg-danger-500 text-white rounded px-4 py-2 text-sm font-medium disabled:opacity-50">
                {declining ? 'Declining…' : 'Confirm decline'}
              </button>
              <button type="button" onClick={close} className="text-sm text-gray-500 px-4 py-2">Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      {action === 'more_info' && (
        <Modal title="Request more information" onClose={close}>
          <form onSubmit={handleSubmit} className="space-y-3">
            {error && <p className="text-sm text-danger-500">{error}</p>}
            <label className="block">
              <span className="block text-xs font-medium text-gray-700 mb-1">What do you need from the patient?</span>
              <textarea
                rows={3}
                required
                value={infoMessage}
                onChange={(e) => setInfoMessage(e.target.value)}
                placeholder="e.g. Please send a blood pressure reading taken in the last month."
                className={cls}
              />
            </label>
            <p className="text-xs text-gray-500">Sent as a message. The patient can reply, or update their questionnaire, which returns the consultation to the queue.</p>
            <div className="flex gap-2">
              <button type="submit" disabled={requesting} className="bg-warn-500 text-white rounded px-4 py-2 text-sm font-medium disabled:opacity-50">
                {requesting ? 'Sending…' : 'Send request'}
              </button>
              <button type="button" onClick={close} className="text-sm text-gray-500 px-4 py-2">Cancel</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
