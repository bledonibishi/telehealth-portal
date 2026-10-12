import { emailLayout } from '../email-layout';
import type { EmailContent } from './types';

/** A notice to the pharmacy partner. `html` is the summary built with the order (no patient details in the ping), placed in the shared layout. */
export function partnerOrderEmail(a: { subject: string; html: string }): EmailContent {
  return { subject: a.subject, html: emailLayout({ audience: 'partner', preheader: a.subject, body: a.html }) };
}
