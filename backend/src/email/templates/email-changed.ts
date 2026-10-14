import { emailLayout, escapeHtml, heading, paragraph } from '../email-layout';
import type { EmailContent } from './types';

/** Sent to the OLD address after the sign-in email is changed, so the owner notices if it was not them. */
export function emailChangedEmail(a: { firstName: string; newEmail: string }): EmailContent {
  return {
    subject: 'Your sign-in email was changed',
    html: emailLayout({
      preheader: 'The email you sign in with was just changed.',
      body: [
        heading(`Your email was changed, ${a.firstName}`),
        paragraph(`The email you sign in with is now ${escapeHtml(a.newEmail)}. Every other device was signed out.`),
        paragraph('If this was you, there is nothing to do. If it was not, contact support straight away.'),
      ].join(''),
    }),
  };
}
