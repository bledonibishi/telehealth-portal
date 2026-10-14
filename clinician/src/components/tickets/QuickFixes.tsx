'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { GET_TICKET, PERFORM_SUPPORT_ACTION, SUPPORT_ACTION_CONTEXT } from '@/graphql/tickets';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { Alert, InlineError } from '@/components/ui/Alert';
import type { TicketType } from './ticket-meta';

type Action = 'RESEND_ACTIVATION_LINK' | 'SEND_PASSWORD_RESET' | 'RETRY_FAILED_PAYMENT';

type Guide = {
  title: string;
  /** When this is the right fix. */
  when: string;
  /** Exactly what happens, in order. {email} is the patient's address. */
  steps: string[];
  /** What it does not do, or what to know before pressing it. */
  note: string;
  button: string;
  /** The ticket types it usually belongs to, so the likely one is marked. */
  suggestedFor: TicketType[];
  /** Why it is worth one more look: money moves. */
  careful?: boolean;
  reasons: string[];
};

// English text, shown through t().
const GUIDES: Record<Action, Guide> = {
  RESEND_ACTIVATION_LINK: {
    title: 'Resend the activation link',
    when: 'The patient paid but never set a password: the first email didn’t arrive, or they lost it.',
    steps: [
      'An email with a link to choose a password is sent to {email}.',
      'If the link they were already sent is still valid, the same link is sent again, so the old one keeps working.',
      'The link opens a page where they choose a password and their account opens.',
    ],
    note: 'Ask them to check the spam folder and the address first. Nothing else on their account changes.',
    button: 'Send the activation link',
    suggestedFor: ['ACCOUNT'],
    reasons: ['Patient called: never got the email', 'Patient wrote in messages: lost the email', 'Email went to the wrong address, now corrected'],
  },
  SEND_PASSWORD_RESET: {
    title: 'Send a password reset link',
    when: 'The patient set up their account but can’t sign in: they forgot the password, or the reset email they asked for never came.',
    steps: [
      'An email with a link to choose a new password is sent to {email}. The link works for 60 minutes.',
      'Their current password keeps working until they use the link.',
      'Once they set the new one, they are signed out on every other device.',
    ],
    note: 'Older reset links stop working once the new one is sent. Never read out or ask for a password.',
    button: 'Send the reset link',
    suggestedFor: ['ACCOUNT', 'TECHNICAL'],
    reasons: ['Patient called: can’t sign in', 'Patient wrote in messages: forgot the password', 'Reset link they asked for expired'],
  },
  RETRY_FAILED_PAYMENT: {
    title: 'Retry the failed payment',
    when: 'A payment failed and the patient says the card is fine now, or they have just updated it.',
    steps: [
      'We ask our payment provider to collect the newest unpaid invoice again, from the card already saved.',
      'If it goes through, the invoice is paid and the patient is charged.',
      'If the card is declined again, nothing changes. The patient then updates their card under Settings → Manage subscription.',
    ],
    note: 'This takes money from the patient’s card. Only do it when they have told you to, and write that in the reason.',
    button: 'Charge the card again',
    suggestedFor: ['BILLING'],
    careful: true,
    reasons: ['Patient confirmed by message that I may retry', 'Patient called: updated their card, asked to retry', 'Bank confirmed the earlier decline was a mistake'],
  },
};

/**
 * What support can do by hand for the patient on a ticket when an automatic step did not work. Each fix says when it fits,
 * exactly what it will do, and what it will not; it needs a reason, is recorded in the audit log, and leaves a note on the
 * ticket. Fixes that make no sense for this patient right now are shown greyed out, with the reason.
 */
