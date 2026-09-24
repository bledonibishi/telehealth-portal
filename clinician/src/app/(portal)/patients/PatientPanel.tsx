'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { formatDistanceToNow, differenceInYears, format } from 'date-fns';
import { GET_PATIENT, UPDATE_PATIENT, GET_PATIENTS } from '@/graphql/patients';
import { hasAccess } from '@/lib/role';

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

type Tab = 'overview' | 'prescriptions' | 'messages' | 'checkin';

export default function PatientPanel({ patientId, onClose }: { patientId: string; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('overview');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const isAdmin = hasAccess(['ADMIN']);

  const { data, loading } = useQuery(GET_PATIENT, { variables: { id: patientId } });
  const [updatePatient, { loading: saving }] = useMutation(UPDATE_PATIENT, {
    refetchQueries: [{ query: GET_PATIENTS }],
  });

  const p = data?.patient;

  if (loading) return (
    <div className="flex-1 flex items-center justify-center text-sm text-gray-400">Loading…</div>
  );
  if (!p) return null;

  const age = differenceInYears(new Date(), new Date(p.dateOfBirth));
  const latestConsult = p.consultations?.[0];
  const allPrescriptions = p.consultations?.flatMap((c: any) => c.prescription ? [{ ...c.prescription, kind: c.kind }] : []) ?? [];
  const allMessages = p.consultations?.flatMap((c: any) => c.messages ?? []) ?? [];

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

  const TABS: { key: Tab; label: string }[] = [
    { key: 'overview',      label: 'Overview' },
    { key: 'prescriptions', label: `Prescriptions (${allPrescriptions.length})` },
    { key: 'messages',      label: `Messages (${allMessages.length})` },
    { key: 'checkin',       label: 'Check-in' },
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
          <div className="p-5 flex flex-col h-full">
            {allMessages.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-400">No messages yet.</div>
            ) : (
              <div className="space-y-3">
                {allMessages.map((msg: any) => {
                  const isPatient = msg.senderRole === 'PATIENT';
                  return (
                    <div key={msg.id} className={`flex ${isPatient ? 'justify-start' : 'justify-end'}`}>
                      <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                        isPatient
                          ? 'bg-gray-100 text-gray-800 rounded-tl-sm'
                          : 'bg-brand-500 text-white rounded-tr-sm'
                      }`}>
                        <p className={`text-xs mb-1 font-medium ${isPatient ? 'text-gray-500' : 'text-blue-100'}`}>
                          {isPatient ? `${p.firstName}` : 'Clinician'}
                        </p>
                        <p>{msg.content}</p>
                        <p className={`text-xs mt-1 ${isPatient ? 'text-gray-400' : 'text-blue-200'}`}>
                          {formatDistanceToNow(new Date(msg.sentAt), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Check-in ── */}
        {tab === 'checkin' && (
          <div className="p-5">
            <div className="bg-gray-50 rounded-xl p-4 mb-4">
              <p className="text-sm font-semibold text-gray-800">Monthly check-in</p>
              <p className="text-xs text-gray-500 mt-1">
                After 1 month of treatment, the patient will receive a check-in quiz to review progress and reorder their prescription.
              </p>
            </div>

            {p.activatedAt ? (
              (() => {
                const activatedDate = new Date(p.activatedAt);
                const nextCheckIn = new Date(activatedDate.getTime() + 30 * 86_400_000);
                const overdue = nextCheckIn < new Date();
                return (
                  <div className="space-y-3">
                    <div className="border border-gray-100 rounded-xl p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-gray-700">Next check-in due</p>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${overdue ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
                          {overdue ? 'Overdue' : formatDistanceToNow(nextCheckIn, { addSuffix: true })}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">{format(nextCheckIn, 'dd MMM yyyy')}</p>
                    </div>
                    <div className="border border-gray-100 rounded-xl p-4 text-center">
                      <p className="text-sm text-gray-500 mb-3">No check-ins completed yet</p>
                      <p className="text-xs text-gray-400">The patient will complete check-ins through the patient app. Results will appear here.</p>
                    </div>
                  </div>
                );
              })()
            ) : (
              <div className="border border-gray-100 rounded-xl p-4 text-center text-sm text-gray-400">
                Check-in schedule starts once the patient activates their account.
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
