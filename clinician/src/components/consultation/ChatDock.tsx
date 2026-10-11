'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useApolloClient, useMutation, useQuery } from '@apollo/client';
import { isToday, isYesterday } from 'date-fns';
import { MARK_MESSAGES_READ, PATIENT_CONVERSATION, SEND_MESSAGE } from '@/graphql/messaging';
import { ConversationWatchers } from './ConversationWatchers';
import { MessageTicks, tickStateOf } from './MessageTicks';
import { realtime } from '@/lib/apollo';
import { useRealtimeConnected } from '@/lib/realtime';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { SkeletonMessages } from '@telehealth/loading';

type Message = { id: string; senderId: string; senderRole: string; content: string; sentAt: string; readAt?: string | null };

// While live updates aren't arriving, poll so the thread still moves.
const FALLBACK_POLL_MS = 10_000;
const OPEN_PREF_KEY = 'clinician.chat.open';
const seenKey = (patientId: string) => `clinician.chat.seen.${patientId}`;

// Unread state is per browser: the backend doesn't track who has read a message.
function readStorage(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function writeStorage(key: string, value: string) {
  try { window.localStorage.setItem(key, value); } catch { /* private mode etc. — the chat still works */ }
}

const QUICK_REPLIES = [
  { label: 'Current medication', text: 'Could you let us know which medicines you’re currently taking, including doses?' },
  { label: 'Blood pressure', text: 'Please send a blood pressure reading taken in the last month.' },
  { label: 'Allergies', text: 'Do you have any known allergies or previous reactions to medication?' },
];

const initials = (name: string) =>
  name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');

function ChatIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
    </svg>
  );
}

