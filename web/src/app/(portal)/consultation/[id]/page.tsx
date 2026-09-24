'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useSubscription } from '@apollo/client';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { MY_CONSULTATION } from '@/graphql/consultations';
import { SEND_MESSAGE, NEW_MESSAGE_SUBSCRIPTION } from '@/graphql/messaging';
import { getToken, parseJwt } from '@/lib/auth';

const STATUS_LABELS: Record<string, { label: string; desc: string; cls: string }> = {
  SUBMITTED: { label: 'Under review', desc: 'A clinician will review your case shortly.', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  IN_REVIEW: { label: 'In review', desc: 'A clinician is currently reviewing your case.', cls: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  MORE_INFO_REQUESTED: { label: 'Info requested', desc: 'Your clinician has asked for more information. Please reply below.', cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  APPROVED: { label: 'Approved', desc: 'Your treatment has been approved and a prescription has been issued.', cls: 'bg-green-50 text-green-700 border-green-200' },
  DECLINED: { label: 'Declined', desc: 'Unfortunately your treatment request was not approved. Please contact your GP for further advice.', cls: 'bg-slate-50 text-slate-500 border-slate-200' },
};

export default function ConsultationPage({ params }: { params: { id: string } }) {
  const { data, loading, error } = useQuery(MY_CONSULTATION, { variables: { id: params.id } });
  const [content, setContent] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const token = getToken();
  const currentUserId = token ? parseJwt(token)?.sub : null;

  const [sendMessage, { loading: sending }] = useMutation(SEND_MESSAGE, {
    onCompleted() { setContent(''); },
  });

  useSubscription(NEW_MESSAGE_SUBSCRIPTION, {
    variables: { consultationId: params.id },
    onData({ client, data: { data: subData } }) {
      client.cache.updateQuery(
        { query: MY_CONSULTATION, variables: { id: params.id } },
        (existing) => existing
          ? { myConsultation: { ...existing.myConsultation, messages: [...(existing.myConsultation.messages ?? []), subData.newMessage] } }
          : existing,
      );
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [data]);

  if (loading) return <div className="p-8 text-sm text-slate-400">Loading…</div>;
  if (error) return <div className="p-8 text-sm text-danger-500">{error.message}</div>;

  const c = data?.myConsultation;
  if (!c) return null;

  const statusInfo = STATUS_LABELS[c.status] ?? { label: c.status, desc: '', cls: 'bg-slate-50 text-slate-500 border-slate-200' };
  const messages = c.messages ?? [];

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    sendMessage({ variables: { input: { consultationId: params.id, content: content.trim() } } });
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <Link href="/dashboard" className="text-xs text-slate-400 hover:text-slate-600">← Back to consultations</Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{c.kind} Consultation</h1>
          <p className="text-sm text-slate-400 mt-1">
            Submitted {formatDistanceToNow(new Date(c.submittedAt), { addSuffix: true })}
          </p>
        </div>
      </div>

      {/* Status banner */}
      <div className={`rounded-xl border px-5 py-4 ${statusInfo.cls}`}>
        <p className="font-semibold text-sm">{statusInfo.label}</p>
        <p className="text-sm mt-0.5 opacity-80">{statusInfo.desc}</p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          {/* Quiz answers */}
          {c.quizAnswers?.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100">
              <div className="px-5 py-4 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-900">Your quiz answers</h2>
              </div>
              <div className="divide-y divide-slate-50">
                {c.quizAnswers.map((a: any, i: number) => (
                  <div key={i} className="px-5 py-3">
                    <p className="text-xs text-slate-400">{a.question}</p>
                    <p className="text-sm text-slate-800 mt-0.5">{a.answer}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="bg-white rounded-2xl border border-slate-100 flex flex-col" style={{ height: 420 }}>
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-900">Messages with your clinician</h2>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {messages.length === 0 && (
                <p className="text-xs text-slate-400 text-center mt-8">No messages yet.</p>
              )}
              {messages.map((m: any) => {
                const isMe = m.senderId === currentUserId;
                return (
                  <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-xs rounded-2xl px-4 py-2.5 text-sm ${isMe ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-900'}`}>
                      <p>{m.content}</p>
                      <p className={`text-xs mt-1 ${isMe ? 'text-brand-200' : 'text-slate-400'}`}>
                        {m.senderRole === 'CLINICIAN' ? 'Clinician' : 'You'} · {formatDistanceToNow(new Date(m.sentAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
            <form onSubmit={handleSend} className="px-5 py-4 border-t border-slate-100 flex gap-3">
              <input
                type="text"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Type a message…"
                className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <button
                type="submit"
                disabled={sending || !content.trim()}
                className="bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white font-medium px-5 py-2.5 rounded-xl text-sm transition-colors"
              >
                Send
              </button>
            </form>
          </div>
        </div>

        {/* Prescription sidebar */}
        <aside>
          {c.prescription ? (
            <div className="bg-white rounded-2xl border border-green-200 p-5">
              <h3 className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-4">Prescription</h3>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-xs text-slate-400">Medication</dt>
                  <dd className="font-medium text-slate-900 mt-0.5">{c.prescription.medication}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Dosage</dt>
                  <dd className="text-slate-700 mt-0.5">{c.prescription.dosage}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Instructions</dt>
                  <dd className="text-slate-700 mt-0.5">{c.prescription.instructions}</dd>
                </div>
                {c.prescription.pharmacyRef && (
                  <div>
                    <dt className="text-xs text-slate-400">Pharmacy ref</dt>
                    <dd className="text-slate-700 mt-0.5 font-mono text-xs">{c.prescription.pharmacyRef}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-xs text-slate-400">Issued</dt>
                  <dd className="text-slate-700 mt-0.5">
                    {formatDistanceToNow(new Date(c.prescription.issuedAt), { addSuffix: true })}
                  </dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 p-5 text-center">
              <p className="text-xs text-slate-400">No prescription yet.<br />A clinician will review and issue one if approved.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
