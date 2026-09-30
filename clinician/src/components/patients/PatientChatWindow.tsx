'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useApolloClient, useMutation, useQuery } from '@apollo/client';
import { isToday, isYesterday } from 'date-fns';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { PATIENT_CONVERSATION, SEND_MESSAGE } from '@/graphql/messaging';
import { ConversationWatchers } from '@/components/consultation/ConversationWatchers';
import { realtime } from '@/lib/apollo';
import { useRealtimeConnected } from '@/lib/realtime';
import { getToken } from '@/lib/auth';

type Message = { id: string; senderId: string; senderRole: string; content: string; sentAt: string };

// While live updates aren't arriving, poll so the thread still moves.
const FALLBACK_POLL_MS = 10_000;

function currentUserId(): string | null {
  const token = getToken();
  if (!token) return null;
  try { return JSON.parse(atob(token.split('.')[1]))?.sub ?? null; } catch { return null; }
}

/**
 * A messenger-style chat docked to the bottom-right of the screen, opened from the patients list
 * so a doctor can answer patients one after another without leaving the list.
 * Mount it with key={patientId}: opening another patient replaces this window with theirs.
 */
export default function PatientChatWindow({
  patientId, patientName, onClose, onOpenProfile, onActivity,
}: {
  patientId: string;
  patientName: string;
  onClose: () => void;
  onOpenProfile: () => void;
  /** Called whenever a message is sent or arrives, so the list can refresh who is still waiting for a reply. */
  onActivity: () => void;
}) {
  const client = useApolloClient();
  const { t, fmt } = useI18n();
  const dayLabel = (d: Date) => (isToday(d) ? t('Today') : isYesterday(d) ? t('Yesterday') : fmt(d, 'd MMM yyyy'));
  const me = useMemo(currentUserId, []);
  const [minimised, setMinimised] = useState(false);
  const [content, setContent] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // One conversation per patient: their messages are stored on each consultation, so merge them.
  const { data, loading, refetch, startPolling, stopPolling } = useQuery(PATIENT_CONVERSATION, {
    variables: { id: patientId },
    fetchPolicy: 'cache-and-network',
  });
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

  useEffect(() => {
    if (connected) return;
    startPolling(FALLBACK_POLL_MS);
    return stopPolling;
  }, [connected, startPolling, stopPolling]);
  useEffect(() => realtime?.onReconnect(() => { refetch(); }), [refetch]);

  const [sendMessage, { loading: sending }] = useMutation(SEND_MESSAGE, {
    onCompleted({ sendMessage: message }) {
      if (replyTo) addToCache(replyTo, message);
      setContent('');
      if (inputRef.current) inputRef.current.style.height = 'auto';
      onActivity();
    },
  });

  useEffect(() => {
    if (minimised) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [minimised, messages.length]);
  useEffect(() => { if (!minimised) inputRef.current?.focus(); }, [minimised, patientId]);

  const submit = () => {
    const text = content.trim();
    if (!text || sending || !replyTo) return;
    sendMessage({ variables: { input: { consultationId: replyTo, content: text } } });
  };

  // Group the thread by day, and collapse the sender label for consecutive messages.
  const rows: Array<{ kind: 'day'; key: string; label: string } | { kind: 'msg'; m: Message; showSender: boolean; isMe: boolean }> = [];
  messages.forEach((m, i) => {
    const d = new Date(m.sentAt);
    const prev = messages[i - 1];
    const newDay = !prev || dayLabel(new Date(prev.sentAt)) !== dayLabel(d);
    if (newDay) rows.push({ kind: 'day', key: `day-${m.id}`, label: dayLabel(d) });
    rows.push({ kind: 'msg', m, isMe: m.senderId === me, showSender: newDay || prev.senderId !== m.senderId });
  });

  const initials = patientName.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
  const iconBtn = 'w-8 h-8 rounded-full flex items-center justify-center text-white/85 hover:bg-white/20 hover:text-white transition-colors';

  return (
    <aside
      aria-label={t('Chat with {name}', { name: patientName })}
      className={`fixed bottom-5 right-6 z-30 w-[384px] max-w-[calc(100vw-2rem)] flex flex-col overflow-hidden rounded-3xl border border-sky-200/80 bg-[#f4f9ff] shadow-[0_24px_60px_-12px_rgba(14,80,160,0.5)] animate-slide-in-right ${
        minimised ? '' : 'h-[min(560px,calc(100vh-6rem))]'
      }`}
    >
      <ConversationWatchers
        consultationIds={consultations.map((c) => c.id)}
        onMessage={(consultationId, message) => {
          addToCache(consultationId, message);
          onActivity();
        }}
      />

      <div
        className="h-16 shrink-0 px-4 flex items-center gap-3 bg-gradient-to-r from-sky-400 to-blue-500 cursor-pointer"
        onClick={() => setMinimised((v) => !v)}
      >
        <div className="w-10 h-10 rounded-full bg-white/25 ring-2 ring-white/60 text-white text-sm font-semibold flex items-center justify-center shrink-0">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-white truncate">{patientName}</p>
          <p className="text-xs text-sky-50/90">{t('Patient')}</p>
        </div>
        <button type="button" title={t('Open full profile')} aria-label={t('Open full profile')} className={iconBtn} onClick={(e) => { e.stopPropagation(); onOpenProfile(); }}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H18m0 0v4.5M18 6l-7.5 7.5M10 6H6.75A1.75 1.75 0 005 7.75v9.5C5 18.22 5.78 19 6.75 19h9.5c.97 0 1.75-.78 1.75-1.75V14" /></svg>
        </button>
        <button type="button" title={minimised ? t('Expand') : t('Minimise')} aria-label={minimised ? t('Expand chat') : t('Minimise chat')} className={iconBtn} onClick={(e) => { e.stopPropagation(); setMinimised((v) => !v); }}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d={minimised ? 'M5 15l7-7 7 7' : 'M5 9l7 7 7-7'} /></svg>
        </button>
        <button type="button" title={t('Close')} aria-label={t('Close chat')} className={iconBtn} onClick={(e) => { e.stopPropagation(); onClose(); }}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>

      {!minimised && (
        <>
          <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-1 bg-[#eaf3ff]">
            {loading && messages.length === 0 && <p className="text-xs text-slate-400 text-center">{t('Loading…')}</p>}
            {!loading && messages.length === 0 && (
              <p className="h-full flex items-center justify-center text-sm text-slate-400 text-center px-6">
                {t('No messages yet. Messages you send go straight to the patient’s portal.')}
              </p>
            )}
            {rows.map((row) =>
              row.kind === 'day' ? (
                <div key={row.key} className="flex items-center gap-3 py-2">
                  <span className="flex-1 h-px bg-sky-200/80" />
                  <span className="text-[11px] font-medium text-slate-400">{row.label}</span>
                  <span className="flex-1 h-px bg-sky-200/80" />
                </div>
              ) : (
                <div key={row.m.id} className={`flex flex-col ${row.isMe ? 'items-end' : 'items-start'} ${row.showSender ? 'pt-2' : ''}`}>
                  {row.showSender && (
                    <span className="text-[11px] font-medium text-slate-500 mb-1 px-1.5">
                      {row.isMe ? t('You') : row.m.senderRole === 'PATIENT' ? patientName.split(' ')[0] : t('Care team')}
                    </span>
                  )}
                  <div
                    className={`max-w-[82%] rounded-[20px] px-3.5 py-2 text-[15px] leading-snug whitespace-pre-wrap break-words ${
                      row.isMe
                        ? 'bg-gradient-to-br from-sky-400 to-blue-500 text-white rounded-br-md shadow-sm shadow-sky-500/30'
                        : 'bg-[#ffffff] text-slate-700 rounded-bl-md border border-sky-100 shadow-sm'
                    }`}
                  >
                    {row.m.content}
                    <span className={`block text-[10px] mt-0.5 text-right ${row.isMe ? 'text-sky-100' : 'text-slate-400'}`}>
                      {fmt(row.m.sentAt, 'HH:mm')}
                    </span>
                  </div>
                </div>
              ),
            )}
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); submit(); }}
            className="shrink-0 border-t border-sky-100 bg-[#f4f9ff] p-3 flex items-end gap-2"
          >
            <textarea
              ref={inputRef}
              rows={1}
              value={content}
              disabled={!replyTo && !loading}
              placeholder={!replyTo && !loading ? t('No consultation to message against') : t('Write a message…')}
              onChange={(e) => setContent(e.target.value)}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = 'auto';
                el.style.height = `${Math.min(el.scrollHeight, 100)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
              }}
              className="flex-1 resize-none rounded-2xl border border-sky-200 bg-[#ffffff] px-3.5 py-2.5 text-[15px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-sky-400 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            <button
              type="submit"
              disabled={sending || !content.trim() || !replyTo}
              aria-label={t('Send message')}
              className="w-10 h-10 shrink-0 rounded-full bg-sky-500 text-white flex items-center justify-center shadow-md shadow-sky-500/30 hover:bg-sky-400 transition-colors disabled:bg-sky-200 disabled:text-white disabled:shadow-none"
            >
              <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
            </button>
          </form>
        </>
      )}
    </aside>
  );
}
