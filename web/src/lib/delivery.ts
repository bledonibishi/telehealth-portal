import { format } from 'date-fns';

type Estimate = { estimatedDeliveryFrom?: string | null; estimatedDeliveryTo?: string | null };

/** The courier's expected window as short text, e.g. "Tue 13 – Wed 14 Oct". Null when none was given. */
export function expectedDelivery(order: Estimate): string | null {
  const a = order.estimatedDeliveryFrom ?? order.estimatedDeliveryTo;
  const b = order.estimatedDeliveryTo ?? order.estimatedDeliveryFrom;
  if (!a || !b) return null;
  const from = new Date(a);
  const to = new Date(b);
  if (from.toDateString() === to.toDateString()) return format(to, 'EEE d MMM');
  return from.getMonth() === to.getMonth() ? `${format(from, 'EEE d')} – ${format(to, 'EEE d MMM')}` : `${format(from, 'EEE d MMM')} – ${format(to, 'EEE d MMM')}`;
}

/** How often an open order page asks for news, so a status change shows without a reload. */
export const ORDER_POLL_MS = 30_000;

/** How each step of the journey reads to a patient. */
export const TRACKING_LABEL: Record<string, string> = {
  READY_FOR_PICKUP: 'Packed by your pharmacy, waiting for the courier',
  PICKED_UP: 'Collected by the courier',
  IN_TRANSIT: 'On its way',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  DELIVERY_FAILED: 'The courier couldn’t deliver — they will usually try again',
  RETURNED: 'Being returned to the pharmacy — we’ll be in touch',
  EXCEPTION: 'There’s a delay with your delivery — we’re looking into it',
  CANNOT_FULFIL: 'There’s a delay with preparing your order — we’re looking into it and will be in touch',
};

export const TRACKING_PROBLEMS = ['DELIVERY_FAILED', 'RETURNED', 'EXCEPTION', 'CANNOT_FULFIL'];
