import { button, callout, detailRows, emailLayout, escapeHtml, formatMoney, heading, paragraph, smallPrint } from '../email-layout';
import type { EmailContent } from './types';

export type ShopOrderEmailKind = 'PAID' | 'DISPATCHED' | 'REFUNDED' | 'CONFIRMED_COD' | 'TRANSFER_DETAILS';

export interface ShopOrderEmail {
  kind: ShopOrderEmailKind;
  reference: string;
  items: Array<{ name: string; quantity: number; totalCents: number }>;
  shippingCents: number;
  totalCents: number;
  currency: string;
  orderUrl: string;
  carrier?: string | null;
  trackingNumber?: string | null;
  refundedCents?: number;
  /** Paid on delivery or by bank transfer: a refund is given back by hand, not to a card. */
  offline?: boolean;
  /** For TRANSFER_DETAILS: where to send the money, and by when the order is held. */
  transfer?: { iban: string; accountName: string; bankName: string | null; payBy: Date };
}

/**
 * The shop's emails to a buyer: the order is confirmed to be paid on delivery, waits for a bank transfer, is paid, has
 * been sent, or money was given back. Shop products need no prescription, so the email lists them.
 */
export function shopOrderEmail(a: ShopOrderEmail & { firstName: string }): EmailContent {
  const money = (cents: number) => formatMoney(cents, a.currency);
  const rows: Array<[string, string]> = a.items.map((i) => [`${escapeHtml(i.name)} × ${i.quantity}`, money(i.totalCents)]);
  rows.push(['Delivery', a.shippingCents ? money(a.shippingCents) : 'Free']);
  rows.push(['Total', money(a.totalCents)]);
  const hi = `Hi ${escapeHtml(a.firstName)},`;

  if (a.kind === 'CONFIRMED_COD') {
    return {
      subject: `Order ${a.reference} confirmed: pay ${money(a.totalCents)} on delivery`,
      html: emailLayout({
        audience: 'shop',
        preheader: `Order ${a.reference} is confirmed. You pay when it arrives.`,
        body: [
          heading('Your order is confirmed'),
          paragraph(`${hi} thank you. We’re preparing order <strong>${escapeHtml(a.reference)}</strong>.`),
          callout(`You pay <strong>${money(a.totalCents)}</strong> to the courier when it arrives, in cash or by card on their terminal.`),
          detailRows(rows),
          button('See your order', a.orderUrl),
        ].join(''),
      }),
    };
  }

  if (a.kind === 'TRANSFER_DETAILS' && a.transfer) {
    const t = a.transfer;
    const payBy = t.payBy.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    return {
      subject: `Order ${a.reference}: bank transfer details`,
      html: emailLayout({
        audience: 'shop',
        preheader: `Transfer ${money(a.totalCents)} with reference ${a.reference}.`,
        body: [
          heading('Pay by bank transfer'),
          paragraph(`${hi} we’re holding order <strong>${escapeHtml(a.reference)}</strong> for you until ${escapeHtml(payBy)}. Please transfer the amount below, with the order reference as the description. We send your order as soon as the money arrives.`),
          detailRows([
            ['Amount', money(a.totalCents)],
            ['Account holder', t.accountName],
            ['IBAN', t.iban.replace(/(.{4})/g, '$1 ').trim()],
            ...(t.bankName ? ([['Bank', t.bankName]] as Array<[string, string]>) : []),
            ['Description', a.reference],
          ]),
          button('See your order', a.orderUrl),
        ].join(''),
      }),
    };
  }

  if (a.kind === 'TRANSFER_DETAILS') {
    // No account details to send: never fall through to "we've received your payment".
    return {
      subject: `Order ${a.reference} is reserved`,
      html: emailLayout({
        audience: 'shop',
        preheader: `We’re holding order ${a.reference} for you.`,
        body: [
          heading('Your order is reserved'),
          paragraph(`${hi} we’re holding order <strong>${escapeHtml(a.reference)}</strong> for you. The bank details for your transfer are on your order page.`),
          detailRows(rows),
          button('See your order', a.orderUrl),
        ].join(''),
      }),
    };
  }

  if (a.kind === 'DISPATCHED') {
    const tracking = [a.carrier, a.trackingNumber].filter(Boolean).map((v) => escapeHtml(String(v))).join(' · ');
    return {
      subject: `Your order ${a.reference} is on its way`,
      html: emailLayout({
        audience: 'shop',
        preheader: `Order ${a.reference} has been sent.`,
        body: [
          heading('Your order is on its way'),
          paragraph(`${hi} we’ve sent order <strong>${escapeHtml(a.reference)}</strong>.${tracking ? ` Tracking: ${tracking}.` : ''}`),
          detailRows(rows),
          button('See your order', a.orderUrl),
        ].join(''),
      }),
    };
  }

  if (a.kind === 'REFUNDED') {
    const amount = money(a.refundedCents ?? a.totalCents);
    return {
      subject: `Refund for order ${a.reference}: ${amount}`,
      html: emailLayout({
        audience: 'shop',
        preheader: `We’ve refunded ${amount}.`,
        body: [
          heading('Refund on its way'),
          paragraph(`${hi} we’ve refunded <strong>${amount}</strong> for order <strong>${escapeHtml(a.reference)}</strong>${a.offline ? '.' : ' to the card you paid with.'}`),
          ...(a.offline ? [] : [smallPrint('It usually shows on your statement within 5 to 10 working days, depending on your bank.')]),
        ].join(''),
      }),
    };
  }

  return {
    subject: `Order ${a.reference} confirmed: ${money(a.totalCents)}`,
    html: emailLayout({
      audience: 'shop',
      preheader: `Thank you. We’ve received your payment for order ${a.reference}.`,
      body: [
        heading('Thank you for your order'),
        paragraph(`${hi} we’ve received your payment for order <strong>${escapeHtml(a.reference)}</strong>. We’ll email you when it’s on its way.`),
        detailRows(rows),
        button('See your order', a.orderUrl),
        smallPrint('Keep this email for your records.'),
      ].join(''),
    }),
  };
}
