import { button, emailLayout, heading, paragraph, smallPrint } from '../email-layout';
import type { EmailContent } from './types';

/**
 * Monthly, for six months after a subscription ends: the account and the records are still here, and treatment can be picked
 * up again. The last one says when the account closes.
 */
export function lapsedEmail(a: { firstName: string; month: number; of: number; portalUrl: string; closesOn: string }): EmailContent {
  const last = a.month >= a.of;
  return {
    subject: last ? 'Your account closes soon' : 'Your treatment is on pause',
    html: emailLayout({
      preheader: last ? `Your account closes on ${a.closesOn}.` : 'Your account and records are still here when you want to continue.',
      body: [
        heading(last ? `Last reminder, ${a.firstName}` : `We miss you, ${a.firstName}`),
        paragraph('Your subscription ended, so we’re not sending any more supplies. Your account and your health records are still here.'),
        paragraph(last
          ? `If you want to keep your account, sign in before <b>${a.closesOn}</b> and choose “Restart my treatment” in Settings. After that date your account closes and you won’t be able to sign in. Your records are kept, as the law requires, and you can ask us for a copy at any time.`
          : 'If you’d like to continue, sign in and choose “Restart my treatment” in Settings. Your doctor will then ask for a short check-in and write a new prescription.'),
        button('Sign in', a.portalUrl),
        smallPrint(last ? 'We only email once a month, and this is the last one.' : `This is reminder ${a.month} of ${a.of}. We email once a month, and we’ll stop if you start again.`),
      ].join(''),
    }),
  };
}

/** Six months on, with no reply: the account is closed and the records are kept. */
export function lapsedClosedEmail(a: { firstName: string }): EmailContent {
  return {
    subject: 'Your account is closed',
    html: emailLayout({
      preheader: 'Your records are kept.',
      body: [
        heading(`Your account is closed, ${a.firstName}`),
        paragraph('It has been six months since your subscription ended, so we’ve closed your account. You can no longer sign in.'),
        paragraph('Your health records are kept, as the law requires, and you can ask us for a copy at any time. If you want to start again, take the assessment on our website.'),
      ].join(''),
    }),
  };
}
