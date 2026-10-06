'use client';

import { useEffect, useRef, useState } from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import { getToken, parseJwt } from '@/lib/auth';
import { useConversationChat } from '@/components/consultation/useConsultationChat';
import { ConversationWatchers } from '@/components/consultation/ConversationWatchers';
import { MessageTicks, tickStateOf } from '@/components/consultation/MessageTicks';
import { EMERGENCY_NUMBER } from '@/lib/contact';
import { Icon } from '@/components/portal/Icon';
import { btnBlue } from '@/components/portal/Card';
import Link from 'next/link';

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
  const [problem, setProblem] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

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
    if (!text) return;
    setProblem(null);
    setContent(''); // it shows in the thread at once, with a single tick, while it is on its way
    try {
      await chat.send(text);
    } catch (err: any) {
      setContent(text); // not sent: give the words back
      setProblem(err?.message ?? 'Couldn’t send that. Please try again.');
    }
  };

  let lastDay = '';

  return (
    <div className="px-4 sm:px-6 lg:px-8 pb-6 max-w-4xl mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-ink-900">Messages</h1>
        <p className="text-sm text-slate-500 mt-1">Talk to your care team in real time. Only you and your clinicians can read this conversation.</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/70 flex flex-col h-[calc(100vh-12rem)] min-h-[420px]">
        <div ref={scroller} className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-3" aria-live="polite">
          {chat.loading && !chat.messages.length && <p className="text-sm text-slate-400">Loading…</p>}
          {!chat.loading && !chat.messages.length && (
            <div className="h-full flex flex-col items-center justify-center text-center text-slate-500">
              <span className="w-12 h-12 rounded-full bg-ink-50 text-ink-700 flex items-center justify-center mb-3"><Icon name="chat" /></span>
              <p className="text-sm font-medium text-ink-900">No messages yet</p>
              <p className="text-xs mt-1 max-w-xs">Ask about your treatment, a side effect or your delivery — your clinician will reply here.</p>
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
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${mine ? 'bg-ink-700 text-white rounded-br-md' : 'bg-slate-100 text-slate-800 rounded-bl-md'}`}>
                    {!mine && <p className="text-[11px] font-semibold text-ink-700 mb-0.5">Your care team</p>}
                    <p className="whitespace-pre-wrap break-words">{m.content}</p>
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
          <div className="flex items-end gap-2">
            <label htmlFor="msg" className="sr-only">Your message</label>
            <textarea id="msg" rows={1} value={content} maxLength={2000} onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e as any); } }}
              placeholder="Write a message…" className="flex-1 resize-none border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ink-600 max-h-40" />
            <button type="submit" disabled={!content.trim()} className={btnBlue}>Send</button>
          </div>
          {problem && <p role="alert" className="text-xs text-red-600 mt-2">{problem}</p>}
          <p className="text-[11px] text-slate-400 mt-2">
            Not for emergencies. If it can’t wait, <Link href="/appointments?new=1&urgent=1" className="underline">request an urgent appointment</Link> or call {EMERGENCY_NUMBER}.
          </p>
        </form>
      </div>

      <ConversationWatchers consultationIds={chat.consultationIds} onMessage={chat.receive} onRead={chat.receiveRead} />
    </div>
  );
}
