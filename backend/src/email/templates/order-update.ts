import { type Tone, button, callout, detailRows, emailLayout, escapeHtml, heading, paragraph } from '../email-layout';
import type { EmailContent } from './types';

export type OrderUpdateKind = 'SHIPPED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'DELIVERY_FAILED';

const COPY: Record<OrderUpdateKind, { subject: string; title: string; body: string; tone: Tone }> = {
  SHIPPED: { subject: 'Your order is on its way', title: 'Your order is on its way', body: 'Your pharmacy has packed your order and handed it to the courier.', tone: 'info' },
  OUT_FOR_DELIVERY: { subject: 'Your order is out for delivery', title: 'Out for delivery today', body: 'The courier has your order and is on the way to you.', tone: 'info' },
  DELIVERY_FAILED: { subject: 'We couldn’t deliver your order today', title: 'We couldn’t deliver today', body: 'The courier wasn’t able to hand over your order. They will usually try again; if you won’t be home, message your care team from the portal and we’ll help.', tone: 'warning' },
  DELIVERED: { subject: 'Your order has been delivered', title: 'Your order has arrived', body: 'Your order has been delivered. If you can’t find it, message your care team from the portal.', tone: 'success' },
};

/**
 * Tells a patient their order has moved. Deliberately generic about the medicine: email isn't a secure
 * channel, so the detail stays in the portal.
 */
export function orderUpdateEmail(a: {
  firstName: string;
  kind: OrderUpdateKind;
  carrier?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  expected?: string | null;
  ordersUrl: string;
}): EmailContent {
  const c = COPY[a.kind];
  const moving = a.kind !== 'DELIVERED';
  const rows: Array<[string, string]> = [];
  if (moving && a.kind !== 'DELIVERY_FAILED' && a.expected) rows.push(['Expected delivery', a.expected]);
  if (moving && a.carrier) rows.push(['Courier', a.carrier]);
  if (moving && a.trackingNumber) rows.push(['Tracking number', a.trackingNumber]);
  return {
    subject: c.subject,
    html: emailLayout({
      preheader: c.body,
      body: [
        heading(`${c.title}, ${a.firstName}`),
        callout(escapeHtml(c.body), c.tone),
        rows.length ? detailRows(rows) : '',
        moving && a.trackingUrl ? paragraph(`<a href="${escapeHtml(a.trackingUrl)}" style="color:#1E4FD8;font-weight:700">Track your parcel</a>`) : '',
        button('View my order', a.ordersUrl),
      ].join(''),
    }),
  };
}
