'use client';

import { useEffect, useRef, useState } from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import { getToken, parseJwt } from '@/lib/auth';
import { useConversationChat } from '@/components/consultation/useConsultationChat';
import { ConversationWatchers } from '@/components/consultation/ConversationWatchers';
import { MessageTicks, tickStateOf } from '@/components/consultation/MessageTicks';
import { AttachmentButton, AttachmentChips, MessageAttachments, useChatAttachments } from '@/components/consultation/chat-attachments';
import { EMERGENCY_NUMBER } from '@/lib/contact';
import { Icon } from '@/components/portal/Icon';
import { btnBlue } from '@/components/portal/Card';
import Link from 'next/link';
import { InlineError } from '@/components/common/Alert';
import { SkeletonMessages } from '@telehealth/loading';
import { Dialog } from '@/components/common/Dialog';
import { Alert } from '@/components/common/Alert';
import { Card, CardHeader } from '@/components/portal/Card';
import { RequestForm, type SentRequest } from '@/components/support/RequestForm';
import { RequestList } from '@/components/support/RequestList';

// Starting points for someone who doesn't know what to write: each fills the message box, and nothing is sent until they press Send.
const STARTERS = [
  { label: 'Where is my order?', text: 'Hello, could you tell me where my order is?' },
  { label: 'A question about my treatment', text: 'Hello, I have a question about my treatment: ' },
  { label: 'Help with my account or a payment', text: 'Hello, I need help with my account or a payment: ' },
  { label: 'Something isn’t working in the app', text: 'Hello, something isn’t working in the app: ' },
];

const dayOf = (iso: string) => {
  const d = new Date(iso);
  return isToday(d) ? 'Today' : isYesterday(d) ? 'Yesterday' : format(d, 'EEEE d MMMM');
};

/** The patient's one conversation with their care team, live: new replies arrive without reloading. */
export default function MessagesPage() {
  const token = getToken();
  const currentUserId = token ? parseJwt(token)?.sub ?? null : null;
  const chat = useConversationChat({ currentUserId });
  const [content, setContent] = useState('');
  const [problem, setProblem] = useState<unknown>(null);
  const attach = useChatAttachments();
  const [requesting, setRequesting] = useState(false);
  const [sentRequest, setSentRequest] = useState<SentRequest | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Being on this page is reading the thread.
  useEffect(() => {
    chat.setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.messages.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = content.trim();
    const sending = attach.files;
    if ((!text && sending.length === 0) || attach.uploading) return;
    setProblem(null);
    setContent(''); // it shows in the thread at once, with a single tick, while it is on its way
    attach.reset();
    try {
      await chat.send(text, sending);
    } catch (err: any) {
      setContent(text); // not sent: give the words back
      setProblem(err);
    }
  };

  let lastDay = '';

  return (
    <div className="px-4 sm:px-6 lg:px-8 pb-6 max-w-6xl mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-ink-900">Help & messages</h1>
        <p className="text-sm text-slate-500 mt-1">Write to us here, about your treatment or anything else. Only you and our team can read this conversation.</p>
      </div>

      {sentRequest && (
        <div className="mb-4">
          <Alert tone="success" title={`Request #${sentRequest.number} sent`}>
            {sentRequest.type === 'CLINICAL' ? 'A doctor will read this. We’ll reply in this chat.' : 'Our team has it. We’ll reply in this chat.'}
          </Alert>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] items-start">
      <div className="min-w-0">

      <div className="bg-white rounded-lg border border-slate-200/70 flex flex-col h-[calc(100vh-12rem)] min-h-[420px]">
        <div ref={scroller} className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-3" aria-live="polite">
          {chat.loading && !chat.messages.length && <SkeletonMessages label="Loading your messages…" />}
          {!chat.loading && !chat.messages.length && (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <span className="w-14 h-14 rounded-full bg-ink-50 text-ink-700 flex items-center justify-center mb-4"><Icon name="chat" className="w-6 h-6" /></span>
              <p className="text-lg font-semibold text-ink-900">How can we help?</p>
              <p className="text-sm text-slate-500 mt-1.5 max-w-md">
                Write to us here about your treatment, a delivery, a payment or your account. Questions about your health go to your care team, who reply in this chat.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2 max-w-xl">
                {STARTERS.map((q) => (
                  <button
                    key={q.label}
                    type="button"
                    onClick={() => { setContent(q.text); inputRef.current?.focus(); }}
                    className="text-sm font-medium text-ink-800 bg-ink-50 hover:bg-ink-100 rounded-full px-4 py-2 transition-colors"
                  >
                    {q.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-5">You can also attach a photo or screenshot with the paperclip.</p>
            </div>
          )}
          {chat.messages.map((m) => {
            const mine = m.senderId === currentUserId;
            const day = dayOf(m.sentAt);
            const divider = day !== lastDay;
            lastDay = day;
            return (
              <div key={m.id}>
                {divider && <p className="text-center text-[11px] text-slate-400 my-3">{day}</p>}
                <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-lg px-4 py-2.5 text-sm ${mine ? 'bg-ink-700 text-white rounded-br-md' : 'bg-slate-100 text-slate-800 rounded-bl-md'}`}>
                    {!mine && <p className="text-[11px] font-semibold text-ink-700 mb-0.5">{m.isAi ? 'Automated assistant' : 'Your care team'}</p>}
                    {!!m.content && <p className="whitespace-pre-wrap break-words">{m.content}</p>}
                    <MessageAttachments attachments={m.attachments} onDark={mine} />
                    <p className={`text-[10px] mt-1 flex items-center gap-1.5 ${mine ? 'justify-end text-white/60' : 'text-slate-400'}`}>
                      {format(new Date(m.sentAt), 'HH:mm')}
                      {mine && <MessageTicks state={tickStateOf(m)} onDark />}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <form onSubmit={send} className="border-t border-slate-100 p-3 sm:p-4">
          <AttachmentChips state={attach} />
          <div className="flex items-end gap-2">
            <AttachmentButton state={attach} />
            <label htmlFor="msg" className="sr-only">Your message</label>
            <textarea id="msg" ref={inputRef} rows={1} value={content} maxLength={2000} onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e as any); } }}
              placeholder="Write a message…" className="flex-1 resize-none border border-slate-200 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ink-600 max-h-40" />
            <button type="submit" disabled={(!content.trim() && attach.files.length === 0) || attach.uploading} className={btnBlue}>Send</button>
          </div>
          <InlineError error={problem} size="xs" className="mt-2" />
          <p className="text-[11px] text-slate-400 mt-2">
            Not for emergencies. If it can’t wait, <Link href="/appointments?new=1&urgent=1" className="underline">request an urgent appointment</Link> or call {EMERGENCY_NUMBER}.
          </p>
        </form>
      </div>

      </div>

      <aside className="space-y-4 min-w-0">
        <Card>
          <CardHeader title="Something specific?" subtitle="Send a written request about a payment, a delivery, your account or a question for your doctor, with a photo if it helps." />
          <button type="button" onClick={() => { setSentRequest(null); setRequesting(true); }} className={`${btnBlue} w-full`}>Send a request</button>
        </Card>
        <Card>
          <CardHeader title="Your requests" />
          <RequestList />
        </Card>
      </aside>
      </div>

      {requesting && (
        <Dialog title="Send a request" onClose={() => setRequesting(false)}>
          <RequestForm onSent={(r) => { setSentRequest(r); setRequesting(false); }} />
        </Dialog>
      )}

      <ConversationWatchers consultationIds={chat.consultationIds} onMessage={chat.receive} onRead={chat.receiveRead} />
    </div>
  );
}
