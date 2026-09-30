'use client';

import { useEffect } from 'react';
import { useQuery } from '@apollo/client';
import Link from 'next/link';
import { format, formatDistanceToNow } from 'date-fns';
import { MY_CONSULTATION } from '@/graphql/consultations';
import { ME_NAME } from '@/graphql/patient';
import { getToken, parseJwt } from '@/lib/auth';
import { ChatDock, ChatIcon } from '@/components/consultation/ChatDock';
import { ProgressTracker, trackerSteps } from '@/components/consultation/ProgressTracker';
import { useConversationChat } from '@/components/consultation/useConsultationChat';
import { ConversationWatchers } from '@/components/consultation/ConversationWatchers';

const KIND_LABEL: Record<string, string> = { HRT: 'HRT treatment', GLP1: 'GLP-1 weight management' };

type Hero = { emoji: string; title: string; body: string; tone: string };

function heroFor(status: string, firstName: string | undefined, prescription: any): Hero {
  const hi = firstName ? `, ${firstName}` : '';
  switch (status) {
    case 'IN_REVIEW':
      return {
        emoji: '🩺', tone: 'from-brand-50 via-white to-white border-brand-100',
        title: 'A clinician is reviewing your case',
        body: 'They’re going through your answers now. If they need anything, they’ll message you here.',
      };
    case 'MORE_INFO_REQUESTED':
      return {
        emoji: '💬', tone: 'from-amber-50 via-white to-white border-amber-100',
        title: 'We need a little more from you',
        body: 'Your clinician has asked a question. Reply in chat or update your answers, and we’ll pick things straight back up.',
      };
    case 'APPROVED':
      if (prescription?.deliveredAt) {
        return { emoji: '📦', tone: 'from-emerald-50 via-white to-white border-emerald-100', title: 'Your treatment has arrived', body: 'Follow the directions on your prescription, and message us if you have any questions.' };
      }
      if (prescription?.dispatchedAt) {
        return { emoji: '🚚', tone: 'from-emerald-50 via-white to-white border-emerald-100', title: 'Your treatment is on its way', body: 'It’s been dispatched. You can follow it below.' };
      }
      return { emoji: '🎉', tone: 'from-emerald-50 via-white to-white border-emerald-100', title: `You’re approved${hi}!`, body: 'Your prescription has been issued and is being prepared for dispatch.' };
    case 'DECLINED':
      return {
        emoji: '🤍', tone: 'from-slate-100 via-white to-white border-slate-200',
        title: 'We couldn’t approve this request',
        body: 'Sorry — this treatment isn’t right for you at the moment. Your clinician’s message explains why, and your GP can talk through other options with you.',
      };
    default:
      return {
        emoji: '📝', tone: 'from-brand-50 via-white to-white border-brand-100',
        title: `Thanks${hi} — we’ve got your request`,
        body: 'A clinician will look through your answers shortly. There’s nothing you need to do right now.',
      };
  }
}

function Skeleton() {
  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto space-y-6 animate-pulse">
      <div className="h-4 w-40 rounded bg-slate-200" />
      <div className="h-48 rounded-3xl bg-slate-100" />
      <div className="h-64 rounded-3xl bg-slate-100" />
    </div>
  );
}

