'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useSubscription } from '@apollo/client';
import Link from 'next/link';
import { differenceInYears } from 'date-fns';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { openAuthedDocument } from '@/lib/documents';
import { GET_PATIENT, UPDATE_PATIENT, GET_PATIENTS } from '@/graphql/patients';
import { SEND_MESSAGE, NEW_MESSAGE_SUBSCRIPTION } from '@/graphql/messaging';
import { realtime } from '@/lib/apollo';
import { useRealtimeConnected } from '@/lib/realtime';
import { GET_ORDERS, PATIENT_ORDERS } from '@/graphql/orders';
import { OrderCard } from '@/components/orders/OrderCard';
import { PrescriptionCard } from '@/components/consultation/PrescriptionCard';
import { PATIENT_PRESCRIPTIONS } from '@/graphql/consultations';
import { GET_ONBOARDING_SUBMISSION } from '@/graphql/onboarding';
import { RESCHEDULE_CHECK_IN } from '@/graphql/checkins';
import { OnboardingReview } from '@/components/onboarding/OnboardingReview';
import WeightJourneyPanel from '@/components/weight/WeightJourneyPanel';
import { GET_WEIGHT_JOURNEY } from '@/graphql/weight';
import LabsPanel from '@/components/labs/LabsPanel';
import SymptomsPanel from '@/components/symptoms/SymptomsPanel';
import { PATIENT_SYMPTOM_ASSESSMENTS } from '@/graphql/symptoms';
import { hasAccess } from '@/lib/role';
import PatientSnapshot, { currentMedications, treatmentStatusOf } from '@/components/patients/PatientSnapshot';
import MedicationPill from '@/components/patients/MedicationPill';
import { TREATMENT_STATUS } from '@/lib/patient-status';
import { LoadingState } from '@telehealth/loading';

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

export type Tab = 'overview' | 'prescriptions' | 'orders' | 'onboarding' | 'messages' | 'checkin' | 'weight' | 'symptoms' | 'labs';
export const TABS: Tab[] = ['overview', 'prescriptions', 'orders', 'onboarding', 'messages', 'checkin', 'weight', 'symptoms', 'labs'];

// A patient's messages live in each consultation's thread, so listen to every one of them
// and reload the patient when anything arrives.
function MessageWatcher({ consultationId, onMessage }: { consultationId: string; onMessage: () => void }) {
  useSubscription(NEW_MESSAGE_SUBSCRIPTION, { variables: { consultationId }, onData: onMessage });
  return null;
}

