import { OrderStatus } from '../common/enums';

/**
 * What can happen to a parcel, in our own words. Every courier or tracking service has its own names;
 * an adapter turns them into these, and everything else in the app only knows these.
 */
export const TRACKING_STATUSES = [
  'READY_FOR_PICKUP', // packed by the pharmacy, waiting for the courier
  'PICKED_UP', // the courier has it (the order is "shipped")
  'IN_TRANSIT', // moving between depots
  'OUT_FOR_DELIVERY', // with the driver today
  'DELIVERED',
  'DELIVERY_FAILED', // an attempt didn't succeed (nobody in, refused, wrong address…)
  'RETURNED', // on its way back to the pharmacy
  'EXCEPTION', // any other problem: damaged, delayed, lost, held at customs
  'CANNOT_FULFIL', // the pharmacy can't supply it (out of stock, a concern); only staff and the pharmacy report this, never a courier
] as const;

export type TrackingStatus = (typeof TRACKING_STATUSES)[number];

/** The ones staff need to act on. */
export const PROBLEM_STATUSES: TrackingStatus[] = ['DELIVERY_FAILED', 'RETURNED', 'EXCEPTION', 'CANNOT_FULFIL'];

export const TRACKING_LABEL: Record<TrackingStatus, string> = {
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

// Spellings couriers and tracking services commonly use, after lower-casing and turning spaces and dashes into underscores.
const ALIASES: Record<string, TrackingStatus> = {
  ready: 'READY_FOR_PICKUP',
  ready_for_collection: 'READY_FOR_PICKUP',
  picked_up: 'PICKED_UP',
  pickup: 'PICKED_UP',
  collected: 'PICKED_UP',
  shipped: 'PICKED_UP',
  dispatched: 'PICKED_UP',
  in_transit: 'IN_TRANSIT',
  transit: 'IN_TRANSIT',
  on_the_way: 'IN_TRANSIT',
  at_depot: 'IN_TRANSIT',
  out_for_delivery: 'OUT_FOR_DELIVERY',
  with_courier: 'OUT_FOR_DELIVERY',
  delivered: 'DELIVERED',
  delivery_failed: 'DELIVERY_FAILED',
  failed: 'DELIVERY_FAILED',
  failed_attempt: 'DELIVERY_FAILED',
  attempt_failed: 'DELIVERY_FAILED',
  not_delivered: 'DELIVERY_FAILED',
  undelivered: 'DELIVERY_FAILED',
  returned: 'RETURNED',
  return_to_sender: 'RETURNED',
  returned_to_sender: 'RETURNED',
  exception: 'EXCEPTION',
  problem: 'EXCEPTION',
  delayed: 'EXCEPTION',
  lost: 'EXCEPTION',
  damaged: 'EXCEPTION',
};

/** Reads a status as a sender wrote it; null when it isn't one we know. */
export function parseTrackingStatus(raw: unknown): TrackingStatus | null {
  if (typeof raw !== 'string') return null;
  const key = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!key) return null;
  const direct = key.toUpperCase();
  if ((TRACKING_STATUSES as readonly string[]).includes(direct)) return direct as TrackingStatus;
  return ALIASES[key] ?? null;
}

/** How far along the order itself is, so it only ever moves forward. */
const RANK: Record<string, number> = {
  [OrderStatus.PENDING]: 0,
  [OrderStatus.DISPATCHED]: 1,
  [OrderStatus.OUT_FOR_DELIVERY]: 2,
  [OrderStatus.DELIVERED]: 3,
};

export const rankOf = (status: string) => RANK[status] ?? -1;

/** The order status a tracking status carries it to, or null when it only adds to the history. */
export function orderStatusFor(status: TrackingStatus): OrderStatus | null {
  switch (status) {
    case 'PICKED_UP':
    case 'IN_TRANSIT':
      return OrderStatus.DISPATCHED;
    case 'OUT_FOR_DELIVERY':
      return OrderStatus.OUT_FOR_DELIVERY;
    case 'DELIVERED':
      return OrderStatus.DELIVERED;
    default:
      return null;
  }
}
