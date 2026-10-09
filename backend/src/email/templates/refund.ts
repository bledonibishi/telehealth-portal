import { emailLayout, escapeHtml, formatMoney, heading, hero, paragraph, smallPrint } from '../email-layout';
import type { EmailContent } from './types';

/** Tells a patient money is on its way back to them. `firstName` may be unknown (the greeting is then plain). */
export function refundEmail(a: { firstName?: string | null; amount: number; currency: string }): EmailContent {
  const amount = formatMoney(a.amount, a.currency);
  return {
    subject: 'Your refund is on its way',
    html: emailLayout({
      preheader: `We’ve refunded ${amount} to your original payment method.`,
      body: [
        heading('Your refund is on its way'),
        paragraph(`${a.firstName ? `Hi ${escapeHtml(a.firstName)}, we` : 'We'}’ve refunded your payment.`),
        hero(amount, 'is going back to the card you paid with.'),
        paragraph('It usually shows up within 5 to 10 business days, depending on your bank.'),
        smallPrint('Questions? Message your care team from your portal.'),
      ].join(''),
    }),
  };
}
