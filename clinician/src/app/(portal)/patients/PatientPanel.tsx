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
import CheckInTab from '@/components/patients/CheckInTab';
import { DraftReplyButton, TranslateMessage, UrgentTag, useUrgentMessages } from '@/components/ai/MessageAiTools';
import { OnboardingReview } from '@/components/onboarding/OnboardingReview';
import WeightJourneyPanel from '@/components/weight/WeightJourneyPanel';
import { GET_WEIGHT_JOURNEY } from '@/graphql/weight';
import LabsPanel from '@/components/labs/LabsPanel';
import { PATIENT_LAB_REPORTS } from '@/graphql/labs';
import PatientDashboardCards from '@/components/tickets/PatientDashboardCards';
import SymptomsPanel from '@/components/symptoms/SymptomsPanel';
import { PATIENT_SYMPTOM_ASSESSMENTS } from '@/graphql/symptoms';
import { hasAccess } from '@/lib/role';
import PatientSnapshot, { currentMedications, treatmentStatusOf } from '@/components/patients/PatientSnapshot';
import MedicationPill from '@/components/patients/MedicationPill';
import { TREATMENT_STATUS } from '@/lib/patient-status';
import { LoadingState } from '@telehealth/loading';
import { SearchInput } from '@/components/ui/SearchInput';

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

