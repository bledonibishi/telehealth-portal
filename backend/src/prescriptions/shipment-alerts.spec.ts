import { evaluateShipment, refillStateOf, sortAlerts, type ShipmentInput } from './shipment-alerts';

const DAY = 86_400_000;
const NOW = new Date('2026-10-15T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

const input = (over: Partial<ShipmentInput> = {}): ShipmentInput => ({
  prescription: { id: 'rx-1', medication: 'Wegovy 0.5 mg', refillsAllowed: 3 },
  patient: { id: 'p-1', name: 'Sofia Meyer' },
  orders: [{ status: 'DELIVERED', dispatchedAt: daysAgo(30) }],
  latestCheckIn: null,
  ...over,
});

const alertFor = (over: Partial<ShipmentInput> = {}, opts = {}) => evaluateShipment(input(over), { now: NOW, ...opts });

describe('evaluateShipment', () => {
  it('stays quiet until the next supply is within the warning window', () => {
    expect(alertFor({ orders: [{ status: 'DELIVERED', dispatchedAt: daysAgo(20) }] })).toBeNull(); // 10 days left
    expect(alertFor({ orders: [{ status: 'DELIVERED', dispatchedAt: daysAgo(25) }] })?.urgency).toBe('UPCOMING'); // 5 days left
  });

  it('is DUE on the day and for 3 days after, then OVERDUE', () => {
    expect(alertFor({ orders: [{ status: 'DELIVERED', dispatchedAt: daysAgo(30) }] })).toMatchObject({ urgency: 'DUE', daysUntilDue: 0 });
    expect(alertFor({ orders: [{ status: 'DELIVERED', dispatchedAt: daysAgo(33) }] })?.urgency).toBe('DUE');
    expect(alertFor({ orders: [{ status: 'DELIVERED', dispatchedAt: daysAgo(34) }] })).toMatchObject({ urgency: 'OVERDUE', daysUntilDue: -4 });
  });

  it('measures from the most recent shipment', () => {
    const a = alertFor({ orders: [{ status: 'DELIVERED', dispatchedAt: daysAgo(60) }, { status: 'DISPATCHED', dispatchedAt: daysAgo(28) }] });
    expect(a).toMatchObject({ daysUntilDue: 2, urgency: 'UPCOMING' });
  });

  it('ignores a patient whose first supply has not gone out, or who already has an order waiting', () => {
    expect(alertFor({ orders: [{ status: 'PENDING', dispatchedAt: null }] })).toBeNull();
    expect(alertFor({ orders: [{ status: 'DELIVERED', dispatchedAt: daysAgo(30) }, { status: 'PENDING', dispatchedAt: null }] })).toBeNull();
  });

  it('honours a different cycle length and warning window', () => {
    const orders = [{ status: 'DELIVERED', dispatchedAt: daysAgo(20) }];
    expect(alertFor({ orders }, { cycleDays: 28, leadDays: 10 })).toMatchObject({ daysUntilDue: 8, urgency: 'UPCOMING' });
  });

  describe('what is holding it up', () => {
    const due = [{ status: 'DELIVERED', dispatchedAt: daysAgo(30) }];
    const done = (completed: number, reviewed: number | null, outcome: string | null = 'REPEAT') => ({
      completedAt: daysAgo(completed), reviewedAt: reviewed === null ? null : daysAgo(reviewed), outcome,
    });

    it('is nothing when the patient has no check-ins at all', () => {
      expect(alertFor({ orders: due, hasCheckIns: false })?.blocker).toBe('NONE');
    });

    it('is the patient when they have check-ins but none done since the last supply', () => {
      expect(alertFor({ orders: due, hasCheckIns: true, latestCheckIn: null })?.blocker).toBe('AWAITING_CHECKIN');
      // an old one from the cycle before doesn't count
      expect(alertFor({ orders: due, hasCheckIns: true, latestCheckIn: done(40, 39) })?.blocker).toBe('AWAITING_CHECKIN');
    });

    it('is the doctor when the check-in is done but not reviewed', () => {
      expect(alertFor({ orders: due, hasCheckIns: true, latestCheckIn: done(2, null, null) })?.blocker).toBe('AWAITING_REVIEW');
    });

    it('is nothing once it has been reviewed', () => {
      expect(alertFor({ orders: due, hasCheckIns: true, latestCheckIn: done(3, 2) })?.blocker).toBe('NONE');
    });

    it('is a new prescription when every repeat has been used — whatever the check-in says', () => {
      const a = alertFor({
        prescription: { id: 'rx-1', medication: 'x', refillsAllowed: 1 },
        orders: [{ status: 'DELIVERED', dispatchedAt: daysAgo(60) }, { status: 'DELIVERED', dispatchedAt: daysAgo(30) }],
        hasCheckIns: true,
        latestCheckIn: done(2, null, null),
      });
      expect(a).toMatchObject({ blocker: 'NO_REPEATS_LEFT', repeatsLeft: 0 });
    });

    it('says nothing when the doctor put this month on hold', () => {
      expect(alertFor({ orders: due, hasCheckIns: true, latestCheckIn: done(3, 2, 'HOLD') })).toBeNull();
    });

    describe('after a hold', () => {
      // Shipped 62 days ago; the doctor held month 1 (check-in completed 33 days ago, i.e. 29 days after shipping).
      const held = [{ status: 'DELIVERED', dispatchedAt: daysAgo(62) }];
      const hold = done(33, 32, 'HOLD');

      it('does not silence the following month: the alert returns when that one is due', () => {
        const a = alertFor({ orders: held, hasCheckIns: true, latestCheckIn: hold });
        expect(a).toMatchObject({ urgency: 'DUE', daysUntilDue: -2 });
        expect(a!.nextDueAt.getTime()).toBe(daysAgo(62).getTime() + 60 * DAY);
      });

      it('waits on the next scheduled check-in, which the old hold does not satisfy', () => {
        // The next month's check-in exists (scheduled/sent) but is not completed yet.
        expect(alertFor({ orders: held, hasCheckIns: true, latestCheckIn: hold })?.blocker).toBe('AWAITING_CHECKIN');
      });

      it('moves on to the doctor and then to ready as the next check-in is done and reviewed', () => {
        expect(alertFor({ orders: held, hasCheckIns: true, latestCheckIn: done(1, null, null) })?.blocker).toBe('AWAITING_REVIEW');
        expect(alertFor({ orders: held, hasCheckIns: true, latestCheckIn: done(2, 1, 'REPEAT') })?.blocker).toBe('NONE');
      });

      it('stays quiet while the held month is still the nearest one', () => {
        // Shipped 28 days ago, held two days ago: the skipped month is not nagged about, nor is the next, 32 days away.
        expect(alertFor({ orders: [{ status: 'DELIVERED', dispatchedAt: daysAgo(28) }], hasCheckIns: true, latestCheckIn: done(2, 1, 'HOLD') })).toBeNull();
      });

      it('skips two cycles when the hold was made after the first one was already late', () => {
        // Held 45 days after shipping: that belongs to month 2 (due at day 60), so month 3 (day 90) is next.
        const a = alertFor({ orders: [{ status: 'DELIVERED', dispatchedAt: daysAgo(88) }], hasCheckIns: true, latestCheckIn: done(43, 42, 'HOLD') });
        expect(a!.nextDueAt.getTime()).toBe(daysAgo(88).getTime() + 90 * DAY);
      });

      it('does not treat a hold that is still awaiting review as a skipped month', () => {
        expect(alertFor({ orders: due, hasCheckIns: true, latestCheckIn: done(3, null, 'HOLD') })?.blocker).toBe('AWAITING_REVIEW');
      });
    });
  });
});

describe('sortAlerts', () => {
  it('puts overdue first, then due, then upcoming, soonest first within each', () => {
    const mk = (id: string, daysAgoShipped: number) => evaluateShipment(input({ patient: { id, name: id }, orders: [{ status: 'DELIVERED', dispatchedAt: daysAgo(daysAgoShipped) }] }), { now: NOW })!;
    const sorted = [mk('upcoming', 26), mk('late-5', 35), mk('due', 30), mk('late-9', 39)].sort(sortAlerts);
    expect(sorted.map((a) => a.patientId)).toEqual(['late-9', 'late-5', 'due', 'upcoming']);
  });
});

describe('refillStateOf', () => {
  const state = (over: Partial<ShipmentInput> = {}, shippedDaysAgo = 26) =>
    refillStateOf(alertFor({ orders: [{ status: 'DELIVERED', dispatchedAt: daysAgo(shippedDaysAgo) }], ...over }, { leadDays: 36_500 }), 5);

  it('has nothing to offer before a supply has shipped or while one is being prepared', () => {
    expect(refillStateOf(null, 5)).toBe('UNAVAILABLE');
  });

  it('opens five days before the next supply (day 25 of a 30-day cycle), not earlier', () => {
    expect(state({}, 24)).toBe('NOT_YET'); // 6 days left
    expect(state({}, 25)).toBe('READY'); // 5 days left
    expect(state({}, 31)).toBe('READY'); // late is still fine to ask
  });

  it('sends the patient to their check-in first, and never over the doctor’s review', () => {
    expect(state({ hasCheckIns: true, latestCheckIn: null })).toBe('CHECK_IN_FIRST');
    expect(state({ hasCheckIns: true, latestCheckIn: { completedAt: daysAgo(1), reviewedAt: null, outcome: null } })).toBe('IN_REVIEW');
  });

  it('says so when there are no repeats left, and when the patient has already asked', () => {
    expect(state({ prescription: { id: 'rx-1', medication: 'Wegovy', refillsAllowed: 0 } })).toBe('NO_REPEATS');
    expect(state({ refillRequestedAt: daysAgo(1) })).toBe('REQUESTED');
  });

  it('carries the request onto the alert doctors see', () => {
    expect(alertFor({ refillRequestedAt: daysAgo(1) })?.refillRequestedAt).toEqual(daysAgo(1));
    expect(alertFor()?.refillRequestedAt).toBeNull();
  });
});