export default function QuickFixes({ ticketId, patientId, ticketType }: { ticketId: string; patientId: string; ticketType: TicketType }) {
  const { t, fmt, timeAgo } = useI18n();
  const [picked, setPicked] = useState<Action | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const { data, loading } = useQuery(SUPPORT_ACTION_CONTEXT, { variables: { patientId }, fetchPolicy: 'cache-and-network' });
  const ctx = data?.supportActionContext;
  const stateOf = (a: Action) => ctx?.actions.find((x: { action: string }) => x.action === a);

  const [perform, { loading: working }] = useMutation(PERFORM_SUPPORT_ACTION, {
    refetchQueries: [{ query: SUPPORT_ACTION_CONTEXT, variables: { patientId } }, { query: GET_TICKET, variables: { id: ticketId } }],
    awaitRefetchQueries: true,
    onError: (e) => { setError(e); setResult(null); },
    onCompleted: (d) => { setError(null); setResult(d.performSupportAction); setPicked(null); setReason(''); },
  });

  const guide = picked ? GUIDES[picked] : null;
  const fill = (text: string) => text.replace('{email}', ctx?.email ?? t('their email'));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('Quick fixes')}</h2>
        <p className="text-sm text-gray-500 mt-1">{t('Do by hand what an automatic step should have done. Each one is recorded with your reason, and leaves a note on this ticket.')}</p>
      </div>

      {ctx && (
        <div className="rounded-lg bg-gray-50 px-3.5 py-3 text-sm space-y-1">
          <p className="text-gray-900 font-medium">{ctx.patientName}</p>
          <p className="text-gray-500 break-all">{ctx.email}</p>
          <p className="text-xs text-gray-500 pt-1">
            {ctx.activated ? t('Account set up') : t('Account not set up yet: no password chosen')} · {ctx.hasPaymentProfile ? t('Has a payment profile') : t('No payment profile')}
          </p>
        </div>
      )}

      {result && <Alert tone={result.ok ? 'success' : 'warning'}>{result.message}</Alert>}
      <InlineError error={error} />

      {!guide ? (
        <ul className="space-y-3">
          {(Object.keys(GUIDES) as Action[]).map((key) => {
            const g = GUIDES[key];
            const st = stateOf(key);
            const available = !loading && st ? st.available : false;
            const suggested = available && g.suggestedFor.includes(ticketType);
            return (
              <li key={key} className={`rounded-lg border p-4 ${available ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50/60'}`}>
                <div className="flex items-start justify-between gap-3">
                  <h3 className={`text-sm font-semibold ${available ? 'text-gray-900' : 'text-gray-400'}`}>{t(g.title)}</h3>
                  {suggested && <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-brand-50 text-brand-900 whitespace-nowrap">{t('Likely fit')}</span>}
                  {g.careful && <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 whitespace-nowrap">{t('Moves money')}</span>}
                </div>
                <p className={`text-sm mt-1 ${available ? 'text-gray-600' : 'text-gray-400'}`}>{t(g.when)}</p>
                {st && !st.available && st.unavailableReason && <p className="text-xs text-amber-700 mt-2">{t(st.unavailableReason)}</p>}
                <button
                  type="button"
                  disabled={!available}
                  onClick={() => { setPicked(key); setResult(null); setError(null); }}
                  className="mt-3 text-sm font-medium border border-gray-300 text-gray-800 bg-white rounded-lg px-3.5 py-1.5 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {t('Review and do it')}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <form
          className="rounded-lg border border-gray-300 bg-white p-4 space-y-4"
          onSubmit={(e) => { e.preventDefault(); perform({ variables: { input: { patientId, ticketId, action: picked, reason: reason.trim() } } }); }}
        >
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{t(guide.title)}</h3>
            <p className="text-sm text-gray-600 mt-1">{t(guide.when)}</p>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('What will happen')}</p>
            <ol className="space-y-2">
              {guide.steps.map((step, i) => (
                <li key={i} className="flex gap-2.5 text-sm text-gray-800">
                  <span className="mt-0.5 w-5 h-5 shrink-0 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600 flex items-center justify-center">{i + 1}</span>
                  <span>{fill(t(step))}</span>
                </li>
              ))}
            </ol>
          </div>

          <p className={`text-xs rounded-lg px-3 py-2 ${guide.careful ? 'bg-amber-50 text-amber-800' : 'bg-gray-50 text-gray-600'}`}>{t(guide.note)}</p>

          <div>
            <label htmlFor="qf-reason" className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{t('Why are you doing this?')}</label>
            <input id="qf-reason" autoFocus required minLength={5} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('Kept in the audit log, with your name')} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {guide.reasons.map((r) => (
                <button key={r} type="button" onClick={() => setReason(t(r))} className="text-xs text-gray-600 border border-gray-200 rounded-full px-2.5 py-1 hover:bg-gray-50">{t(r)}</button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button type="submit" disabled={working || reason.trim().length < 5} className="bg-brand-500 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">{working ? t('Working…') : t(guide.button)}</button>
            <button type="button" onClick={() => setPicked(null)} className="text-sm text-gray-500 hover:text-gray-800">{t('Cancel')}</button>
          </div>
        </form>
      )}

      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('Already done for this patient')}</h3>
        {!ctx || ctx.history.length === 0 ? (
          <p className="text-sm text-gray-400">{t('Nothing yet.')}</p>
        ) : (
          <ul className="space-y-2">
            {ctx.history.map((h: { id: string; action: Action; at: string; byName: string; ok: boolean; outcome: string; reason: string }) => (
              <li key={h.id} className="text-sm">
                <p className="text-gray-900"><span className={h.ok ? 'text-green-600' : 'text-amber-600'} aria-hidden>●</span> {t(GUIDES[h.action]?.title ?? h.action)}</p>
                <p className="text-xs text-gray-500 ml-4">{h.byName} · {timeAgo(h.at)} ({fmt(h.at, 'd MMM, HH:mm')})</p>
                {h.outcome && <p className="text-xs text-gray-500 ml-4">{h.outcome}</p>}
                {h.reason && <p className="text-xs text-gray-400 ml-4">“{h.reason}”</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
