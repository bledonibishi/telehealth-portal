import { emailLayout, heading, paragraph, smallPrint } from '../email-layout';
import type { EmailContent } from './types';

/** After a first-order refund with no prescription left to use: the account is closed, and the records are kept. */
export function accountClosedEmail(a: { firstName: string }): EmailContent {
  return {
    subject: 'Your account is closed',
    html: emailLayout({
      preheader: 'Your refund is on its way. Your records are kept.',
      body: [
        heading(`Your refund is on its way, ${a.firstName}`),
        paragraph('We’ve refunded you for the medicine. The prescription fee isn’t returned, because the doctor’s work can’t be undone.'),
        paragraph('Your account is now closed, so you can’t sign in. Your health records are kept, as the law requires, and you can ask us for a copy at any time. If you want to start again, take the assessment on our website.'),
        smallPrint('If you think this is a mistake, contact us and we will look into it.'),
      ].join(''),
    }),
  };
}
