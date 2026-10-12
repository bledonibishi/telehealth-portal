import { button, emailLayout, escapeHtml, heading, paragraph, smallPrint } from '../email-layout';
import type { EmailContent } from './types';

/**
 * A nudge to someone who answered the questions on the website but hasn't paid. It says nothing about the
 * treatment or their answers (email isn't a secure channel), and it always carries a way to stop the reminders.
 */
export function leadReminderEmail(a: { firstName: string; continueUrl: string; unsubscribeUrl: string; last: boolean }): EmailContent {
  return {
    subject: a.last ? 'Last reminder: finish your order' : 'You’re one step away from finishing your order',
    html: emailLayout({
      preheader: 'It only takes a few minutes.',
      body: [
        heading(`Finish your order, ${a.firstName}`),
        paragraph(
          a.last
            ? 'You started an online assessment with us a few days ago. This is the last reminder we’ll send. If you’d like to carry on, it only takes a few minutes.'
            : 'You started an online assessment with us. If you’d like to carry on, it only takes a few minutes.',
        ),
        button('Continue', a.continueUrl),
        smallPrint('A doctor reviews every request before anything is prescribed, and you only pay once you’ve chosen to.'),
        smallPrint(`Don’t want these reminders? <a href="${escapeHtml(a.unsubscribeUrl)}" style="color:#64748B">Stop them</a>.`),
      ].join(''),
    }),
  };
}
