import { emailLayout, heading, paragraph, smallPrint } from '../email-layout';
import type { EmailContent } from './types';

/** The refund is agreed but waits for the parcel on its way to the patient to come back. */
export function refundAwaitingReturnEmail(a: { firstName?: string | null }): EmailContent {
  return {
    subject: 'Your refund: please don’t open your parcel',
    html: emailLayout({
      preheader: 'We’ll refund you as soon as the parcel is back with us.',
      body: [
        heading(a.firstName ? `About your refund, ${a.firstName}` : 'About your refund'),
        paragraph('We’re refunding you. Your parcel has already left the pharmacy, and medicine can’t be taken back into stock once it has been delivered, so we’ll send the money back as soon as the parcel is returned to us.'),
        paragraph('Please <b>don’t open it or use it</b>. If it arrives, refuse the delivery, or keep it sealed and message us so we can arrange its return.'),
        smallPrint('If you’ve already received it, message your care team and we’ll sort it out together.'),
      ].join(''),
    }),
  };
}
