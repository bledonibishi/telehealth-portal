'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { formatDistanceToNow, differenceInYears, format } from 'date-fns';
import { GET_PATIENT, UPDATE_PATIENT, GET_PATIENTS } from '@/graphql/patients';
import { SEND_MESSAGE } from '@/graphql/messaging';
import { GET_ONBOARDING_SUBMISSION, REVIEW_ONBOARDING } from '@/graphql/onboarding';
import AuthedImage from '@/components/AuthedImage';
import { hasAccess } from '@/lib/role';

const PROOF_TYPE_LABEL: Record<string, string> = {
  MEDICINE_BOX_LABEL: 'Medicine box label',
  PRESCRIPTION_DOCUMENT: 'Prescription document',
  PHARMACY_RECORD: 'Pharmacy record',
  ORDER_CONFIRMATION: 'Order confirmation',
};

const STATUS_BADGE: Record<string, string> = {
  SUBMITTED:            'bg-blue-50 text-blue-700',
  IN_REVIEW:            'bg-amber-50 text-amber-700',
  APPROVED:             'bg-green-50 text-green-700',
  DECLINED:             'bg-red-50 text-red-700',
  MORE_INFO_REQUESTED:  'bg-purple-50 text-purple-700',
};

const KIND_BADGE: Record<string, string> = {
  HRT:  'bg-violet-100 text-violet-700',
  GLP1: 'bg-teal-100 text-teal-700',
};

type Tab = 'overview' | 'prescriptions' | 'onboarding' | 'messages';

