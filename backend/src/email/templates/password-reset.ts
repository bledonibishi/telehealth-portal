import { button, emailLayout, heading, paragraph, smallPrint } from '../email-layout';
import type { EmailContent } from './types';

/** The "forgot password" link. Patients and staff get the same wording; staff get the staff layout. */
export function passwordResetEmail(a: { firstName: string; resetUrl: string; audience?: 'patient' | 'staff'; expiresInMinutes: number }): EmailContent {
  return {
    subject: 'Reset your password',
    html: emailLayout({
      ...(a.audience === 'staff' ? { audience: 'staff' as const } : {}),
      preheader: 'Use this link to choose a new password.',
      body: [
        heading(`Reset your password, ${a.firstName}`),
        paragraph('We received a request to reset your password. Choose a new one with the button below.'),
        button('Choose a new password', a.resetUrl),
        smallPrint(`This link works once and expires in ${a.expiresInMinutes} minutes.`),
      ].join(''),
      note: 'If you didn’t ask for this, ignore this email — your password has not changed.',
    }),
  };
}
