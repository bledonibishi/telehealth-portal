'use client';

import { useState } from 'react';
import { useMutation } from '@apollo/client';
import { FINISH_TICKET_ENGINEERING, SEND_TICKET_TO_ENGINEERING } from '@/graphql/tickets';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { Alert, InlineError } from '@/components/ui/Alert';
import { Modal } from '@/components/consultation/Modal';
import { withEngineering, type Ticket } from './ticket-meta';

/**
 * Passing a ticket to the engineers. Support writes what is wrong (the engineers are told in Slack, with that text, the ticket
 * number and a link); the ticket then shows it is with them, and support marks it done when they have dealt with it.
 */
export default function EngineeringHandoff({ ticket }: { ticket: Ticket }) {
  const { t, timeAgo } = useI18n();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [slackIssue, setSlackIssue] = useState<'NOT_CONFIGURED' | 'FAILED' | null>(null);

  const [send, { loading: sending }] = useMutation(SEND_TICKET_TO_ENGINEERING, {
    onError: setError,
    onCompleted: (d) => {
      setError(null); setOpen(false); setNote('');
      const r = d.sendTicketToEngineering.slack;
      setSlackIssue(r === 'NOT_CONFIGURED' || r === 'FAILED' ? r : null);
    },
  });
  const [finish, { loading: finishing }] = useMutation(FINISH_TICKET_ENGINEERING, { onError: setError });
  const withThem = withEngineering(ticket);

  return (
    <div className="space-y-3">
      {slackIssue && (
        <Alert tone="warning" title={slackIssue === 'NOT_CONFIGURED' ? t('The ticket is marked, but the engineers weren’t told in Slack') : t('The ticket is marked, but Slack didn’t answer')}>
          {slackIssue === 'NOT_CONFIGURED' ? t('No Slack address is set up yet. Please tell the engineers yourself, and ask whoever looks after the system to add one.') : t('Please tell the engineers yourself.')}
        </Alert>
      )}
      <InlineError error={error} />

      {withThem ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-medium text-amber-900">{t('With the engineers')} <span className="font-normal text-amber-800">· {t('since')} {timeAgo(ticket.engineeringSentAt!)}{ticket.engineeringSentByName ? ` · ${ticket.engineeringSentByName}` : ''}</span></p>
          {ticket.engineeringNote && <p className="text-sm text-amber-900 mt-1 whitespace-pre-wrap">{ticket.engineeringNote}</p>}
          <button type="button" disabled={finishing} onClick={() => finish({ variables: { ticketId: ticket.id } })} className="mt-2 text-xs font-medium border border-amber-300 text-amber-900 bg-white rounded-lg px-3 py-1.5 hover:bg-amber-100 disabled:opacity-50">{finishing ? t('Working…') : t('The engineers are done')}</button>
        </div>
      ) : (
        <button type="button" onClick={() => { setOpen(true); setSlackIssue(null); }} className="text-sm font-medium border border-gray-300 text-gray-700 bg-white rounded-lg px-3.5 py-1.5 hover:bg-gray-50">
          {ticket.engineeringDoneAt ? t('Send to engineering again') : t('Send to engineering')}
        </button>
      )}

      {ticket.engineeringDoneAt && !withThem && <p className="text-xs text-green-700">{t('The engineers finished with this {when}.', { when: timeAgo(ticket.engineeringDoneAt) })}</p>}

      {open && (
        <Modal title={t('Send to engineering')} subtitle={t('The engineers are told in Slack.')} onClose={() => setOpen(false)} wide>
          <form className="p-5 space-y-3" onSubmit={(e) => { e.preventDefault(); send({ variables: { ticketId: ticket.id, note: note.trim() } }); }}>
            <InlineError error={error} />
            <label className="block">
              <span className="block text-xs font-medium text-gray-700 mb-1">{t('What is wrong, for the engineers?')}</span>
              <textarea required autoFocus rows={6} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1500} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder={t('What the patient was doing, what should have happened, and what happened instead. Which phone or browser, and when, if you know.')} />
              <span className="block text-xs text-gray-400 mt-1">{t('{n} of 1500 characters', { n: note.length })}</span>
            </label>
            <p className="text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2">{t('Slack gets what you write here, the ticket number and a link. Don’t put the patient’s name or health details in it: the engineers can open the ticket if they need more.')}</p>
            <div className="flex items-center gap-3 pt-1">
              <button type="submit" disabled={sending || note.trim().length < 10} className="bg-brand-500 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">{sending ? t('Sending…') : t('Send to engineering')}</button>
              <button type="button" onClick={() => setOpen(false)} className="text-sm text-gray-500 hover:text-gray-800">{t('Cancel')}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
