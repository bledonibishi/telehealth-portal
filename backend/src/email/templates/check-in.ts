import { button, emailLayout, heading, paragraph, smallPrint } from '../email-layout';
import type { EmailContent } from './types';

/** The personal link to the periodic check-in. */
export function checkInEmail(a: { firstName: string; checkInUrl: string }): EmailContent {
  return {
    subject: 'Your check-in is ready',
    html: emailLayout({
      preheader: 'It takes about 2 minutes.',
      body: [
        heading(`Time for your check-in, ${a.firstName}`),
        paragraph('Share your weight and how you’re feeling. It takes about 2 minutes and helps us keep your treatment on track.'),
        button('Start my check-in', a.checkInUrl),
        smallPrint('This link is personal to you and expires in 14 days.'),
      ].join(''),
    }),
  };
}