export default function ConsultationPage({ params }: { params: { id: string } }) {
  const { data, loading, error } = useQuery(MY_CONSULTATION, { variables: { id: params.id } });
  const { data: nameData } = useQuery(ME_NAME);

  const token = getToken();
  const currentUserId = token ? parseJwt(token)?.sub : null;
  const c = data?.myConsultation;

  const chat = useConversationChat({ currentUserId });
  const messages = chat.messages;

  // Links like "Message my clinician" land here with ?chat=open, straight into the conversation.
  // Only on arrival — the dock's setter changes every render, and closing it must stick.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('chat') === 'open') chat.setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <Skeleton />;
  if (error) return <div className="p-8 text-sm text-danger-500">{error.message}</div>;
  if (!c) return null;

  const firstName: string | undefined = nameData?.me?.firstName;
  const hero = heroFor(c.status, firstName, c.prescription);
  const { steps, done, attention, stopped } = trackerSteps(c.status, c.submittedAt, c.updatedAt, c.prescription);
  const latest = messages[messages.length - 1];
  const waiting = ['SUBMITTED', 'IN_REVIEW', 'MORE_INFO_REQUESTED'].includes(c.status);

  return (
    <div className="h-full flex">
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="p-4 sm:p-8 max-w-5xl mx-auto space-y-6">
          <Link href="/consultations" className="text-xs text-slate-400 hover:text-slate-600">← My consultations</Link>

          {/* Where things stand */}
          <section className={`rounded-3xl border bg-gradient-to-br p-5 sm:p-8 shadow-sm ${hero.tone}`}>
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 shrink-0 rounded-2xl bg-white shadow-sm border border-slate-100 flex items-center justify-center text-2xl">
                {hero.emoji}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-500">
                  {KIND_LABEL[c.kind] ?? c.kind} · sent {formatDistanceToNow(new Date(c.submittedAt), { addSuffix: true })}
                </p>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mt-0.5">{hero.title}</h1>
                <p className="text-sm text-slate-600 mt-1.5 max-w-xl">{hero.body}</p>
                <div className="flex flex-wrap gap-2 mt-4">
                  {c.status === 'MORE_INFO_REQUESTED' && (
                    <Link
                      href="/onboarding/medical-questionnaire?from=dashboard"
                      className="text-sm font-medium bg-brand-600 hover:bg-brand-700 text-white rounded-xl px-4 py-2 transition-colors"
                    >
                      Update my answers
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => chat.setOpen(true)}
                    className="text-sm font-medium bg-white border border-slate-200 hover:border-brand-500 text-slate-700 rounded-xl px-4 py-2 transition-colors"
                  >
                    Open chat{chat.unread > 0 ? ` · ${chat.unread} new` : ''}
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-8">
              <ProgressTracker steps={steps} done={done} attention={attention} stopped={stopped} />
            </div>
          </section>

          <div className="flex flex-wrap gap-6 items-start">
            {/* Their answers */}
            <div className="flex-[2_1_420px] min-w-0">
              {c.quizAnswers?.length > 0 && (
                <details open className="group bg-white rounded-3xl border border-slate-100 shadow-sm">
                  <summary className="flex items-center justify-between cursor-pointer list-none px-5 sm:px-6 py-4">
                    <div>
                      <h2 className="text-sm font-semibold text-slate-900">Your answers</h2>
                      <p className="text-xs text-slate-400 mt-0.5">What you told us — {c.quizAnswers.length} {c.quizAnswers.length === 1 ? 'question' : 'questions'}</p>
                    </div>
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-slate-400 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </summary>
                  <div className="px-5 sm:px-6 pb-5 grid gap-3 sm:grid-cols-2">
                    {c.quizAnswers.map((a: any) => (
                      <div key={a.questionId} className="rounded-2xl bg-slate-50 px-4 py-3">
                        <p className="text-xs text-slate-400">{a.question}</p>
                        <p className="text-sm font-medium text-slate-800 mt-1 whitespace-pre-wrap">{a.answer}</p>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>

            <aside className="flex-[1_1_270px] min-w-0 space-y-4">
              {/* Care team */}
              <button
                type="button"
                onClick={() => chat.setOpen(true)}
                className="w-full text-left bg-white rounded-3xl border border-slate-100 shadow-sm p-5 hover:border-brand-100 hover:shadow transition"
              >
                <div className="flex items-center gap-3">
                  <div className="relative w-10 h-10 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center">
                    <ChatIcon className="w-5 h-5" />
                    {chat.unread > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                        {chat.unread > 9 ? '9+' : chat.unread}
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Your care team</p>
                    <p className="text-xs text-slate-400">{chat.unread > 0 ? `${chat.unread} new ${chat.unread === 1 ? 'message' : 'messages'}` : 'Message your clinician any time'}</p>
                  </div>
                </div>
                {latest && (
                  <div className="mt-3 rounded-2xl bg-slate-50 px-3.5 py-2.5">
                    <p className="text-sm text-slate-700 line-clamp-2">
                      {latest.senderId === currentUserId && <span className="text-slate-400">You: </span>}
                      {latest.content}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">{formatDistanceToNow(new Date(latest.sentAt), { addSuffix: true })}</p>
                  </div>
                )}
                <p className="text-xs font-medium text-brand-600 mt-3">Open chat →</p>
              </button>

              {/* Treatment */}
              {c.prescription ? (
                <div className="bg-white rounded-3xl border border-emerald-100 shadow-sm p-5">
                  <h3 className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-4">Your treatment</h3>
                  <dl className="space-y-3 text-sm">
                    <div>
                      <dt className="text-xs text-slate-400">Medication</dt>
                      <dd className="font-semibold text-slate-900 mt-0.5">{c.prescription.medication}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-400">Dosage</dt>
                      <dd className="text-slate-700 mt-0.5">{c.prescription.dosage}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-400">How to take it</dt>
                      <dd className="text-slate-700 mt-0.5">{c.prescription.instructions}</dd>
                    </div>
                    {c.prescription.pharmacyRef && (
                      <div>
                        <dt className="text-xs text-slate-400">Pharmacy reference</dt>
                        <dd className="text-slate-700 mt-0.5 font-mono text-xs">{c.prescription.pharmacyRef}</dd>
                      </div>
                    )}
                    <div>
                      <dt className="text-xs text-slate-400">Issued</dt>
                      <dd className="text-slate-700 mt-0.5">{format(new Date(c.prescription.issuedAt), 'd MMM yyyy')}</dd>
                    </div>
                  </dl>
                  {c.prescription.trackingUrl && !c.prescription.deliveredAt && (
                    <a href={c.prescription.trackingUrl} target="_blank" rel="noreferrer" className="inline-block mt-4 text-sm font-medium text-brand-600 hover:text-brand-700">
                      Track my delivery →
                    </a>
                  )}
                </div>
              ) : c.status !== 'DECLINED' ? (
                <div className="rounded-3xl border border-dashed border-brand-100 bg-brand-50/50 p-5 text-center">
                  <p className="text-2xl">🌱</p>
                  <p className="text-sm font-semibold text-slate-800 mt-1">Your treatment plan</p>
                  <p className="text-xs text-slate-500 mt-1">It will appear here as soon as your clinician approves your request.</p>
                </div>
              ) : null}

              {waiting && (
                <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">While you wait</h3>
                  <ul className="space-y-2.5 text-sm text-slate-600">
                    <li className="flex gap-2.5"><span className="text-brand-600">✓</span> Keep an eye on chat — your clinician will message you there if they need anything.</li>
                    <li className="flex gap-2.5"><span className="text-brand-600">✓</span> It helps to have a list of your current medicines handy.</li>
                    <li className="flex gap-2.5"><span className="text-brand-600">✓</span> Nothing else to do right now. Come back any time to check on progress.</li>
                  </ul>
                </div>
              )}
            </aside>
          </div>
        </div>
      </div>

      <ConversationWatchers consultationIds={chat.consultationIds} onMessage={chat.receive} />
      <ChatDock
        open={chat.open}
        onOpenChange={chat.setOpen}
        messages={messages}
        unread={chat.unread}
        currentUserId={currentUserId}
        sending={chat.sending}
        loading={chat.loading}
        onSend={chat.send}
      />
    </div>
  );
}
