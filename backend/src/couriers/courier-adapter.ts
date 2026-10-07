import type { TrackingStatus } from './tracking-status';

/** One thing that happened to a parcel, in our own words. */
export interface TrackingEventInput {
  /** Our reference for the order (the order id we gave the courier); or the courier's tracking number. At least one. */
  reference?: string;
  trackingNumber?: string;
  status: TrackingStatus;
  occurredAt: Date;
  /** The sender's id for this event; a resend with the same id is recorded once. */
  externalId?: string;
  location?: string;
  note?: string;
  carrier?: string;
  trackingUrl?: string;
  estimatedDeliveryFrom?: Date;
  estimatedDeliveryTo?: Date;
}

/**
 * How one courier or tracking service talks to us. Adding another is one class: say how to check a call
 * really came from them, and how to read its events. Everything after that is shared.
 */
export interface CourierAdapter {
  /** The name in the webhook URL: POST /courier/webhook/<key>. */
  readonly key: string;
  /** Whether the call genuinely came from the sender: normally a signature over the exact bytes received. */
  verify(call: { rawBody: Buffer; headers: Record<string, string | string[] | undefined>; secret: string }): boolean;
  /** Reads the call's body into events. Throws BadRequestException when it can't be read. */
  parse(body: unknown): TrackingEventInput[];
}

/**
 * A courier that has a tracking API but doesn't call us: we ask it. Write one class per courier (or per tracking
 * service) and list it in couriers.module.ts; the poller in CouriersService does the rest. The answer is turned into
 * the same events a webhook would send, so everything after that is shared.
 */
export interface CourierTracker {
  /** Short name for the audit trail and logs. */
  readonly key: string;
  /** Whether this tracker handles a parcel carried by `carrier` (the name staff typed, or the courier sent). */
  handles(carrier: string): boolean;
  /** Asks the courier where the parcel is: every step it knows about, in any order. Throws if it can't be reached. */
  fetch(trackingNumber: string): Promise<TrackingEventInput[]>;
}

/** Injection token for the list of trackers; empty until a courier with a tracking API is added. */
export const COURIER_TRACKERS = Symbol('COURIER_TRACKERS');
