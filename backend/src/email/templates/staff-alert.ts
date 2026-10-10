import { button, emailLayout, escapeHtml, heading, paragraph } from '../email-layout';
import type { EmailContent } from './types';

/**
 * "Something urgent is waiting in the portal." Names no patient and no clinical detail: email isn't a secure channel,
 * so the clinician signs in to see who and what.
 */
export function staffAlertEmail(a: { firstName: string; headline: string; portalUrl: string }): EmailContent {
  return {
    subject: a.headline,
    html: emailLayout({
      preheader: 'Something urgent is waiting in the clinician portal.',
      body: [
        heading(a.headline),
        paragraph(`Hi ${escapeHtml(a.firstName)}, something that can’t wait has come in. Sign in to the clinician portal to see it.`),
        button('Open the portal', a.portalUrl),
      ].join(''),
    }),
  };
}
