import { button, emailLayout, heading, paragraph, smallPrint } from '../email-layout';
import type { EmailContent } from './types';

/** After the first payment: the link that turns the paid lead into a patient account. */
export function activationEmail(a: { firstName: string; activationUrl: string }): EmailContent {
  return {
    subject: 'Welcome to Omopharmacy — activate your account',
    html: emailLayout({
      preheader: 'Your payment went through. Activate your account to get started.',
      body: [
        heading(`Welcome, ${a.firstName}`),
        paragraph('Your payment was successful. Activate your account to open your patient portal, where you can follow your treatment, message your care team and manage your orders.'),
        button('Activate my account', a.activationUrl),
        smallPrint('This link expires in 7 days.'),
      ].join(''),
      note: 'If you didn’t sign up, you can ignore this email.',
    }),
  };
}
