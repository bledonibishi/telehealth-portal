import type { Booking } from '@prisma/client';

/**
 * What a booking can be for. Each part of the system that takes bookings registers its purposes with
 * BookingService (see `register`), and that is all it needs to do to get a scheduler, a mirrored record
 * and change notifications. Which Cal.com event type a purpose opens is configuration, not code:
 *   CALCOM_EVENT_<KEY>=<cal username or team>/<event-type-slug>      e.g. CALCOM_EVENT_APPOINTMENT_ROUTINE=clinic/routine
 *   CALCOM_EVENT_DEFAULT                                             used by purposes without one of their own
 */
export interface BookingPurpose {
  /** Upper snake case; also the suffix of its CALCOM_EVENT_ setting. */
  key: string;
  /** What the patient is booking, in their words. */
  label: string;
  /** The booking must belong to something (an appointment request, a check-in…). */
  requiresReference?: boolean;
  /** Refuse (throw) when this patient may not book this, e.g. the reference is not theirs. */
  authorize?(patientId: string, referenceId: string | null): Promise<void>;
  /**
   * A short line the host sees on the booking in their calendar, e.g. "Reason: Side effect". It is stored by
   * the scheduling provider and goes into its emails and calendar invites, so keep it to a category — never
   * what the patient wrote.
   */
  describe?(patientId: string, referenceId: string | null): Promise<string | null>;
  /** Called after a booking for this purpose is made, moved, cancelled or completed. */
  onChange?(booking: Booking): Promise<void>;
}

/** A call with the care team that is not tied to anything else; available everywhere. */
export const GENERAL_PURPOSE: BookingPurpose = { key: 'GENERAL', label: 'A call with your care team' };

/** Bookings made on Cal.com directly (not from the portal) that match no purpose. Staff still see them. */
export const UNLINKED_PURPOSE = 'UNLINKED';

export const eventSettingOf = (key: string) => `CALCOM_EVENT_${key}`;

/** "clinic/routine", from a setting that may be a full URL or have stray slashes. Null when it is not a usable link. */
export function calLinkOf(raw: string | undefined | null): string | null {
  const v = raw?.trim().replace(/^https?:\/\/[^/]+\//i, '').replace(/^\/+|\/+$/g, '');
  return v && /^[A-Za-z0-9._~-]+(\/[A-Za-z0-9._~-]+)+$/.test(v) ? v : null;
}
