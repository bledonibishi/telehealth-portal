'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { REPLY_TO_TICKET, SAVED_REPLIES, TICKET_CONVERSATION } from '@/graphql/tickets';
import { RATE_ASSISTANT_ANSWER } from '@/graphql/assistant';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { getCurrentRole } from '@/lib/role';
import { InlineError } from '@/components/ui/Alert';
import { Select } from '@/components/ui/Select';
import { MessageFiles, type MessageFile } from '@/components/consultation/MessageFiles';
import type { TicketType } from './ticket-meta';

type Message = { id: string; senderId: string; senderRole: string; isAi: boolean; aiFeedback?: string | null; aiArticleId?: string | null; content: string; sentAt: string; attachments: MessageFile[] };

/**
 * The patient's conversation with us, inside the ticket, with a box to answer. Replying sends a real message to the patient and
 * moves the ticket along: it counts as the first reply and waits on the patient. Support cannot answer a medical question: that
 * ticket is for a doctor.
 */
export default function TicketConversation({ ticketId, ticketType, patientName }: { ticketId: string; ticketType: TicketType; patientName?: string | null }) {
  const { t, fmt, timeAgo } = useI18n();
  const role = getCurrentRole();
  const blocked = ticketType === 'CLINICAL' && role === 'CX_TEAM';
  const { data, loading } = useQuery(TICKET_CONVERSATION, { variables: { ticketId }, pollInterval: 10_000, fetchPolicy: 'cache-and-network' });
  const messages: Message[] = data?.ticketConversation ?? [];
  const { data: repliesData } = useQuery(SAVED_REPLIES, { fetchPolicy: 'cache-first', skip: blocked });
  const saved: { id: string; title: string; body: string }[] = repliesData?.savedReplies ?? [];
  const [text, setText] = useState('');
  // A saved reply goes into the box (it is not sent), with the patient's first name where {name} is; the person can still change it.
  const insert = (id: string) => {
    const r = saved.find((x) => x.id === id);
    if (!r) return;
    const first = (patientName ?? '').trim().split(/\s+/)[0] || t('there');
    const filled = r.body.replace(/\{name\}/g, first);
    setText((cur) => (cur.trim() ? `${cur.trimEnd()}\n\n${filled}` : filled));
  };
  const [error, setError] = useState<unknown>(null);
  const end = useRef<HTMLDivElement>(null);

  const [reply, { loading: sending }] = useMutation(REPLY_TO_TICKET, {
    refetchQueries: [{ query: TICKET_CONVERSATION, variables: { ticketId } }],
    onError: setError,
    onCompleted: () => { setError(null); setText(''); },
  });

  const [rate] = useMutation(RATE_ASSISTANT_ANSWER, { refetchQueries: [{ query: TICKET_CONVERSATION, variables: { ticketId } }], onError: setError });
  const canRate = role === 'CX_TEAM' || role === 'ADMIN';
  const rateAnswer = (m: Message, rating: 'GOOD' | 'BAD') => {
    // A bad answer is worth a few words: what was wrong with it is what gets fixed.
    const note = rating === 'BAD' ? window.prompt(t('What was wrong with it? (optional)')) : null;
    if (rating === 'BAD' && note === null) return;
    rate({ variables: { messageId: m.id, rating, note: note || undefined } });
  };

  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [messages.length]);

  const submit = () => { if (text.trim() && !sending && !blocked) reply({ variables: { ticketId, content: text.trim() } }); };

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('Conversation with the patient')}</h2>
        <span className="text-xs text-gray-400">{t('What you write here is sent to the patient.')}</span>
      </div>

      <div className="max-h-[420px] overflow-y-auto rounded-lg bg-gray-50 p-3 space-y-2" aria-live="polite">
        {loading && messages.length === 0 && <p className="text-sm text-gray-400 py-6 text-center">{t('Loading…')}</p>}
        {!loading && messages.length === 0 && <p className="text-sm text-gray-400 py-6 text-center">{t('No messages yet.')}</p>}
        {messages.map((m) => {
          const patient = m.senderRole === 'PATIENT';
          return (
            <div key={m.id} className={`flex flex-col ${patient ? 'items-start' : 'items-end'}`}>
              <div className={`max-w-[85%] rounded-lg px-3.5 py-2 text-sm whitespace-pre-wrap break-words ${patient ? 'bg-white border border-gray-200 text-gray-900' : m.isAi ? 'bg-violet-50 border border-violet-100 text-gray-900' : 'bg-brand-500 text-white'}`}>
                {m.isAi && <p className="text-[11px] font-semibold text-violet-700 mb-0.5">{t('Automated assistant')}</p>}
                {m.content}
                <MessageFiles files={m.attachments} />
              </div>
              {m.isAi && m.aiArticleId && canRate && (
                <div className="flex items-center gap-1 mt-0.5 px-1 text-[11px] text-gray-400">
                  <span>{t('Was this answer right?')}</span>
                  <button type="button" onClick={() => rateAnswer(m, 'GOOD')} aria-pressed={m.aiFeedback === 'GOOD'} aria-label={t('Good answer')} className={`w-6 h-6 rounded-md hover:bg-gray-100 ${m.aiFeedback === 'GOOD' ? 'bg-green-100' : ''}`}>👍</button>
                  <button type="button" onClick={() => rateAnswer(m, 'BAD')} aria-pressed={m.aiFeedback === 'BAD'} aria-label={t('Bad answer')} className={`w-6 h-6 rounded-md hover:bg-gray-100 ${m.aiFeedback === 'BAD' ? 'bg-red-100' : ''}`}>👎</button>
                </div>
              )}
              <p className="text-[11px] text-gray-400 mt-0.5 px-1" title={fmt(m.sentAt, 'd MMM yyyy, HH:mm')}>{patient ? t('Patient') : m.isAi ? t('Automated assistant') : t('Team')} · {timeAgo(m.sentAt)}</p>
            </div>
          );
        })}
        <div ref={end} />
      </div>

      {blocked ? (
        <p className="mt-3 text-sm text-purple-700 bg-purple-50 rounded-lg px-3 py-2">{t('This is a medical question, so a doctor answers it. Please don’t reply yourself.')}</p>
      ) : (
        <form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          {saved.length > 0 && (
            <div className="w-64">
              <Select size="sm" value="" onChange={insert} ariaLabel={t('Insert a saved reply')} placeholder={t('Insert a saved reply…')} options={saved.map((r) => ({ value: r.id, label: r.title }))} />
            </div>
          )}
          <textarea
            rows={3}
            value={text}
            maxLength={2000}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); } }}
            placeholder={t('Write to the patient…')}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
          <InlineError error={error} />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-gray-400">{t('Ctrl or ⌘ + Enter to send')}</p>
            <button type="submit" disabled={sending || !text.trim()} className="bg-brand-500 text-white rounded-lg px-4 py-1.5 text-sm font-medium disabled:opacity-50">{sending ? t('Sending…') : t('Send to patient')}</button>
          </div>
        </form>
      )}
    </div>
  );
}
