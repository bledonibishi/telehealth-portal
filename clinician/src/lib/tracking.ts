/** What an order's tracking steps are called on screen, and which ones need someone to act. */
export const TRACKING_LABEL: Record<string, string> = {
  READY_FOR_PICKUP: 'Packed, waiting for the courier',
  PICKED_UP: 'Collected by the courier',
  IN_TRANSIT: 'On its way',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  DELIVERY_FAILED: 'Delivery attempt failed',
  RETURNED: 'Returned to the pharmacy',
  EXCEPTION: 'Delivery problem',
  CANNOT_FULFIL: 'The pharmacy can’t fulfil this order',
};

export const PROBLEM_STATUSES = ['DELIVERY_FAILED', 'RETURNED', 'EXCEPTION', 'CANNOT_FULFIL'];

export type TrackingEvent = { id: string; status: string; occurredAt: string; location?: string | null; note?: string | null; source?: string };

/** The courier's latest problem report, if it is still the latest word on the parcel. */
export function openProblem(events: TrackingEvent[] | undefined): TrackingEvent | null {
  const latest = events?.[0]; // newest first
  return latest && PROBLEM_STATUSES.includes(latest.status) ? latest : null;
}

/**
 * The expected delivery date, once it has passed with the parcel still on its way: someone should check with the
 * courier. Until a courier tells us automatically, this is what stops a delivered parcel sitting as "on its way".
 * The window is stored at midday on its last day, so it counts as passed from the evening of that day.
 */
export function overdueSince(order: { status: string; estimatedDeliveryTo?: string | null }, now = Date.now()): string | null {
  if (order.status !== 'DISPATCHED' && order.status !== 'OUT_FOR_DELIVERY') return null;
  if (!order.estimatedDeliveryTo) return null;
  return now > new Date(order.estimatedDeliveryTo).getTime() + 12 * 3_600_000 ? order.estimatedDeliveryTo : null;
}
