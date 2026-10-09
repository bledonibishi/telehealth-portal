import { detailRows, emailLayout, escapeHtml, formatMoney, heading, paragraph, smallPrint } from '../email-layout';
import type { EmailContent } from './types';

/**
 * Confirms a payment: what was taken, when, and the reference, so the patient isn't left with only a bank
 * statement line. Nothing about the treatment: email isn't a secure channel.
 */
export function paymentReceiptEmail(a: { firstName: string; amount: number; currency: string; paidAt: Date; reference?: string | null }): EmailContent {
  const amount = formatMoney(a.amount, a.currency);
  const rows: Array<[string, string]> = [
    ['Amount paid', amount],
    ['Date', a.paidAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })],
  ];
  if (a.reference) rows.push(['Reference', a.reference]);
  return {
    subject: `Payment received — ${amount}`,
    html: emailLayout({
      preheader: `We received your payment of ${amount}.`,
      body: [
        heading('Payment received'),
        paragraph(`Hi ${escapeHtml(a.firstName)}, thank you. We’ve received your payment.`),
        detailRows(rows),
        paragraph('Your clinician reviews every request before anything is prescribed.'),
        smallPrint('Once your account is active, you can see all your payments and download invoices in your portal.'),
      ].join(''),
    }),
  };
}
