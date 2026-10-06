'use client';

import { MessageTicks, tickStateOf } from './MessageTicks';
import { useEffect, useRef, useState } from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import type { ChatMessage } from './useConsultationChat';

const QUICK_REPLIES = [
  { label: 'I have a question', text: 'Hi, I have a question about my treatment: ' },
  { label: 'I have an update', text: 'Hi, I wanted to let you know: ' },
  { label: 'I need to change something', text: 'Hi, I need to change something: ' },
];

function dayLabel(d: Date) {
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'd MMM yyyy');
}

export function ChatIcon({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
    </svg>
  );
}

function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <>
      <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-rose-500 opacity-60 animate-ping" />
      <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-rose-500 text-white text-[11px] font-bold flex items-center justify-center">
        {count > 9 ? '9+' : count}
      </span>
    </>
  );
}

// Collapsed: a slim rail (a floating button on phones) with the chat icon and a count of new messages.
// Expanded: a docked thread beside the page (full screen on phones).
// The floating variant, for pages without room for a side rail (onboarding), is a round button in the
// corner that opens a chat window above the page.
export function ChatDock({
  open, onOpenChange, messages, unread, currentUserId, sending, onSend, loading, variant = 'docked', draft,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messages: ChatMessage[];
  unread: number;
  currentUserId: string | null;
  sending: boolean;
  loading: boolean;
  onSend: (content: string) => Promise<unknown>;
  variant?: 'docked' | 'floating';
  /** Text to start the message with, e.g. when opened from "Message our team"; never overwrites typing. */
  draft?: string;
}) {
  const floating = variant === 'floating';
  const [content, setContent] = useState('');
  useEffect(() => {
    if (draft) setContent((c) => (c.trim() ? c : draft));
  }, [draft]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // A new message from the care team while the chat is closed pops up briefly, so it isn't missed.
  const [preview, setPreview] = useState<ChatMessage | null>(null);
  const lastIdRef = useRef<string | undefined>(messages[messages.length - 1]?.id);
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last || last.id === lastIdRef.current) return;
    lastIdRef.current = last.id;
    if (open || last.senderId === currentUserId) return;
    setPreview(last);
    const t = setTimeout(() => setPreview(null), 10_000);
    return () => clearTimeout(t);
  }, [messages, open, currentUserId]);
  useEffect(() => { if (open) setPreview(null); }, [open]);

  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [open, messages.length]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const submit = async () => {
    const text = content.trim();
    if (!text || sending) return;
    await onSend(text);
    setContent('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
  };

  if (!open) {
    return (
      <>
        {preview && (
          <button
            type="button"
            onClick={() => onOpenChange(true)}
            className="fixed z-30 right-4 bottom-20 md:right-24 md:bottom-6 max-w-[320px] text-left bg-white border border-brand-100 shadow-xl rounded-2xl px-4 py-3"
          >
            <p className="text-xs font-semibold text-brand-700">New message from your care team</p>
            <p className="text-sm text-slate-700 mt-0.5 line-clamp-2">{preview.content}</p>
            <p className="text-[11px] font-medium text-brand-600 mt-1.5">Open chat →</p>
          </button>
        )}
        {!floating && <div className="hidden md:flex w-[72px] shrink-0 border-l border-slate-100 bg-white flex-col items-center pt-6 gap-1.5">
          <button
            type="button"
            onClick={() => onOpenChange(true)}
            aria-label={unread > 0 ? `Open chat with your care team, ${unread} new` : 'Open chat with your care team'}
            title="Chat with your care team"
            className="relative w-12 h-12 rounded-2xl bg-brand-50 text-brand-700 flex items-center justify-center hover:bg-brand-100 transition-colors"
          >
            <ChatIcon />
            <UnreadBadge count={unread} />
          </button>
          <span className="text-[11px] font-medium text-slate-400">Chat</span>
        </div>}
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          aria-label={unread > 0 ? `Open chat with your care team, ${unread} new` : 'Open chat with your care team'}
          className={`${floating ? 'md:right-6 md:bottom-6' : 'md:hidden'} fixed right-4 bottom-4 z-30 w-14 h-14 rounded-full bg-brand-600 text-white shadow-lg flex items-center justify-center`}
        >
          <ChatIcon />
          <UnreadBadge count={unread} />
        </button>
      </>
    );
  }

  const rows: Array<{ kind: 'day'; key: string; label: string } | { kind: 'msg'; m: ChatMessage; isMe: boolean; showSender: boolean }> = [];
  messages.forEach((m, i) => {
    const d = new Date(m.sentAt);
    const prev = messages[i - 1];
    const newDay = !prev || dayLabel(new Date(prev.sentAt)) !== dayLabel(d);
    if (newDay) rows.push({ kind: 'day', key: `day-${m.id}`, label: dayLabel(d) });
    rows.push({ kind: 'msg', m, isMe: m.senderId === currentUserId, showSender: newDay || prev.senderId !== m.senderId });
  });

  return (
    <aside
      aria-label="Chat with your care team"
      className={
        floating
          ? 'fixed inset-0 z-40 md:inset-auto md:right-6 md:bottom-6 md:w-[380px] md:h-[min(600px,calc(100vh-3rem))] md:rounded-2xl md:shadow-2xl md:border border-slate-100 bg-white flex flex-col min-h-0 overflow-hidden'
          : 'fixed inset-0 z-40 md:static md:inset-auto md:w-[380px] shrink-0 md:border-l border-slate-100 bg-white flex flex-col min-h-0'
      }
    >
      <div className="shrink-0 px-5 py-4 flex items-center gap-3 bg-gradient-to-br from-brand-600 to-brand-700 text-white">
        <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Your care team</p>
          <p className="text-xs text-white/80">Ask us anything — we’re here to help</p>
        </div>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="Minimise chat"
          title="Minimise"
          className="w-9 h-9 rounded-full flex items-center justify-center text-white/80 hover:bg-white/15 hover:text-white"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 bg-slate-50 space-y-1">
        {loading && <p className="text-xs text-slate-400 text-center">Loading…</p>}
        {!loading && messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <div className="w-14 h-14 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center mb-3">
              <ChatIcon />
            </div>
            <p className="text-sm font-semibold text-slate-700">Say hello 👋</p>
            <p className="text-xs text-slate-400 mt-1">Your clinician will reply here. You’ll see a number on the chat icon when there’s something new.</p>
          </div>
        )}
        {rows.map((row) =>
          row.kind === 'day' ? (
            <div key={row.key} className="flex items-center gap-3 py-2">
              <span className="flex-1 h-px bg-slate-200" />
              <span className="text-[11px] font-medium text-slate-400">{row.label}</span>
              <span className="flex-1 h-px bg-slate-200" />
            </div>
          ) : (
            <div key={row.m.id} className={`flex flex-col ${row.isMe ? 'items-end' : 'items-start'} ${row.showSender ? 'pt-2' : ''}`}>
              {row.showSender && (
                <span className="text-[11px] font-medium text-slate-500 mb-1 px-1">{row.isMe ? 'You' : 'Your care team'}</span>
              )}
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-snug whitespace-pre-wrap break-words ${
                  row.isMe
                    ? 'bg-brand-600 text-white rounded-br-md'
                    : 'bg-white text-slate-900 border border-slate-100 shadow-sm rounded-bl-md'
                }`}
              >
                {row.m.content}
                <span className={`flex items-center justify-end gap-1.5 text-[10px] mt-1 ${row.isMe ? 'text-brand-100' : 'text-slate-400'}`}>
                  {format(new Date(row.m.sentAt), 'HH:mm')}
                  {row.isMe && <MessageTicks state={tickStateOf(row.m)} onDark />}
                </span>
              </div>
            </div>
          ),
        )}
      </div>

      <div className="shrink-0 border-t border-slate-100 bg-white px-4 pt-3 pb-4">
        <div className="flex flex-wrap gap-1.5 pb-2.5">
          {QUICK_REPLIES.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => { setContent((c) => (c.trim() ? c : q.text)); inputRef.current?.focus(); }}
              className="shrink-0 text-xs font-medium text-brand-700 bg-brand-50 rounded-full px-3 py-1.5 hover:bg-brand-100"
            >
              {q.label}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); submit(); }}
          className="flex items-end gap-2 border border-slate-200 rounded-2xl pl-4 pr-1.5 py-1.5 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20"
        >
          <textarea
            ref={inputRef}
            rows={1}
            value={content}
            placeholder="Write a message…"
            onChange={(e) => setContent(e.target.value)}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
            }}
            className="flex-1 resize-none bg-transparent py-2 text-sm focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          <button
            type="submit"
            disabled={sending || !content.trim()}
            aria-label="Send message"
            className="w-9 h-9 rounded-xl bg-brand-600 text-white flex items-center justify-center disabled:bg-slate-200 disabled:text-slate-400"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
          </button>
        </form>
        <p className="text-[11px] text-slate-400 mt-2 px-1">
          In a medical emergency, call your local emergency number instead of using chat.
        </p>
      </div>
    </aside>
  );
}
