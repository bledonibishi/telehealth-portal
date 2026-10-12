import { button, emailLayout, escapeHtml, heading, paragraph } from '../email-layout';
import type { EmailContent } from './types';

/**
 * "There's an update, log in to see it." Deliberately generic: email isn't a secure channel, so the clinical detail
 * (decision, reasons, messages) stays behind the portal login.
 */
export function consultationUpdateEmail(a: { firstName: string; headline: string; portalUrl: string }): EmailContent {
  return {
    subject: a.headline,
    html: emailLayout({
      preheader: 'There’s an update from our clinical team.',
      body: [
        heading(a.headline),
        paragraph(`Hi ${escapeHtml(a.firstName)}, there’s an update from our clinical team. Log in to your patient portal to see it.`),
        button('Open my portal', a.portalUrl),
      ].join(''),
    }),
  };
}
