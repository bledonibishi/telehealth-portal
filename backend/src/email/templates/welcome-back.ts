import { button, emailLayout, heading, paragraph, smallPrint } from '../email-layout';
import type { EmailContent } from './types';

/** A patient with an existing account paid again: no new account, they sign in with the one they have. */
export function welcomeBackEmail(a: { firstName: string; signInUrl: string; resetUrl: string; idCheckNeeded: boolean }): EmailContent {
  return {
    subject: 'Welcome back — sign in to continue',
    html: emailLayout({
      preheader: 'Your payment went through. Sign in with your existing account.',
      body: [
        heading(`Welcome back, ${a.firstName}`),
        paragraph('Your payment was successful, and your account is open again. Sign in with the email and password you used before. A doctor will review your new answers before anything is prescribed.'),
        ...(a.idCheckNeeded ? [paragraph('It has been more than a year since we checked your ID, so we’ll ask you to confirm it again when you sign in.')] : []),
        button('Sign in', a.signInUrl),
        smallPrint(`Forgotten your password? <a href="${a.resetUrl}">Reset it here</a>.`),
      ].join(''),
      note: 'If this wasn’t you, contact us straight away.',
    }),
  };
}