export type Tab = 'overview' | 'prescriptions' | 'orders' | 'onboarding' | 'messages' | 'checkin' | 'weight' | 'symptoms' | 'labs' | 'homescreen';
export const TABS: Tab[] = ['overview', 'prescriptions', 'orders', 'onboarding', 'messages', 'checkin', 'weight', 'symptoms', 'labs', 'homescreen'];

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
  const [rxQuery, setRxQuery] = useState('');
  const urgentMessages = useUrgentMessages(patientId);

  const isAdmin = hasAccess(['ADMIN']);
  const canReviewOnboarding = hasAccess(['ADMIN', 'DOCTOR']);
  // Support and admins settle what the patient's home screen shows, for a while.
  const canSetHomeScreen = hasAccess(['ADMIN', 'CX_TEAM']);

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

  const p = data?.patient;
  // Lab reports a patient has sent in that nobody has entered yet, shown on the Labs tab.
  const { data: labReportData } = useQuery(PATIENT_LAB_REPORTS, { variables: { patientId }, skip: !canReviewOnboarding, pollInterval: 60_000 });
  const waitingLabReports = (labReportData?.patientLabReports ?? []).filter((r: any) => r.status === 'PENDING').length;
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
  // Numbered oldest first, so "Check-in 2" means the same thing on the prescription and on the Check-in tab.
  const numberedCheckIns = [...checkIns].sort((a: any, b: any) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()).map((c: any, i: number) => ({ ...c, number: i + 1 }));
  // A prescription matches its own id (full or the short "#x2xval74"), its medicine, or the id of a check-in tied to it:
  // the one held while it was current, the one that led to it, or (for the current one) the one still to come.
  const rxq = rxQuery.trim().toLowerCase().replace(/^#/, '');
  const openCheckIn = numberedCheckIns.filter((c: any) => c.status !== 'COMPLETED').slice(-1)[0];
  const shownPrescriptions = !rxq
    ? allPrescriptions
    : allPrescriptions.filter(
        (rx: any) =>
          rx.id.toLowerCase().includes(rxq) ||
          rx.medication?.toLowerCase().includes(rxq) ||
          numberedCheckIns.some((c: any) => c.id.toLowerCase().includes(rxq) && (c.prescription?.id === rx.id || c.resultPrescriptionId === rx.id)) ||
          (rx.status === 'ACTIVE' && !!openCheckIn && openCheckIn.id.toLowerCase().includes(rxq)),
      );
  const latestConsultId = p.consultations?.[0]?.id;
  const status = TREATMENT_STATUS[treatmentStatusOf(p, allPrescriptions)];

  const handleReply = async () => {
    if (!reply.trim() || !latestConsultId) return;
    await sendMessage({ variables: { input: { consultationId: latestConsultId, content: reply.trim() } } });
    setReply('');
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
    ...(canSetHomeScreen ? [{ key: 'homescreen' as Tab, label: t('Home screen') }] : []),
    ...(canReviewOnboarding ? [{ key: 'labs' as Tab, label: waitingLabReports ? `${t('Labs')} (${waitingLabReports} ${t('new')})` : t('Labs') }] : []),
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
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-gray-500">
            <span>{p.email}</span>
            <span className="text-gray-300">·</span>
            <span>{t('Born {date} ({n})', { date: fmt(p.dateOfBirth, 'd MMM yyyy'), n: age })}</span>
            <span className="text-gray-300">·</span>
            <span>{t('joined {when}', { when: timeAgo(p.createdAt) })}</span>
            {isAdmin && !editing && (
              <>
                <span className="text-gray-300">·</span>
                <button onClick={() => setEditing(true)} className="font-medium text-brand-500 hover:text-brand-900">{t('Edit')}</button>
              </>
            )}
          </p>
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
          {editing && (
            <div className="mt-3 max-w-2xl rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="grid grid-cols-2 gap-4">
                {field('firstName', 'First name', p.firstName)}
                {field('lastName', 'Last name', p.lastName)}
                {field('email', 'Email', p.email, 'email')}
                {field('dateOfBirth', 'Date of birth', fmt(p.dateOfBirth, 'yyyy-MM-dd'), 'date')}
              </div>
              <div className="mt-3 flex justify-end gap-3">
                <button onClick={() => { setEditing(false); setForm({}); }} className="text-sm text-gray-500 hover:text-gray-800">{t('Cancel')}</button>
                <button onClick={handleSave} disabled={saving} className="rounded-lg bg-brand-500 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50">{saving ? t('Saving…') : t('Save')}</button>
              </div>
            </div>
          )}
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


            {/* Consultation history: one line each; the answers open on demand. The latest one's warnings are listed above. */}
            {p.consultations?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('Consultations')}</p>
                <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                  {p.consultations.map((c: any) => (
                    <li key={c.id}>
                      <details className="group">
                        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 hover:bg-gray-50">
                          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 flex-shrink-0 text-gray-400 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden><path d="m9 6 6 6-6 6" /></svg>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded ${KIND_BADGE[c.kind]}`}>{c.kind}</span>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded ${STATUS_BADGE[c.status]}`}>{t(c.status.replace(/_/g, ' '))}</span>
                          {c.redFlags?.length > 0 && (
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.redFlags.some((rf: any) => rf.severity === 'CRITICAL') ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                              {c.redFlags.length === 1 ? t('1 red flag') : t('{n} red flags', { n: c.redFlags.length })}
                            </span>
                          )}
                          <span className="ml-auto text-xs text-gray-400">{c.submittedAt ? fmt(c.submittedAt, 'd MMM yyyy') : '—'}</span>
                        </summary>
                        <div className="space-y-3 border-t border-gray-100 px-4 py-4">
                          {c.redFlags?.length > 0 && (
                            <ul className="space-y-1">
                              {c.redFlags.map((rf: any) => (
                                <li key={rf.id} className={`text-xs ${rf.severity === 'CRITICAL' ? 'font-medium text-red-700' : 'text-amber-700'}`}>• {rf.description}</li>
                              ))}
                            </ul>
                          )}
                          <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
                            {c.quizAnswers?.map((a: any, i: number) => (
                              <div key={i} className="border-b border-gray-50 py-2">
                                <dt className="text-xs text-gray-400">{a.question}</dt>
                                <dd className="text-sm text-gray-900">{a.answer}</dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                      </details>
                    </li>
                  ))}
                </ul>
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
                <SearchInput className="w-full sm:w-80" value={rxQuery} onChange={setRxQuery} placeholder={t('Search by prescription or check-in ID…')} ariaLabel={t('Search by prescription or check-in ID…')} clearLabel={t('Clear search')} />
                {shownPrescriptions.length === 0 && <div className="py-8 text-center text-sm text-gray-400">{t('No prescriptions match.')}</div>}
                {shownPrescriptions.map((rx: any) => (
                  <PrescriptionCard key={rx.id} prescription={rx} patientId={p.id} orders={orders} checkIns={numberedCheckIns} siblings={allPrescriptions} onOpenCheckIn={() => setTab('checkin')} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Orders ── */}
        {tab === 'orders' && (
          <div className="p-5">
            {orders.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-400">{t('No orders yet.')}</div>
            ) : (
              <div className="space-y-4">
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
                        {urgentMessages.has(msg.id) && <p className="mb-1"><UrgentTag reason={urgentMessages.get(msg.id) ?? ''} /></p>}
                        <p>{msg.content}</p>
                        <p className={`text-xs mt-1 ${isPatient ? 'text-gray-400' : 'text-blue-200'}`}>
                          {timeAgo(msg.sentAt)}
                        </p>
                        {isPatient && <TranslateMessage messageId={msg.id} />}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Reply input */}
            {latestConsultId ? (
              <div className="border-t border-gray-100 p-4 bg-white">
                <DraftReplyButton patientId={patientId} consultationId={latestConsultId} onDraft={setReply} className="mb-2" />
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

        {tab === 'homescreen' && canSetHomeScreen && <div className="p-5"><PatientDashboardCards patientId={patientId} /></div>}

        {/* ── Labs ── */}
        {tab === 'labs' && <LabsPanel patientId={patientId} canRecord={canReviewOnboarding} patientName={`${p.firstName} ${p.lastName}`} gender={p.gender} />}

        {/* ── Check-in ── */}
        {tab === 'checkin' && <CheckInTab patient={p} orders={orders} prescriptions={allPrescriptions} onOpenPrescriptions={() => setTab('prescriptions')} />}

      </div>
    </div>
  );
}
