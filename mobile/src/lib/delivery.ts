// How an order reads to a patient. The same words as the web portal (web/src/lib/delivery.ts), so the two never disagree.

const day = (d: Date, withMonth: boolean) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', ...(withMonth ? { month: 'short' } : {}) });

type Estimate = { estimatedDeliveryFrom?: string | null; estimatedDeliveryTo?: string | null };

/** The courier's expected window as short text, e.g. "Tue 13 – Wed 14 Oct". Null when none was given. */
export function expectedDelivery(order: Estimate): string | null {
  const a = order.estimatedDeliveryFrom ?? order.estimatedDeliveryTo;
  const b = order.estimatedDeliveryTo ?? order.estimatedDeliveryFrom;
  if (!a || !b) return null;
  const from = new Date(a);
  const to = new Date(b);
  if (from.toDateString() === to.toDateString()) return day(to, true);
  return from.getMonth() === to.getMonth() ? `${day(from, false)} – ${day(to, true)}` : `${day(from, true)} – ${day(to, true)}`;
}

export const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
export const shortDateTime = (iso: string) =>
  `${shortDate(iso)}, ${new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;

/** How often an open orders screen asks for news, so a status change shows without pulling to refresh. */
export const ORDER_POLL_MS = 30_000;

export const STAGES = ['Preparing', 'Shipped', 'On the way', 'Delivered'] as const;
export const STAGE_OF: Record<string, number> = { PENDING: 0, DISPATCHED: 1, OUT_FOR_DELIVERY: 2, DELIVERED: 3 };
export const STAGE_TIME = ['createdAt', 'dispatchedAt', 'outForDeliveryAt', 'deliveredAt'] as const;

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

export const ORDER_STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  PENDING: { label: 'Preparing', bg: '#fffbeb', fg: '#b45309' },
  DISPATCHED: { label: 'Shipped', bg: '#ecfdf5', fg: '#047857' },
  OUT_FOR_DELIVERY: { label: 'On the way', bg: '#ecfdf5', fg: '#047857' },
  DELIVERED: { label: 'Delivered', bg: '#f1f5f9', fg: '#334155' },
  CANCELLED: { label: 'Cancelled', bg: '#f1f5f9', fg: '#64748b' },
};