export default function PatientPanel({ patientId, onClose }: { patientId: string; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('overview');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [reply, setReply] = useState('');
  const [requestingChanges, setRequestingChanges] = useState(false);
  const [changesReason, setChangesReason] = useState('');

  const isAdmin = hasAccess(['ADMIN']);
  const canReviewOnboarding = hasAccess(['ADMIN', 'DOCTOR']);

  const { data, loading } = useQuery(GET_PATIENT, { variables: { id: patientId } });
  const { data: onboardingData } = useQuery(GET_ONBOARDING_SUBMISSION, { variables: { patientId } });
  const [updatePatient, { loading: saving }] = useMutation(UPDATE_PATIENT, {
    refetchQueries: [{ query: GET_PATIENTS }],
  });
  const [sendMessage, { loading: sending }] = useMutation(SEND_MESSAGE, {
    refetchQueries: [{ query: GET_PATIENT, variables: { id: patientId } }],
  });
  const [reviewOnboarding, { loading: reviewing }] = useMutation(REVIEW_ONBOARDING, {
    refetchQueries: [{ query: GET_ONBOARDING_SUBMISSION, variables: { patientId } }],
  });

  const p = data?.patient;
  const onboarding = onboardingData?.onboardingSubmission;

  if (loading) return (
    <div className="flex-1 flex items-center justify-center text-sm text-gray-400">Loading…</div>
  );
  if (!p) return null;

  const age = differenceInYears(new Date(), new Date(p.dateOfBirth));
  const latestConsult = p.consultations?.[0];
  const allPrescriptions = p.consultations?.flatMap((c: any) => c.prescription ? [{ ...c.prescription, kind: c.kind }] : []) ?? [];
  const allMessages = p.consultations?.flatMap((c: any) => c.messages ?? []) ?? [];
  const latestConsultId = p.consultations?.[0]?.id;

  const handleReply = async () => {
    if (!reply.trim() || !latestConsultId) return;
    await sendMessage({ variables: { input: { consultationId: latestConsultId, content: reply.trim() } } });
    setReply('');
  };

  const handleApproveOnboarding = async () => {
    await reviewOnboarding({ variables: { input: { patientId, approve: true } } });
  };

  const handleRequestChanges = async () => {
    if (!changesReason.trim()) return;
    await reviewOnboarding({ variables: { input: { patientId, approve: false, rejectionReason: changesReason.trim() } } });
    setRequestingChanges(false);
    setChangesReason('');
  };

  const handleSave = async () => {
    await updatePatient({
      variables: {
        input: {
          id: p.id,
          firstName: form.firstName ?? p.firstName,
          lastName: form.lastName ?? p.lastName,
          email: form.email ?? p.email,
          dateOfBirth: form.dateOfBirth ? new Date(form.dateOfBirth) : p.dateOfBirth,
        },
      },
    });
    setEditing(false);
    setForm({});
  };

  const field = (key: string, label: string, value: string, type = 'text') => (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      {editing && isAdmin ? (
        <input
          type={type}
          defaultValue={value}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      ) : (
        <p className="text-sm text-gray-800 font-medium">{value}</p>
      )}
    </div>
  );

  const onboardingLabel =
    onboarding?.status === 'PENDING_REVIEW' ? 'Onboarding ⚠️' : 'Onboarding';

  const TABS: { key: Tab; label: string }[] = [
    { key: 'overview',      label: 'Overview' },
    { key: 'onboarding',    label: onboardingLabel },
    { key: 'prescriptions', label: `Prescriptions (${allPrescriptions.length})` },
    { key: 'messages',      label: `Messages (${allMessages.length})` },
  ];

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-200">
      {/* Panel header */}
      <div className="px-5 py-4 border-b border-gray-200 flex items-start justify-between">
        <div>
          <p className="font-semibold text-gray-900 text-base">{p.firstName} {p.lastName}</p>
          <p className="text-xs text-gray-400 mt-0.5">{p.email} · {age} yrs</p>
          <div className="flex gap-2 mt-2">
            {p.activatedAt ? (
              <span className="text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded">✓ Active</span>
            ) : (
              <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded">Pending activation</span>
            )}
            {latestConsult && (
              <span className={`text-xs font-medium px-2 py-0.5 rounded ${KIND_BADGE[latestConsult.kind]}`}>
                {latestConsult.kind}
              </span>
            )}
          </div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 px-5 bg-white">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`py-2.5 mr-5 text-sm border-b-2 transition-colors whitespace-nowrap ${
              tab === t.key
                ? 'border-brand-500 text-brand-900 font-medium'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">

        {/* ── Overview ── */}
        {tab === 'overview' && (
          <div className="p-5 space-y-6">
            {/* Basic details card */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Basic details</p>
                {isAdmin && !editing && (
                  <button onClick={() => setEditing(true)} className="text-xs text-brand-500 hover:text-brand-900">Edit</button>
                )}
                {editing && (
                  <div className="flex gap-2">
                    <button onClick={() => { setEditing(false); setForm({}); }} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                    <button onClick={handleSave} disabled={saving} className="text-xs bg-brand-500 text-white px-2.5 py-1 rounded-md hover:bg-brand-600 disabled:opacity-50">
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                {field('firstName', 'First name', p.firstName)}
                {field('lastName', 'Last name', p.lastName)}
                {field('email', 'Email', p.email, 'email')}
                {field('dateOfBirth', 'Date of birth', format(new Date(p.dateOfBirth), 'yyyy-MM-dd'), 'date')}
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Age</p>
                  <p className="text-sm text-gray-800 font-medium">{age} years</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Joined</p>
                  <p className="text-sm text-gray-800 font-medium">{formatDistanceToNow(new Date(p.createdAt), { addSuffix: true })}</p>
                </div>
              </div>
            </div>

            {/* Consultation history */}
            {p.consultations?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Consultations</p>
                <div className="space-y-3">
                  {p.consultations.map((c: any) => (
                    <div key={c.id} className="border border-gray-100 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex gap-2">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded ${KIND_BADGE[c.kind]}`}>{c.kind}</span>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded ${STATUS_BADGE[c.status]}`}>{c.status.replace(/_/g, ' ')}</span>
                        </div>
                        <span className="text-xs text-gray-400">{formatDistanceToNow(new Date(c.submittedAt), { addSuffix: true })}</span>
                      </div>
                      {c.redFlags?.length > 0 && (
                        <div className="mb-3 space-y-1">
                          {c.redFlags.map((rf: any) => (
                            <div key={rf.id} className={`text-xs px-3 py-1.5 rounded-lg ${rf.severity === 'CRITICAL' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                              {rf.severity === 'CRITICAL' ? '🚨' : '⚠️'} {rf.description}
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        {c.quizAnswers?.map((a: any, i: number) => (
                          <div key={i} className="bg-gray-50 rounded-lg px-3 py-2">
                            <p className="text-xs text-gray-400">{a.question}</p>
                            <p className="text-xs font-medium text-gray-800 mt-0.5">{a.answer}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Onboarding ── */}
        {tab === 'onboarding' && (
          <div className="p-5">
            {!onboarding || onboarding.status === 'IN_PROGRESS' ? (
              <div className="py-12 text-center text-sm text-gray-400">
                {onboarding ? 'Patient hasn’t submitted onboarding yet.' : 'Patient hasn’t started onboarding yet.'}
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                      onboarding.status === 'PENDING_REVIEW'
                        ? 'bg-amber-50 text-amber-700'
                        : onboarding.status === 'APPROVED'
                          ? 'bg-green-50 text-green-700'
                          : 'bg-red-50 text-red-700'
                    }`}
                  >
                    {onboarding.status.replace(/_/g, ' ')}
                  </span>
                  {onboarding.submittedAt && (
                    <span className="text-xs text-gray-400">
                      Submitted {formatDistanceToNow(new Date(onboarding.submittedAt), { addSuffix: true })}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Identity check</p>
                    <p className="text-sm text-gray-800">
                      {onboarding.personaStatus === 'NOT_CONFIGURED' ? 'Manual review' : onboarding.personaStatus.replace(/_/g, ' ')}
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Photo compliance</p>
                    <p className="text-sm text-gray-800">{onboarding.photoReviewStatus.replace(/_/g, ' ')}</p>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">ID document &amp; selfie</p>
                  <div className="grid grid-cols-2 gap-2">
                    <AuthedImage path={onboarding.idDocumentUrl} alt="ID document" className="w-full h-40 object-cover rounded-xl border border-gray-100" />
                    <AuthedImage path={onboarding.selfieUrl} alt="Selfie" className="w-full h-40 object-cover rounded-xl border border-gray-100" />
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Full body photos</p>
                  <div className="grid grid-cols-2 gap-2">
                    <AuthedImage path={onboarding.bodyPhotoFrontUrl} alt="Front-facing" className="w-full h-52 object-cover rounded-xl border border-gray-100" />
                    <AuthedImage path={onboarding.bodyPhotoSideUrl} alt="Side-facing" className="w-full h-52 object-cover rounded-xl border border-gray-100" />
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Prior medication use</p>
                  {onboarding.priorMedicationUse ? (
                    <div>
                      <p className="text-sm text-gray-800 mb-2">
                        Yes — proof provided: {PROOF_TYPE_LABEL[onboarding.prescriptionProofType] ?? onboarding.prescriptionProofType}
                      </p>
                      <AuthedImage path={onboarding.prescriptionProofUrl} alt="Prescription proof" className="w-full max-h-52 object-cover rounded-xl border border-gray-100" />
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No — first time using this medication.</p>
                  )}
                </div>

                {onboarding.status === 'REJECTED' && onboarding.rejectionReason && (
                  <div className="bg-red-50 border border-red-100 text-red-700 rounded-xl px-3 py-2.5 text-sm">
                    <p className="font-medium">Changes requested</p>
                    <p className="mt-1">{onboarding.rejectionReason}</p>
                  </div>
                )}

                {canReviewOnboarding && onboarding.status === 'PENDING_REVIEW' && (
                  <div className="border-t border-gray-100 pt-4">
                    {requestingChanges ? (
                      <div className="space-y-2">
                        <textarea
                          rows={3}
                          placeholder="What does the patient need to fix or add? e.g. retake the front body photo, provide clearer proof of prescription…"
                          value={changesReason}
                          onChange={(e) => setChangesReason(e.target.value)}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={handleRequestChanges}
                            disabled={!changesReason.trim() || reviewing}
                            className="px-3 py-1.5 bg-amber-500 text-white text-sm rounded-lg hover:bg-amber-600 disabled:opacity-40"
                          >
                            {reviewing ? '…' : 'Send request'}
                          </button>
                          <button onClick={() => setRequestingChanges(false)} className="text-sm text-gray-400 hover:text-gray-600">
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-3">
                        <button
                          onClick={handleApproveOnboarding}
                          disabled={reviewing}
                          className="flex-1 px-4 py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-40"
                        >
                          {reviewing ? '…' : 'Approve'}
                        </button>
                        <button
                          onClick={() => setRequestingChanges(true)}
                          disabled={reviewing}
                          className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
                        >
                          Request changes
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Prescriptions ── */}
        {tab === 'prescriptions' && (
          <div className="p-5">
            {allPrescriptions.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-400">No prescriptions issued yet.</div>
            ) : (
              <div className="space-y-4">
                {allPrescriptions.map((rx: any) => (
                  <div key={rx.id} className="border border-gray-100 rounded-xl p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">{rx.medication}</p>
                        <p className="text-xs text-gray-400 mt-0.5">Issued {formatDistanceToNow(new Date(rx.issuedAt), { addSuffix: true })}</p>
                      </div>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${KIND_BADGE[rx.kind]}`}>{rx.kind}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-gray-400">Dosage</p>
                        <p className="font-medium text-gray-800">{rx.dosage}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Pharmacy ref</p>
                        <p className="font-medium text-gray-800">{rx.pharmacyRef ?? '—'}</p>
                      </div>
                    </div>
                    <div className="mt-3 bg-gray-50 rounded-lg px-3 py-2">
                      <p className="text-xs text-gray-400">Instructions</p>
                      <p className="text-sm text-gray-800 mt-0.5">{rx.instructions}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Messages ── */}
        {tab === 'messages' && (
          <div className="flex flex-col h-full">
            {/* Message thread */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {allMessages.length === 0 ? (
                <div className="py-12 text-center text-sm text-gray-400">No messages yet.</div>
              ) : (
                allMessages.map((msg: any) => {
                  const isPatient = msg.senderRole === 'PATIENT';
                  return (
                    <div key={msg.id} className={`flex ${isPatient ? 'justify-start' : 'justify-end'}`}>
                      <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                        isPatient
                          ? 'bg-gray-100 text-gray-800 rounded-tl-sm'
                          : 'bg-brand-500 text-white rounded-tr-sm'
                      }`}>
                        <p className={`text-xs mb-1 font-medium ${isPatient ? 'text-gray-500' : 'text-blue-100'}`}>
                          {isPatient ? p.firstName : 'Clinician team'}
                        </p>
                        <p>{msg.content}</p>
                        <p className={`text-xs mt-1 ${isPatient ? 'text-gray-400' : 'text-blue-200'}`}>
                          {formatDistanceToNow(new Date(msg.sentAt), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Reply input */}
            {latestConsultId ? (
              <div className="border-t border-gray-100 p-4 bg-white">
                <div className="flex gap-2">
                  <textarea
                    rows={2}
                    placeholder="Reply to patient…"
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleReply(); } }}
                    className="flex-1 resize-none border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <button
                    onClick={handleReply}
                    disabled={!reply.trim() || sending}
                    className="self-end px-4 py-2 bg-brand-500 text-white text-sm rounded-xl hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {sending ? '…' : 'Send'}
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1.5">Enter to send · Shift+Enter for new line</p>
              </div>
            ) : (
              <div className="border-t border-gray-100 p-4 text-center text-xs text-gray-400">
                No active consultation to message against.
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