export default function PatientPanel({ patientId, onClose, initialTab = 'overview' }: { patientId: string; onClose: () => void; initialTab?: Tab }) {
  const { t, timeAgo, fmt } = useI18n();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [reply, setReply] = useState('');
  const [editingCheckInId, setEditingCheckInId] = useState<string | null>(null);
  const [checkInDate, setCheckInDate] = useState('');
  const [copiedCheckInId, setCopiedCheckInId] = useState<string | null>(null);

  const isAdmin = hasAccess(['ADMIN']);
  const canReviewOnboarding = hasAccess(['ADMIN', 'DOCTOR']);

  const { data, loading, refetch, startPolling, stopPolling } = useQuery(GET_PATIENT, { variables: { id: patientId } });
  const connected = useRealtimeConnected(realtime);
  // Poll while live updates aren't arriving, and catch up on anything missed while the socket was down.
  useEffect(() => {
    if (connected) return;
    startPolling(10_000);
    return stopPolling;
  }, [connected, startPolling, stopPolling]);
  useEffect(() => realtime?.onReconnect(() => { refetch(); }), [refetch]);

  // Keep the newest message in view: when the tab opens, and whenever one arrives or is sent.
  const threadRef = useRef<HTMLDivElement>(null);
  const messageCount = (data?.patient?.consultations ?? []).reduce((n: number, c: any) => n + (c.messages?.length ?? 0), 0);
  useEffect(() => {
    if (tab !== 'messages') return;
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [tab, messageCount]);
  const { data: onboardingData } = useQuery(GET_ONBOARDING_SUBMISSION, { variables: { patientId } });
  const [updatePatient, { loading: saving }] = useMutation(UPDATE_PATIENT, {
    refetchQueries: [{ query: GET_PATIENTS }],
  });
  const [sendMessage, { loading: sending }] = useMutation(SEND_MESSAGE, {
    refetchQueries: [{ query: GET_PATIENT, variables: { id: patientId } }],
  });
  const { data: ordersData } = useQuery(PATIENT_ORDERS, { variables: { patientId } });
  const { data: prescriptionsData } = useQuery(PATIENT_PRESCRIPTIONS, { variables: { patientId } });
  // Null for programmes without a Weight Journey (e.g. HRT), which hides the tab.
  const { data: weightData } = useQuery(GET_WEIGHT_JOURNEY, { variables: { patientId }, skip: !hasAccess(['ADMIN', 'DOCTOR']) });
  const { data: symptomsData } = useQuery(PATIENT_SYMPTOM_ASSESSMENTS, { variables: { patientId } });
  const [rescheduleCheckIn, { loading: rescheduling }] = useMutation(RESCHEDULE_CHECK_IN, {
    refetchQueries: [{ query: GET_PATIENT, variables: { id: patientId } }],
  });

  const p = data?.patient;
  const onboarding = onboardingData?.onboardingSubmission;
  const weightJourney = weightData?.weightJourneyForPatient;
  const symptomAssessments = symptomsData?.patientSymptomAssessments ?? [];

  if (loading) return (
    <LoadingState label={t('Loading…')} className="flex-1" />
  );
  if (!p) return null;

  const age = differenceInYears(new Date(), new Date(p.dateOfBirth));
  const latestConsult = p.consultations?.[0];
  const orders = ordersData?.patientOrders ?? [];
  // Includes prescriptions from later dose changes, which have no consultation.
  const allPrescriptions = prescriptionsData?.patientPrescriptions ?? [];
  const allMessages = (p.consultations?.flatMap((c: any) => c.messages ?? []) ?? []).sort(
    (a: any, b: any) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime(),
  );
  const checkIns = p.checkIns ?? [];
  const latestConsultId = p.consultations?.[0]?.id;
  const status = TREATMENT_STATUS[treatmentStatusOf(p, allPrescriptions)];

  const handleReply = async () => {
    if (!reply.trim() || !latestConsultId) return;
    await sendMessage({ variables: { input: { consultationId: latestConsultId, content: reply.trim() } } });
    setReply('');
  };

  const handleRescheduleCheckIn = async (id: string) => {
    if (!checkInDate) return;
    await rescheduleCheckIn({ variables: { id, dueAt: new Date(checkInDate).toISOString() } });
    setEditingCheckInId(null);
    setCheckInDate('');
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
      <p className="text-xs text-gray-400 mb-0.5">{t(label)}</p>
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
    onboarding?.status === 'PENDING_REVIEW' ? `${t('Onboarding')} ⚠️` : t('Onboarding');

  const TABS: { key: Tab; label: string }[] = [
    { key: 'overview',      label: t('Overview') },
    { key: 'onboarding',    label: onboardingLabel },
    { key: 'prescriptions', label: `${t('Prescriptions')} (${allPrescriptions.length})` },
    { key: 'orders',        label: `${t('Orders')} (${orders.length})` },
    { key: 'messages',      label: `${t('Messages')} (${allMessages.length})` },
    { key: 'checkin',       label: t('Check-in') },
    ...(canReviewOnboarding ? [{ key: 'labs' as Tab, label: t('Labs') }] : []),
    ...(weightJourney ? [{ key: 'weight' as Tab, label: t('Weight') }] : []),
    // Hormone programmes track symptoms instead of weight.
    ...(symptomAssessments.length > 0 || ['HRT', 'TRT'].includes(latestConsult?.kind)
      ? [{ key: 'symptoms' as Tab, label: t('Symptoms') }]
      : []),
  ];

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-200">
      {p.consultations?.map((c: any) => (
        <MessageWatcher key={c.id} consultationId={c.id} onMessage={() => { refetch(); }} />
      ))}
      {/* Panel header */}
      <div className="px-5 py-4 border-b border-gray-200 flex items-start justify-between">
        <div>
          <p className="font-semibold text-gray-900 text-base">{p.firstName} {p.lastName}</p>
          <p className="text-xs text-gray-400 mt-0.5">{p.email} · {t('{n} yrs', { n: age })}</p>
          <div className="flex gap-2 mt-2">
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${status.cls}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
              {t(status.label)}
            </span>
            {latestConsult && (
              <span className={`text-xs font-medium px-2 py-0.5 rounded ${KIND_BADGE[latestConsult.kind]}`}>
                {latestConsult.kind}
              </span>
            )}
            {currentMedications(allPrescriptions).map((m, i) => <MedicationPill key={i} label={m.label} dose={m.dose} solid />)}
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
            <PatientSnapshot
              patient={p}
              journey={weightJourney ?? null}
              prescriptions={allPrescriptions}
              messages={allMessages}
              canSeeAdherence={hasAccess(['ADMIN', 'DOCTOR'])}
              canReviewLabs={canReviewOnboarding}
              onOpenTab={setTab}
            />

            {/* Basic details card */}
            <div className="bg-gray-50 rounded-md p-4 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('Basic details')}</p>
                {isAdmin && !editing && (
                  <button onClick={() => setEditing(true)} className="text-xs text-brand-500 hover:text-brand-900">{t('Edit')}</button>
                )}
                {editing && (
                  <div className="flex gap-2">
                    <button onClick={() => { setEditing(false); setForm({}); }} className="text-xs text-gray-400 hover:text-gray-600">{t('Cancel')}</button>
                    <button onClick={handleSave} disabled={saving} className="text-xs bg-brand-500 text-white px-2.5 py-1 rounded-md hover:bg-brand-600 disabled:opacity-50">
                      {saving ? t('Saving…') : t('Save')}
                    </button>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                {field('firstName', 'First name', p.firstName)}
                {field('lastName', 'Last name', p.lastName)}
                {field('email', 'Email', p.email, 'email')}
                {field('dateOfBirth', 'Date of birth', fmt(p.dateOfBirth, 'yyyy-MM-dd'), 'date')}
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">{t('Age')}</p>
                  <p className="text-sm text-gray-800 font-medium">{t('{n} years', { n: age })}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">{t('Joined')}</p>
                  <p className="text-sm text-gray-800 font-medium">{timeAgo(p.createdAt)}</p>
                </div>
              </div>
            </div>

            {/* Consultation history */}
            {p.consultations?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{t('Consultations')}</p>
                <div className="space-y-3">
                  {p.consultations.map((c: any) => (
                    <div key={c.id} className="border border-gray-100 rounded-md p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex gap-2">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded ${KIND_BADGE[c.kind]}`}>{c.kind}</span>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded ${STATUS_BADGE[c.status]}`}>{t(c.status.replace(/_/g, ' '))}</span>
                        </div>
                        <span className="text-xs text-gray-400">{timeAgo(c.submittedAt)}</span>
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
                {onboarding ? t('Patient hasn’t submitted onboarding yet.') : t('Patient hasn’t started onboarding yet.')}
              </div>
            ) : (
              <div className="space-y-5">
                <OnboardingReview onboarding={onboarding} />
                <div>
                  {onboarding.status === 'PENDING_REVIEW' && (
                        <p className="text-xs text-gray-400 border-t border-gray-100 pt-4">
                          {t('Onboarding is approved together with the consultation, in the review queue.')}{' '}
                          <Link href="/queue" className="font-medium text-brand-500 hover:underline">{t('Open the queue →')}</Link>
                        </p>
                      )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Prescriptions ── */}
        {tab === 'prescriptions' && (
          <div className="p-5">
            {allPrescriptions.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-400">{t('No prescriptions issued yet.')}</div>
            ) : (
              <div className="space-y-4">
                {allPrescriptions.map((rx: any) => <PrescriptionCard key={rx.id} prescription={rx} patientId={p.id} />)}
              </div>
            )}
          </div>
        )}

        {/* ── Orders ── */}
        {tab === 'orders' && (
          <div className="py-2">
            {orders.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-400">{t('No orders yet.')}</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {orders.map((order: any) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    showPatient={false}
                    refetchQueries={[{ query: PATIENT_ORDERS, variables: { patientId } }, { query: GET_ORDERS }]}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Messages ── */}
        {tab === 'messages' && (
          <div className="flex flex-col h-full">
            {/* Message thread */}
            <div ref={threadRef} className="flex-1 overflow-y-auto p-5 space-y-3">
              {allMessages.length === 0 ? (
                <div className="py-12 text-center text-sm text-gray-400">{t('No messages yet.')}</div>
              ) : (
                allMessages.map((msg: any) => {
                  const isPatient = msg.senderRole === 'PATIENT';
                  return (
                    <div key={msg.id} className={`flex ${isPatient ? 'justify-start' : 'justify-end'}`}>
                      <div className={`max-w-[80%] rounded-lg px-4 py-2.5 text-sm ${
                        isPatient
                          ? 'bg-gray-100 text-gray-800 rounded-tl-sm'
                          : 'bg-brand-500 text-white rounded-tr-sm'
                      }`}>
                        <p className={`text-xs mb-1 font-medium ${isPatient ? 'text-gray-500' : 'text-blue-100'}`}>
                          {isPatient ? p.firstName : t('Clinician team')}
                        </p>
                        <p>{msg.content}</p>
                        <p className={`text-xs mt-1 ${isPatient ? 'text-gray-400' : 'text-blue-200'}`}>
                          {timeAgo(msg.sentAt)}
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
                    placeholder={t('Reply to patient…')}
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleReply(); } }}
                    className="flex-1 resize-none border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <button
                    onClick={handleReply}
                    disabled={!reply.trim() || sending}
                    className="self-end px-4 py-2 bg-brand-500 text-white text-sm rounded-md hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {sending ? '…' : t('Send')}
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1.5">{t('Enter to send · Shift+Enter for new line')}</p>
              </div>
            ) : (
              <div className="border-t border-gray-100 p-4 text-center text-xs text-gray-400">
                {t('No active consultation to message against.')}
              </div>
            )}
          </div>
        )}

        {/* ── Weight ── */}
        {tab === 'weight' && weightJourney && (
          <WeightJourneyPanel journey={weightJourney} patientId={patientId} canCorrect={hasAccess(['ADMIN', 'DOCTOR'])} />
        )}

        {/* ── Symptoms ── */}
        {tab === 'symptoms' && <SymptomsPanel assessments={symptomAssessments} />}

        {/* ── Labs ── */}
        {tab === 'labs' && <LabsPanel patientId={patientId} canRecord={canReviewOnboarding} />}

        {/* ── Check-in ── */}
        {tab === 'checkin' && (
          <div className="p-5">
            <div className="bg-gray-50 rounded-md p-4 mb-4">
              <p className="text-sm font-semibold text-gray-800">{t('Check-in')}</p>
              <p className="text-xs text-gray-500 mt-1">
                {t('Every 4 weeks the patient is automatically emailed a check-in quiz to review progress and confirm whether to reorder.')}
              </p>
            </div>

            {!p.activatedAt ? (
              <div className="border border-gray-100 rounded-md p-4 text-center text-sm text-gray-400">
                {t('Check-in schedule starts once the patient activates their account.')}
              </div>
            ) : checkIns.length === 0 ? (
              <div className="border border-gray-100 rounded-md p-4 text-center text-sm text-gray-400">
                {t('First check-in hasn’t been scheduled yet.')}
              </div>
            ) : (
              <div className="space-y-3">
                {checkIns.map((c: any) => {
                  const dueDate = new Date(c.dueAt);
                  const overdue = c.status !== 'COMPLETED' && dueDate < new Date();
                  return (
                    <div key={c.id} className="border border-gray-100 rounded-md p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded ${
                            c.status === 'COMPLETED'
                              ? 'bg-green-50 text-green-700'
                              : overdue
                                ? 'bg-red-50 text-red-700'
                                : c.status === 'SENT'
                                  ? 'bg-blue-50 text-blue-700'
                                  : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {c.status === 'COMPLETED' ? t('Completed') : overdue ? t('Overdue') : c.status === 'SENT' ? t('Sent — awaiting response') : t('Scheduled')}
                        </span>
                        <span className="flex items-center gap-3">
                          {c.reportUrl && hasAccess(['ADMIN', 'DOCTOR']) && (
                            <button type="button" onClick={() => openAuthedDocument(c.reportUrl, t)} className="text-xs font-medium text-brand-500 hover:underline">{t('Report PDF')}</button>
                          )}
                          <span className="text-xs text-gray-400 font-mono">#{c.id.slice(-8)}</span>
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div>
                          <p className="text-xs text-gray-400">{t('Scheduled')}</p>
                          <p className="text-xs font-medium text-gray-800 mt-0.5">{fmt(c.createdAt, 'dd MMM yyyy')}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400">{t('Due')}</p>
                          <p className={`text-xs font-medium mt-0.5 ${overdue ? 'text-red-600' : 'text-gray-800'}`}>
                            {fmt(dueDate, 'dd MMM yyyy')}
                          </p>
                        </div>
                        {c.sentAt && (
                          <div>
                            <p className="text-xs text-gray-400">{t('Sent')}</p>
                            <p className="text-xs font-medium text-gray-800 mt-0.5">
                              {timeAgo(c.sentAt)}
                            </p>
                          </div>
                        )}
                        {c.status === 'SENT' && c.tokenExpiresAt && (
                          <div>
                            <p className="text-xs text-gray-400">{t('Link expires')}</p>
                            <p className="text-xs font-medium text-gray-800 mt-0.5">{fmt(c.tokenExpiresAt, 'dd MMM yyyy')}</p>
                          </div>
                        )}
                        {c.completedAt && (
                          <div>
                            <p className="text-xs text-gray-400">{t('Completed')}</p>
                            <p className="text-xs font-medium text-gray-800 mt-0.5">
                              {timeAgo(c.completedAt)}
                            </p>
                          </div>
                        )}
                      </div>

                      {c.status === 'SENT' && c.checkInUrl && (
                        <div className="mb-3">
                          <p className="text-xs text-gray-400 mb-1">{t('Check-in link')}</p>
                          <div className="flex items-center gap-2">
                            <input
                              readOnly
                              value={c.checkInUrl}
                              onClick={(e) => e.currentTarget.select()}
                              className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-600 bg-gray-50 truncate"
                            />
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(c.checkInUrl);
                                setCopiedCheckInId(c.id);
                                setTimeout(() => setCopiedCheckInId((cur) => (cur === c.id ? null : cur)), 2000);
                              }}
                              className="shrink-0 text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-100 text-gray-700"
                            >
                              {copiedCheckInId === c.id ? t('Copied!') : t('Copy')}
                            </button>
                          </div>
                        </div>
                      )}

                      {c.status === 'COMPLETED' ? (
                        <div className="space-y-2 mt-2">
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-gray-400">{t('Reorder prescription:')}</p>
                            <span className={`text-xs font-medium px-2 py-0.5 rounded ${c.wantsToReorder ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                              {c.wantsToReorder ? t('Yes') : t('No')}
                            </span>
                          </div>
                          {c.answers?.map((a: any) => (
                            <div key={a.questionId} className="bg-gray-50 rounded-lg px-3 py-2">
                              <p className="text-xs text-gray-400">{a.question}</p>
                              <p className="text-xs font-medium text-gray-800 mt-0.5">{a.answer}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <>
                          <p className="text-xs text-gray-400">
                            {c.status === 'SENT' ? t('Waiting for the patient to complete their check-in.') : t('Will be emailed automatically once due.')}
                          </p>
                          {process.env.NODE_ENV !== 'production' && c.status !== 'COMPLETED' && canReviewOnboarding && (
                            editingCheckInId === c.id ? (
                              <div className="mt-2 flex items-center gap-2">
                                <input
                                  type="datetime-local"
                                  value={checkInDate}
                                  onChange={(e) => setCheckInDate(e.target.value)}
                                  className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                                  autoFocus
                                />
                                <button
                                  onClick={() => handleRescheduleCheckIn(c.id)}
                                  disabled={!checkInDate || rescheduling}
                                  className="text-xs px-2.5 py-1.5 bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-40"
                                >
                                  {rescheduling ? '…' : t('Save')}
                                </button>
                                <button
                                  onClick={() => { setEditingCheckInId(null); setCheckInDate(''); }}
                                  className="text-xs text-gray-400 hover:text-gray-600"
                                >
                                  {t('Cancel')}
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => {
                                  setEditingCheckInId(c.id);
                                  const now = new Date();
                                  const pad = (n: number) => String(n).padStart(2, '0');
                                  setCheckInDate(
                                    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`,
                                  );
                                }}
                                className="mt-2 text-xs text-brand-500 hover:text-brand-900"
                              >
                                {t('Edit due date')}
                              </button>
                            )
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
