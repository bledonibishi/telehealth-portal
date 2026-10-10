'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { useRouter } from 'next/navigation';
import {
  APPROVE_CONSULTATION,
  CLAIM_CONSULTATION,
  DECLINE_CONSULTATION,
  RELEASE_CONSULTATION,
  REQUEST_MORE_INFO,
  REQUEST_ONBOARDING_REDO,
  GET_CONSULTATION,
} from '@/graphql/consultations';
import { GET_ONBOARDING_SUBMISSION } from '@/graphql/onboarding';
import { hasAccess } from '@/lib/role';
import { PrescriptionForm, PrescriptionSubmission } from './PrescriptionForm';
import { Modal } from './Modal';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { InlineError } from '@/components/ui/Alert';
import { Select } from '@/components/ui/Select';

type Action = 'approve' | 'decline' | 'more_info' | 'redo' | null;

// The onboarding steps a clinician can send back, by the key the server uses.
const REDO_STEPS: { key: string; label: string }[] = [
  { key: 'ID_PHOTO', label: 'ID document & selfie' },
  { key: 'BODY_PHOTO', label: 'Full body photos' },
  { key: 'PRESCRIPTION_PROOF', label: 'Proof of previous prescription' },
];

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
  consultationId, kind, status, declineReason, refundStatus, clinician, currentUserId, patientId, blockedReason,
}: {
  consultationId: string;
  kind: 'HRT' | 'GLP1' | 'TRT';
  status: string;
  declineReason?: string | null;
  refundStatus?: string | null;
  clinician?: { id: string; firstName: string; lastName: string } | null;
  currentUserId: string | null;
  patientId: string;
  /** Why this can't be decided yet (onboarding unfinished, identity not approved); the server enforces it too. */
  blockedReason?: string | null;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [action, setAction] = useState<Action>(null);
  const [reason, setReason] = useState('');
  const [template, setTemplate] = useState(DECLINE_TEMPLATES[0].key);
  const [patientMessage, setPatientMessage] = useState(DECLINE_TEMPLATES[0].message);
  const [infoMessage, setInfoMessage] = useState('');
  const [redoStep, setRedoStep] = useState('');
  const [redoReason, setRedoReason] = useState('');
  const [error, setError] = useState<unknown>(null);

  const reviewable = ['SUBMITTED', 'IN_REVIEW', 'MORE_INFO_REQUESTED'].includes(status);
  const claimedByMe = status === 'IN_REVIEW' && clinician?.id === currentUserId;
  const claimedByOther = status === 'IN_REVIEW' && !!clinician && clinician.id !== currentUserId;
  const isAdmin = hasAccess(['ADMIN']);
  const blocked = claimedByOther && !isAdmin;

  const toQueue = { onCompleted() { router.push('/queue'); }, onError(e: Error) { setError(e); } };
  // What happened to billing for the prescribed dose, shown before going back to the queue.
  const [billingNote, setBillingNote] = useState<string | null>(null);
  const [approve, { loading: approving }] = useMutation(APPROVE_CONSULTATION, {
    onCompleted(data) {
      const note: string | null = data?.approveConsultation?.billingNote ?? null;
      if (note) setBillingNote(note);
      else router.push('/queue');
    },
    onError(e: Error) {
      setError(e);
    },
  });
  const [decline, { loading: declining }] = useMutation(DECLINE_CONSULTATION, toQueue);
  const [requestInfo, { loading: requesting }] = useMutation(REQUEST_MORE_INFO, toQueue);
  // The consultation page keeps open after this: the patient now has the step to redo, and approval waits for them.
  const [requestRedo, { loading: redoing }] = useMutation(REQUEST_ONBOARDING_REDO, {
    refetchQueries: [{ query: GET_ONBOARDING_SUBMISSION, variables: { patientId } }, { query: GET_CONSULTATION, variables: { id: consultationId } }],
    onCompleted() { setAction(null); setRedoReason(''); setError(null); },
    onError(e: Error) { setError(e); },
  });
  const { data: onboardingData } = useQuery(GET_ONBOARDING_SUBMISSION, { variables: { patientId } });
  const onboarding = onboardingData?.onboardingSubmission;
  // Which steps are part of this patient's review: ID photos only when identity isn't checked by the verification service.
  const redoable = REDO_STEPS.filter((s) =>
    s.key === 'ID_PHOTO' ? !onboarding?.identityViaVerifyService : s.key === 'PRESCRIPTION_PROOF' ? !!onboarding?.priorMedicationUse : true,
  );
  const canRedo = ['PENDING_REVIEW', 'REJECTED'].includes(onboarding?.status ?? '');
  const [claim, { loading: claiming }] = useMutation(CLAIM_CONSULTATION, { onError: (e) => setError(e) });
  const [release, { loading: releasing }] = useMutation(RELEASE_CONSULTATION, { onError: (e) => setError(e) });

  // Before the "already decided" view: the approval has just made this consultation APPROVED.
  if (billingNote) {
    const refunded = /refunded/i.test(billingNote);
    const needsHand = /by hand|couldn’t|failed|not configured|No Stripe/i.test(billingNote);
    return (
      <Modal title={t('Approved')} subtitle={t('The prescription has been issued and sent to the pharmacy queue.')} onClose={() => router.push('/queue')}>
        <div
          className={`rounded-lg p-3 text-sm ${
            needsHand ? 'bg-warn-50 text-warn-900' : refunded ? 'bg-green-50 text-green-800' : 'bg-gray-50 text-gray-700'
          }`}
        >
          <p className="font-medium">{needsHand ? t('Billing needs checking') : t('Billing updated')}</p>
          <p className="mt-1">{billingNote}</p>
        </div>
        <div className="flex justify-end mt-4">
          <button onClick={() => router.push('/queue')} className="text-sm font-medium bg-brand-500 text-white rounded-lg px-4 py-2 hover:bg-brand-700">
            {t('Back to queue')}
          </button>
        </div>
      </Modal>
    );
  }

  if (!reviewable) {
    return (
      <div className="px-4 sm:px-6 py-2.5 bg-gray-50 border-t border-gray-200 text-sm text-gray-500 flex flex-wrap items-center gap-x-4 gap-y-1">
        <p>{t('This consultation has been {status}.', { status: t(status.replace(/_/g, ' ')).toLowerCase() })}</p>
        {declineReason && <p>{t('Reason:')} <span className="text-gray-700">{declineReason}</span></p>}
        {refundStatus && REFUND_LABEL[refundStatus] && (
          <p className={REFUND_LABEL[refundStatus].cls}>{t(REFUND_LABEL[refundStatus].text)}</p>
        )}
      </div>
    );
  }

  const chooseTemplate = (key: string) => {
    setTemplate(key);
    setPatientMessage(DECLINE_TEMPLATES.find((tpl) => tpl.key === key)?.message ?? '');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (action === 'decline') {
      decline({ variables: { input: { consultationId, reason, messageToPatient: patientMessage } } });
    } else if (action === 'more_info') {
      requestInfo({ variables: { consultationId, message: infoMessage } });
    } else if (action === 'redo') {
      requestRedo({ variables: { consultationId, step: redoStep, reason: redoReason.trim() } });
    }
  };

  const close = () => { setAction(null); setError(null); };

  return (
    <div className="px-4 sm:px-6 py-2.5 bg-gray-50 border-t border-gray-200 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
      <div className="text-xs min-w-0">
        {claimedByMe && <p className="text-gray-500">{t('You’re reviewing this consultation.')}</p>}
        {claimedByOther && (
          <p className="text-warn-900">
            {t('Being reviewed by Dr {name}.', { name: clinician!.lastName })}{isAdmin ? ` ${t('As an admin you can still decide or release it.')}` : ''}
          </p>
        )}
        {status === 'MORE_INFO_REQUESTED' && (
          <p className="text-warn-900">{t('Waiting for the patient to reply or update their answers.')}</p>
        )}
        {status === 'SUBMITTED' && <p className="text-gray-500">{t('Not yet claimed — claim it so colleagues know you’re on it.')}</p>}
        {blockedReason && <p className="text-warn-900">{t(blockedReason)}</p>}
        {!action && <InlineError error={error} />}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {status === 'SUBMITTED' && (
          <button
            onClick={() => claim({ variables: { id: consultationId } })}
            disabled={claiming}
            className="text-sm font-medium border border-brand-500 text-brand-500 bg-white rounded-lg px-3 py-1.5 hover:bg-brand-50 disabled:opacity-50"
          >
            {claiming ? t('Claiming…') : t('Claim for review')}
          </button>
        )}
        {(claimedByMe || (claimedByOther && isAdmin)) && (
          <button
            onClick={() => release({ variables: { id: consultationId } })}
            disabled={releasing}
            className="text-sm text-gray-500 hover:text-gray-800 px-2 py-1.5 disabled:opacity-50"
          >
            {t('Release to queue')}
          </button>
        )}
        {!blocked && (
          <>
            {canRedo && status !== 'MORE_INFO_REQUESTED' && (
              <button onClick={() => { setRedoStep(redoable[0]?.key ?? ''); setAction('redo'); }} className="text-sm font-medium border border-gray-300 text-gray-700 bg-white rounded-lg px-3.5 py-1.5 hover:bg-gray-50">
                {t('Ask to redo a step')}
              </button>
            )}
            {status !== 'MORE_INFO_REQUESTED' && (
              <button onClick={() => setAction('more_info')} className="text-sm font-medium border border-warn-500 text-warn-900 bg-white rounded-lg px-3.5 py-1.5 hover:bg-warn-50">
                {t('Request info')}
              </button>
            )}
            <button onClick={() => setAction('decline')} className="text-sm font-medium border border-danger-500 text-danger-500 bg-white rounded-lg px-3.5 py-1.5 hover:bg-danger-50">
              {t('Decline')}
            </button>
            <button
              onClick={() => setAction('approve')}
              disabled={!!blockedReason}
              title={blockedReason ? t(blockedReason) : undefined}
              className="text-sm font-medium bg-green-600 text-white rounded-lg px-4 py-1.5 hover:bg-green-700 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-green-600"
            >
              {t('Approve')}
            </button>
          </>
        )}
      </div>

      {action === 'approve' && (
        <Modal title={t('Approve and prescribe')} subtitle={t('Issues the prescription and sends it to the pharmacy queue.')} onClose={close} wide>
          <PrescriptionForm
            consultationId={consultationId}
            kind={kind}
            error={error}
            showDoseContext
            submitting={approving}
            onCancel={close}
            onSubmit={(rx: PrescriptionSubmission) => {
              setError(null);
              approve({ variables: { input: { consultationId, ...rx } } });
            }}
          />
        </Modal>
      )}

      {action === 'decline' && (
        <Modal title={t('Decline consultation')} onClose={close}>
          <form onSubmit={handleSubmit} className="space-y-3">
            <InlineError error={error} />
            <label className="block">
              <span className="block text-xs font-medium text-gray-700 mb-1">{t('Clinical reason (internal, required)')}</span>
              <textarea rows={2} required value={reason} onChange={(e) => setReason(e.target.value)} className={cls} />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-gray-700 mb-1">{t('Message to the patient')}</span>
              <div className="mb-2"><Select ariaLabel={t('Message to the patient')} value={template} onChange={chooseTemplate} options={DECLINE_TEMPLATES.map((tpl) => ({ value: tpl.key, label: t(tpl.label) }))} /></div>
              <textarea rows={4} required value={patientMessage} onChange={(e) => setPatientMessage(e.target.value)} className={cls} />
            </label>
            <p className="text-xs text-gray-500">
              {t('Unless the patient already has an approved treatment, their subscription is cancelled and their payment refunded automatically.')}
            </p>
            <div className="flex gap-2">
              <button type="submit" disabled={declining} className="bg-danger-500 text-white rounded px-4 py-2 text-sm font-medium disabled:opacity-50">
                {declining ? t('Declining…') : t('Confirm decline')}
              </button>
              <button type="button" onClick={close} className="text-sm text-gray-500 px-4 py-2">{t('Cancel')}</button>
            </div>
          </form>
        </Modal>
      )}

      {action === 'redo' && (
        <Modal title={t('Ask the patient to redo a step')} onClose={close}>
          <form onSubmit={handleSubmit} className="space-y-3">
            <InlineError error={error} />
            <fieldset className="space-y-1.5">
              <legend className="block text-xs font-medium text-gray-700 mb-1">{t('Which step?')}</legend>
              {redoable.map((s) => (
                <label key={s.key} className="flex items-center gap-2 text-sm text-gray-800">
                  <input type="radio" name="redo-step" checked={redoStep === s.key} onChange={() => setRedoStep(s.key)} />
                  {t(s.label)}
                </label>
              ))}
            </fieldset>
            <label className="block">
              <span className="block text-xs font-medium text-gray-700 mb-1">{t('What does the patient need to fix?')}</span>
              <textarea rows={3} required value={redoReason} onChange={(e) => setRedoReason(e.target.value)} placeholder={t('e.g. The side photo is blurred — please retake it in good light.')} className={cls} />
            </label>
            <p className="text-xs text-gray-500">{t('Sent as a message. The patient sends that step in again, and you can approve once they have. You can ask about another step before they answer.')}</p>
            <div className="flex gap-2">
              <button type="submit" disabled={redoing || !redoStep || !redoReason.trim()} className="bg-warn-500 text-white rounded px-4 py-2 text-sm font-medium disabled:opacity-50">
                {redoing ? t('Sending…') : t('Send request')}
              </button>
              <button type="button" onClick={close} className="text-sm text-gray-500 px-4 py-2">{t('Cancel')}</button>
            </div>
          </form>
        </Modal>
      )}

      {action === 'more_info' && (
        <Modal title={t('Request more information')} onClose={close}>
          <form onSubmit={handleSubmit} className="space-y-3">
            <InlineError error={error} />
            <label className="block">
              <span className="block text-xs font-medium text-gray-700 mb-1">{t('What do you need from the patient?')}</span>
              <textarea
                rows={3}
                required
                value={infoMessage}
                onChange={(e) => setInfoMessage(e.target.value)}
                placeholder={t('e.g. Please send a blood pressure reading taken in the last month.')}
                className={cls}
              />
            </label>
            <p className="text-xs text-gray-500">{t('Sent as a message. The patient can reply, or update their questionnaire, which returns the consultation to the queue.')}</p>
            <div className="flex gap-2">
              <button type="submit" disabled={requesting} className="bg-warn-500 text-white rounded px-4 py-2 text-sm font-medium disabled:opacity-50">
                {requesting ? t('Sending…') : t('Send request')}
              </button>
              <button type="button" onClick={close} className="text-sm text-gray-500 px-4 py-2">{t('Cancel')}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