// Collapsed: a slim rail with the message icon (and a count of unread messages).
// Expanded: a docked thread beside the case, so the questionnaire stays readable while chatting.
// Remount it per patient (key={patientId}): the open/closed choice carries over to the next patient.
export function ChatDock({
  patientId, patientName, currentUserId,
}: {
  patientId: string;
  patientName: string;
  currentUserId: string | null;
}) {
  const { t, fmt } = useI18n();
  const dayLabel = (d: Date) => (isToday(d) ? t('Today') : isYesterday(d) ? t('Yesterday') : fmt(d, 'd MMM yyyy'));
  const client = useApolloClient();
  const [open, setOpen] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 1024 ? false : readStorage(OPEN_PREF_KEY) === '1')); // on a phone it opens on request, as a full screen
  const [content, setContent] = useState('');
  const [seenAt, setSeenAt] = useState(() => Number(readStorage(seenKey(patientId))) || 0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // One conversation per patient: their messages are stored on each consultation, so merge them.
  const { data, loading, refetch, startPolling, stopPolling } = useQuery(PATIENT_CONVERSATION, { variables: { id: patientId } });
  const connected = useRealtimeConnected(realtime);
  const consultations: Array<{ id: string; messages: Message[] }> = data?.patient?.consultations ?? [];
  const messages: Message[] = useMemo(() => {
    const byId = new Map<string, Message>();
    consultations.forEach((c) => (c.messages ?? []).forEach((m) => byId.set(m.id, m)));
    return [...byId.values()].sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
  // Consultations come newest first; replies go to the newest so they land where the patient looks.
  const replyTo = consultations[0]?.id;

  // The subscription and the send mutation both deliver a new message; add it once.
  const addToCache = (consultationId: string, message: Message) => {
    client.cache.updateQuery({ query: PATIENT_CONVERSATION, variables: { id: patientId } }, (existing) => {
      if (!existing?.patient) return existing;
      return {
        ...existing,
        patient: {
          ...existing.patient,
          consultations: existing.patient.consultations.map((c: any) =>
            c.id !== consultationId || c.messages.some((m: Message) => m.id === message.id)
              ? c
              : { ...c, messages: [...c.messages, message] },
          ),
        },
      };
    });
  };

  // While live updates aren't arriving, poll so the thread still moves.
  useEffect(() => {
    if (connected) return;
    startPolling(FALLBACK_POLL_MS);
    return stopPolling;
  }, [connected, startPolling, stopPolling]);

  // Messages sent while the socket was down were never delivered to it.
  useEffect(() => realtime?.onReconnect(() => { refetch(); }), [refetch]);

  const patchMessages = (consultationId: string, change: (m: Message) => Message) => {
    client.cache.updateQuery({ query: PATIENT_CONVERSATION, variables: { id: patientId } }, (existing) => {
      if (!existing?.patient) return existing;
      return { ...existing, patient: { ...existing.patient, consultations: existing.patient.consultations.map((c: any) => (c.id !== consultationId ? c : { ...c, messages: c.messages.map(change) })) } };
    });
  };

  // Having the thread open reads it: the patient's ticks turn blue. A closed dock is not "reading".
  const [markRead] = useMutation(MARK_MESSAGES_READ);
  const marking = useRef(new Set<string>());
  useEffect(() => {
    if (!open) return;
    for (const c of consultations) {
      if (marking.current.has(c.id) || !(c.messages ?? []).some((m) => m.senderRole === 'PATIENT' && !m.readAt)) continue;
      marking.current.add(c.id);
      const readAt = new Date().toISOString();
      markRead({ variables: { consultationId: c.id } })
        .then(() => patchMessages(c.id, (m) => (m.senderRole === 'PATIENT' && !m.readAt ? { ...m, readAt } : m)))
        .catch(() => undefined)
        .finally(() => marking.current.delete(c.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, data]);

  const [sendMessage, { loading: sending }] = useMutation(SEND_MESSAGE, {
    onCompleted({ sendMessage: message }) {
      if (replyTo) addToCache(replyTo, message);
      setContent('');
      if (inputRef.current) inputRef.current.style.height = 'auto';
    },
  });

  const latestAt = messages.length ? new Date(messages[messages.length - 1].sentAt).getTime() : 0;
  const unread = useMemo(
    () => messages.filter((m) => m.senderId !== currentUserId && new Date(m.sentAt).getTime() > seenAt).length,
    [messages, currentUserId, seenAt],
  );

  // Looking at the thread marks everything up to the latest message as seen.
  useEffect(() => {
    if (open && latestAt > seenAt) {
      setSeenAt(latestAt);
      writeStorage(seenKey(patientId), String(latestAt));
    }
  }, [open, latestAt, seenAt, patientId]);

  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [open, messages.length]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const setOpenPersisted = (next: boolean) => {
    setOpen(next);
    writeStorage(OPEN_PREF_KEY, next ? '1' : '0');
  };

  const submit = () => {
    const text = content.trim();
    if (!text || sending || !replyTo) return;
    sendMessage({ variables: { input: { consultationId: replyTo, content: text } } });
  };

  const insertQuickReply = (text: string) => {
    setContent((c) => (c.trim() ? `${c.trimEnd()} ${text}` : text));
    inputRef.current?.focus();
  };

  const watchers = <ConversationWatchers consultationIds={consultations.map((c) => c.id)} onMessage={addToCache} onRead={(r) => r.byPatient && patchMessages(r.consultationId, (m) => (m.senderRole !== 'PATIENT' && !m.readAt ? { ...m, readAt: r.readAt } : m))} />;

  if (!open) {
    return (
      <div className="fixed bottom-4 right-4 z-30 rounded-full border border-gray-200 bg-white p-1 shadow-lg lg:static lg:z-auto lg:w-14 lg:shrink-0 lg:rounded-none lg:border-0 lg:border-l lg:p-0 lg:pt-4 lg:shadow-none flex flex-col items-center">
        {watchers}
        <button
          type="button"
          onClick={() => setOpenPersisted(true)}
          aria-label={unread > 0 ? t('Open messages, {n} new', { n: unread }) : t('Open messages')}
          title={t('Messages')}
          className="relative w-10 h-10 rounded-md flex items-center justify-center text-gray-500 hover:bg-brand-50 hover:text-brand-900 transition-colors"
        >
          <ChatIcon />
          {unread > 0 && (
            <>
              <span className="absolute -top-1 -right-1 w-[18px] h-[18px] rounded-full bg-red-500 opacity-60 animate-ping" />
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                {unread > 9 ? '9+' : unread}
              </span>
            </>
          )}
        </button>
      </div>
    );
  }

  // Group the thread by day, and collapse the sender label for consecutive messages.
  const rows: Array<{ kind: 'day'; key: string; label: string } | { kind: 'msg'; m: Message; showSender: boolean; isMe: boolean }> = [];
  messages.forEach((m, i) => {
    const d = new Date(m.sentAt);
    const prev = messages[i - 1];
    const newDay = !prev || dayLabel(new Date(prev.sentAt)) !== dayLabel(d);
    if (newDay) rows.push({ kind: 'day', key: `day-${m.id}`, label: dayLabel(d) });
    rows.push({ kind: 'msg', m, isMe: m.senderId === currentUserId, showSender: newDay || prev.senderId !== m.senderId });
  });

  return (
    <aside className="fixed inset-0 z-40 w-full lg:static lg:z-auto lg:w-[360px] shrink-0 border-l border-gray-200 bg-white flex flex-col min-h-0" aria-label={t('Secure messages')}>
      {watchers}
      <div className="h-16 shrink-0 px-4 flex items-center gap-3 border-b border-gray-200">
        <div className="w-9 h-9 rounded-full bg-brand-50 text-brand-900 text-xs font-semibold flex items-center justify-center">
          {initials(patientName)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 truncate">{patientName}</p>
          <p className="text-xs text-gray-500">{t('Secure messages')} · {messages.length === 1 ? t('1 message') : t('{n} messages', { n: messages.length })}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpenPersisted(false)}
          aria-label={t('Minimise messages')}
          title={t('Minimise')}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 4.5l7.5 7.5-7.5 7.5m-6-15l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 bg-gray-50 space-y-1">
        {loading && <SkeletonMessages label={t('Loading…')} />}
        {!loading && messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 px-6">
            <ChatIcon className="w-8 h-8 mb-2" />
            <p className="text-sm font-medium text-gray-600">{t('No messages yet')}</p>
            <p className="text-xs mt-1">{t('Messages you send here go straight to the patient’s portal.')}</p>
          </div>
        )}
        {rows.map((row) =>
          row.kind === 'day' ? (
            <div key={row.key} className="flex items-center gap-3 py-2">
              <span className="flex-1 h-px bg-gray-200" />
              <span className="text-[11px] font-medium text-gray-400">{row.label}</span>
              <span className="flex-1 h-px bg-gray-200" />
            </div>
          ) : (
            <div key={row.m.id} className={`flex flex-col ${row.isMe ? 'items-end' : 'items-start'} ${row.showSender ? 'pt-2' : ''}`}>
              {row.showSender && (
                <span className="text-[11px] font-medium text-gray-500 mb-1 px-1">
                  {row.isMe ? t('You') : row.m.senderRole === 'PATIENT' ? patientName.split(' ')[0] : t('Care team')}
                </span>
              )}
              <div
                className={`max-w-[85%] rounded-lg px-3.5 py-2 text-sm leading-snug whitespace-pre-wrap break-words ${
                  row.isMe
                    ? 'bg-brand-500 text-white rounded-br-md'
                    : 'bg-white text-gray-900 border border-gray-200 rounded-bl-md'
                }`}
              >
                {row.m.content}
                <span className={`flex items-center justify-end gap-1.5 text-[10px] mt-1 ${row.isMe ? 'text-blue-100' : 'text-gray-400'}`}>
                  {fmt(row.m.sentAt, 'HH:mm')}
                  {row.m.senderRole !== 'PATIENT' && <MessageTicks state={tickStateOf(row.m)} onDark={row.isMe} />}
                </span>
              </div>
            </div>
          ),
        )}
      </div>

      <div className="shrink-0 border-t border-gray-200 bg-white px-4 pt-3 pb-4">
        <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1">
          {QUICK_REPLIES.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => insertQuickReply(q.text)}
              className="shrink-0 text-[11px] font-medium text-gray-600 border border-gray-200 rounded-full px-2.5 py-1 hover:border-brand-500 hover:text-brand-900 hover:bg-brand-50"
            >
              {t(q.label)}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); submit(); }}
          className="flex items-end gap-2 border border-gray-300 rounded-md pl-3 pr-1.5 py-1.5 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20"
        >
          <textarea
            ref={inputRef}
            rows={1}
            value={content}
            placeholder={t('Write a message…')}
            onChange={(e) => setContent(e.target.value)}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
            }}
            className="flex-1 resize-none bg-transparent py-1.5 text-sm focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          <button
            type="submit"
            disabled={sending || !content.trim()}
            aria-label={t('Send message')}
            className="w-8 h-8 rounded-lg bg-brand-500 text-white flex items-center justify-center disabled:bg-gray-200 disabled:text-gray-400"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
          </button>
        </form>
        <p className="text-[10px] text-gray-400 mt-1.5 px-1">{t('Enter to send · Shift+Enter for a new line')}</p>
      </div>
    </aside>
  );
}
