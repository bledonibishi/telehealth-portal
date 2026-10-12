'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { DRAFT_MESSAGE_REPLY, TRANSLATE_MESSAGE, URGENT_MESSAGES } from '@/graphql/ai';
import { useAiFeature } from '@/lib/ai';
import { LOCALES } from '@/lib/i18n/locales';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { InlineError } from '@/components/ui/Alert';
import { AiMark } from './AiMark';

/**
 * "Draft a reply": the AI writes a reply to the patient's latest message and puts it in the box for a team member to edit.
 * Nothing is sent. When the patient asked something a clinician should answer, the draft says so and this warns.
 */
export function DraftReplyButton({ patientId, consultationId, onDraft, className = '' }: { patientId: string; consultationId?: string | null; onDraft: (text: string) => void; className?: string }) {
  const { t } = useI18n();
  const enabled = useAiFeature('reply');
  const [note, setNote] = useState<{ needsClinician: boolean; reason: string } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [draft, { loading }] = useMutation(DRAFT_MESSAGE_REPLY, {
    onError: setError,
    onCompleted: ({ draftMessageReply: d }) => {
      setNote({ needsClinician: d.needsClinician, reason: d.reason });
      onDraft(d.draft);
    },
  });
  if (!enabled) return null;

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => { setError(null); setNote(null); draft({ variables: { input: { patientId, consultationId: consultationId ?? undefined } } }); }}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 disabled:opacity-50"
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2z" /></svg>
          {loading ? t('Drafting…') : t('Draft a reply')}
        </button>
        {note && <AiMark />}
      </div>
      {note && <p className="text-[11px] text-gray-500 mt-1">{t('A draft: read it and edit it before you send.')}</p>}
      {note?.needsClinician && <p className="text-[11px] text-amber-800 mt-1">⚠ {t('This needs a clinician’s answer.')} {note.reason}</p>}
      <InlineError error={error} size="xs" className="mt-1" />
    </div>
  );
}

/** "Translate": shows the message in the reader's language under it. Nothing on the thread changes. */
export function TranslateMessage({ messageId, tone = 'light' }: { messageId: string; tone?: 'light' | 'dark' }) {
  const { t, locale } = useI18n();
  const enabled = useAiFeature('translate');
  const [shown, setShown] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<{ text: string; sourceLanguage: string } | null>(null);
  const [translate, { loading }] = useMutation(TRANSLATE_MESSAGE, { onError: setError, onCompleted: (d) => { setResult(d.translateMessage); setShown(true); } });
  if (!enabled) return null;
  const language = LOCALES.find((l) => l.code === locale)?.name ?? locale;
  const link = tone === 'dark' ? 'text-sky-100 hover:text-white' : 'text-violet-600 hover:text-violet-800';

  return (
    <div className="mt-1">
      {!shown ? (
        <button type="button" disabled={loading} onClick={() => { setError(null); result ? setShown(true) : translate({ variables: { messageId, target: locale } }); }} className={`text-[11px] underline underline-offset-2 ${link} disabled:opacity-50`}>
          {loading ? t('Translating…') : t('Translate to {language}', { language })}
        </button>
      ) : (
        <div className={`text-[13px] rounded-md px-2 py-1.5 ${tone === 'dark' ? 'bg-white/15' : 'bg-violet-50 text-slate-700'}`}>
          {result?.sourceLanguage === locale ? <span className="text-[11px] opacity-70">{t('Already in {language}', { language })}</span> : <p className="whitespace-pre-wrap">{result?.text}</p>}
          <div className="flex items-center gap-2 mt-1"><AiMark /><button type="button" onClick={() => setShown(false)} className={`text-[11px] underline ${link}`}>{t('Hide')}</button></div>
        </div>
      )}
      <InlineError error={error} size="xs" />
    </div>
  );
}

/** The messages from this patient that were marked as possibly urgent, by message id, so a tag can sit on them. */
export function useUrgentMessages(patientId: string): Map<string, string> {
  const enabled = useAiFeature('urgency');
  const { data } = useQuery(URGENT_MESSAGES, { variables: { patientId }, skip: !enabled, pollInterval: 15_000, fetchPolicy: 'cache-and-network' });
  return new Map<string, string>(((data?.urgentMessages ?? []) as Array<{ messageId: string; reason?: string | null }>).map((m) => [m.messageId, m.reason ?? '']));
}

/** The tag for a message marked possibly urgent. The AI check only adds this; it never hides or lowers anything. */
export function UrgentTag({ reason }: { reason: string }) {
  const { t } = useI18n();
  return (
    <span title={t('Marked by an AI check. A person should read it first.')} className="inline-flex items-center gap-1 rounded-full bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 text-[11px] font-semibold">
      ⚠ {t('Possibly urgent')}{reason ? ` · ${reason}` : ''}
    </span>
  );
}
