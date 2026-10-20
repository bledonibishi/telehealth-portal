import { button, emailLayout, heading, paragraph, smallPrint } from '../email-layout';
import type { EmailContent } from './types';

/** A renewal payment failed: ask the patient to update their card before more supplies are held up. */
export function paymentFailedEmail(a: { firstName: string; settingsUrl: string }): EmailContent {
  return {
    subject: 'Your payment didn’t go through',
    html: emailLayout({
      preheader: 'Update your card so your treatment can continue.',
      body: [
        heading(`We couldn’t take your payment, ${a.firstName}`),
        paragraph('Your latest payment was declined. Please update your card so your treatment can continue. Until it is paid, we can’t send your next supply.'),
        button('Update my card', a.settingsUrl),
        smallPrint('If you’ve just fixed it, you can ignore this email. We try the payment again on our own for a few days.'),
      ].join(''),
    }),
  };
}
