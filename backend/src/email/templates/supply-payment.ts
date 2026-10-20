import { button, emailLayout, formatMoney, heading, paragraph, smallPrint } from '../email-layout';
import type { EmailContent } from './types';

/** The next supply of a patient who pays for each one: approved by the doctor, sent once it is paid. */
export function supplyPaymentEmail(a: { firstName: string; amount: number; currency: string; payUrl: string; reminder?: boolean }): EmailContent {
  const price = formatMoney(a.amount, a.currency);
  return {
    subject: a.reminder ? 'Reminder: pay for your next supply' : 'Your next supply is ready to pay for',
    html: emailLayout({
      preheader: `${price}. It ships as soon as it is paid.`,
      body: [
        heading(a.reminder ? `Your next supply is waiting, ${a.firstName}` : `Your next supply is approved, ${a.firstName}`),
        paragraph(`Your doctor has approved your next supply. It goes to the pharmacy as soon as you have paid ${price}. Any account credit you have is taken off first.`),
        button('Pay for my supply', a.payUrl),
        smallPrint('You pay for each supply when you choose to. Nothing is charged to your card automatically.'),
      ].join(''),
    }),
  };
}
