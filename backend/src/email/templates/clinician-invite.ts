import { button, emailLayout, heading, paragraph, smallPrint } from '../email-layout';
import type { EmailContent } from './types';

/** Tells a clinician they were added to the team (or sends a fresh link to one who lost their password). Nothing about any patient. */
export function clinicianInviteEmail(a: { firstName: string; inviteUrl: string; firstTime: boolean }): EmailContent {
  return {
    subject: a.firstTime ? 'You have been added to the clinic portal' : 'Choose a new password for the clinic portal',
    html: emailLayout({
      audience: 'staff',
      preheader: a.firstTime ? 'Choose a password to get started in the clinic portal.' : 'Choose a new password for the clinic portal.',
      body: [
        heading(a.firstTime ? `Welcome to the team, ${a.firstName}` : `Set a new password, ${a.firstName}`),
        paragraph(a.firstTime ? 'An administrator has added you to the clinic portal. Choose a password to get started.' : 'An administrator sent you this link to choose a new password for the clinic portal.'),
        button('Choose my password', a.inviteUrl),
        smallPrint('This link works once and expires in 7 days.'),
      ].join(''),
      note: 'If you weren’t expecting this, ignore this email.',
    }),
  };
}
