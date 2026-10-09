import { emailLayout, heading, paragraph } from '../email-layout';
import type { EmailContent } from './types';

/** Sent after a password is changed or reset, so the owner notices if it was not them. */
export function passwordChangedEmail(a: { firstName: string; audience?: 'patient' | 'staff' }): EmailContent {
  return {
    subject: 'Your password was changed',
    html: emailLayout({
      ...(a.audience === 'staff' ? { audience: 'staff' as const } : {}),
      preheader: 'Your password was just changed and other devices were signed out.',
      body: [
        heading(`Your password was changed, ${a.firstName}`),
        paragraph('Your password was just changed and every other device was signed out.'),
        paragraph('If this was you, there is nothing to do. If it was not, reset your password straight away and contact support.'),
      ].join(''),
    }),
  };
}
