import { button, emailLayout, formatMoney, heading, paragraph, smallPrint } from '../email-layout';
import type { EmailContent } from './types';

/**
 * After a first-order refund: the prescription the doctor wrote is still good for a few days, so the patient can change their
 * mind and pay for the medicine only. The prescription fee was paid once and is not asked again.
 */
export function comeBackEmail(a: { firstName: string; amount: number; currency: string; payUrl: string; until: string }): EmailContent {
  const price = formatMoney(a.amount, a.currency);
  return {
    subject: 'Your refund, and your prescription is still valid',
    html: emailLayout({
      preheader: `Order again until ${a.until} without paying the prescription fee again.`,
      body: [
        heading(`Your refund is on its way, ${a.firstName}`),
        paragraph('We’ve refunded you for the medicine. As we explained, the prescription fee isn’t returned, because the doctor’s work can’t be undone.'),
        paragraph(`Your prescription is valid until <b>${a.until}</b>. If you change your mind before then, you can order the same treatment for <b>${price}</b>, the medicine only. You won’t pay the prescription fee again.`),
        button('Order my treatment', a.payUrl),
        smallPrint('After that date your prescription expires, and starting again means a new assessment and a new prescription fee. Your account is closed, and your records are kept. You can ask us for a copy at any time.'),
      ].join(''),
    }),
  };
}
