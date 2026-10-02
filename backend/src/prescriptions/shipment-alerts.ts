const DAY_MS = 86_400_000;

/** How long a supply is meant to last, and how early to start warning. Overridable per deployment. */
export const DEFAULT_SUPPLY_CYCLE_DAYS = 30;
export const DEFAULT_ALERT_LEAD_DAYS = 5;
/** Past this many days late, a due shipment is OVERDUE rather than just DUE. */
export const OVERDUE_AFTER_DAYS = 3;

export type ShipmentUrgency = 'UPCOMING' | 'DUE' | 'OVERDUE';

/** Who or what is holding the next supply up. */
export type ShipmentBlocker =
  | 'NONE' //             nothing in the way — the next order can be placed
  | 'AWAITING_CHECKIN' // the patient hasn't done this cycle's monthly check-in
  | 'AWAITING_REVIEW' //  checked in; a doctor still has to review it
  | 'NO_REPEATS_LEFT'; // all repeats used — a new prescription is needed

export interface ShipmentInput {
  prescription: { id: string; medication: string; refillsAllowed: number };
  patient: { id: string; name: string };
  /** The prescription's orders, cancelled ones excluded. */
  orders: Array<{ status: string; dispatchedAt: Date | null }>;
  /** The patient's most recent *completed* monthly check-in, if any. */
  latestCheckIn?: { completedAt: Date | null; reviewedAt: Date | null; outcome: string | null } | null;
  /** Whether the patient has monthly check-ins at all (scheduled, sent or done). Without any, nothing can be waiting on one. */
  hasCheckIns?: boolean;
}

export interface ShipmentAlert {
  prescriptionId: string;
  patientId: string;
  patientName: string;
  medication: string;
  lastShippedAt: Date;
  nextDueAt: Date;
  /** Whole days until the next supply is due; negative once late. */
  daysUntilDue: number;
  urgency: ShipmentUrgency;
  blocker: ShipmentBlocker;
  repeatsLeft: number;
}

const SHIPPED = ['DISPATCHED', 'OUT_FOR_DELIVERY', 'DELIVERED'];

/**
 * Decides whether a patient's next supply deserves an alert right now, and what is holding it up.
 * Returns null when there is nothing to flag: no supply has gone out yet, an order is already
 * waiting for the pharmacy, or the shipment isn't near (including when the doctor put this month on
 * hold: that pushes the next supply back a cycle, and the alert returns when that one gets close).
 */
export function evaluateShipment(
  input: ShipmentInput,
  opts: { now?: Date; cycleDays?: number; leadDays?: number } = {},
): ShipmentAlert | null {
  const now = opts.now ?? new Date();
  const cycleDays = opts.cycleDays ?? DEFAULT_SUPPLY_CYCLE_DAYS;
  const leadDays = opts.leadDays ?? DEFAULT_ALERT_LEAD_DAYS;

  // Already queued with the pharmacy: operations can see it under "To dispatch".
  if (input.orders.some((o) => o.status === 'PENDING')) return null;

  const shippedAt = input.orders
    .filter((o) => SHIPPED.includes(o.status) && o.dispatchedAt)
    .map((o) => o.dispatchedAt as Date);
  if (shippedAt.length === 0) return null; // the first supply is the orders queue's job

  const lastShippedAt = new Date(Math.max(...shippedAt.map((d) => d.getTime())));
  const cycleMs = cycleDays * DAY_MS;
  const latest = input.latestCheckIn?.completedAt && input.latestCheckIn.completedAt > lastShippedAt ? input.latestCheckIn : null;

  // A reviewed HOLD means the doctor skipped one particular month, the one this check-in was made for.
  // Skipping it moves the next supply on by a cycle — it must not silence every month after it.
  let skippedCycles = 0;
  let check = latest;
  if (latest?.outcome === 'HOLD' && latest.reviewedAt) {
    const elapsed = latest.completedAt!.getTime() - lastShippedAt.getTime() - OVERDUE_AFTER_DAYS * DAY_MS;
    skippedCycles = Math.max(Math.floor(elapsed / cycleMs), 0) + 1;
    check = null; // that check-in belongs to the month that was skipped, not to the next one
  }

  const nextDueAt = new Date(lastShippedAt.getTime() + (1 + skippedCycles) * cycleMs);
  const daysUntilDue = Math.ceil((nextDueAt.getTime() - now.getTime()) / DAY_MS);
  if (daysUntilDue > leadDays) return null;

  const repeatsLeft = Math.max(input.prescription.refillsAllowed - (input.orders.length - 1), 0);

  let blocker: ShipmentBlocker;
  if (repeatsLeft === 0) blocker = 'NO_REPEATS_LEFT';
  else if (check) blocker = check.reviewedAt ? 'NONE' : 'AWAITING_REVIEW';
  else blocker = input.hasCheckIns ? 'AWAITING_CHECKIN' : 'NONE';

  const urgency: ShipmentUrgency =
    daysUntilDue > 0 ? 'UPCOMING' : daysUntilDue >= -OVERDUE_AFTER_DAYS ? 'DUE' : 'OVERDUE';

  return {
    prescriptionId: input.prescription.id,
    patientId: input.patient.id,
    patientName: input.patient.name,
    medication: input.prescription.medication,
    lastShippedAt,
    nextDueAt,
    daysUntilDue,
    urgency,
    blocker,
    repeatsLeft,
  };
}

const URGENCY_RANK: Record<ShipmentUrgency, number> = { OVERDUE: 0, DUE: 1, UPCOMING: 2 };

/** Most urgent first, then soonest due. */
export const sortAlerts = (a: ShipmentAlert, b: ShipmentAlert) =>
  URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency] || a.nextDueAt.getTime() - b.nextDueAt.getTime();
