import { button, detailRows, emailLayout, escapeHtml, heading, paragraph, smallPrint } from '../email-layout';
import type { EmailContent } from './types';

/** A few days before a scheduled dose. */
export function doseReminderEmail(a: { firstName: string; productName: string; scheduledFor: Date; portalUrl: string }): EmailContent {
  const when = a.scheduledFor.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  return {
    subject: `Reminder: ${a.productName} dose due ${when}`,
    html: emailLayout({
      preheader: `Your next dose is due on ${when}.`,
      body: [
        heading('Upcoming dose reminder'),
        paragraph(`Hi ${escapeHtml(a.firstName)}, your next dose is coming up.`),
        detailRows([['Medicine', a.productName], ['Due', when]]),
        button('View my dose calendar', a.portalUrl),
        smallPrint('Once it’s done, you can mark it as taken or skipped in your portal.'),
      ].join(''),
    }),
  };
}
