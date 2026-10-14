import { DEFAULT_SUPPLY_CYCLE_DAYS as CYCLE, evaluateShipment, refillStateOf, sortAlerts, type ShipmentInput } from './shipment-alerts';

const DAY = 86_400_000;
const NOW = new Date('2026-10-15T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

const input = (over: Partial<ShipmentInput> = {}): ShipmentInput => ({
  prescription: { id: 'rx-1', medication: 'Wegovy 0.5 mg', refillsAllowed: 3 },
  patient: { id: 'p-1', name: 'Sofia Meyer' },
  orders: [{ status: 'DELIVERED', dispatchedAt: daysAgo(CYCLE) }],
  latestCheckIn: null,
  ...over,
});

const alertFor = (over: Partial<ShipmentInput> = {}, opts = {}) => evaluateShipment(input(over), { now: NOW, ...opts });

describe('evaluateShipment', () => {
  it('stays quiet until the next supply is within the warning window', () => {
    expect(alertFor({ orders: [{ status: 'DELIVERED', dispatchedAt: daysAgo(CYCLE - 10) }] })).toBeNull(); // 10 days left
    expect(alertFor({ orders: [{ status: 'DELIVERED', dispatchedAt: daysAgo(CYCLE - 5) }] })?.urgency).toBe('UPCOMING'); // 5 days left
  });

  it('is DUE on the day and for 3 days after, then OVERDUE', () => {
    expect(alertFor({ orders: [{ status: 'DELIVERED', dispatchedAt: daysAgo(CYCLE) }] })).toMatchObject({ urgency: 'DUE', daysUntilDue: 0 });
    expect(alertFor({ orders: [{ status: 'DELIVERED', dispatchedAt: daysAgo(CYCLE + 3) }] })?.urgency).toBe('DUE');
    expect(alertFor({ orders: [{ status: 'DELIVERED', dispatchedAt: daysAgo(CYCLE + 4) }] })).toMatchObject({ urgency: 'OVERDUE', daysUntilDue: -4 });
  });

  it('measures from the most recent shipment', () => {
    const a = alertFor({ orders: [{ status: 'DELIVERED', dispatchedAt: daysAgo(2 * CYCLE) }, { status: 'DISPATCHED', dispatchedAt: daysAgo(CYCLE - 2) }] });
    expect(a).toMatchObject({ daysUntilDue: 2, urgency: 'UPCOMING' });
  });

  it('ignores a patient whose first supply has not gone out, or who already has an order waiting', () => {
    expect(alertFor({ orders: [{ status: 'PENDING', dispatchedAt: null }] })).toBeNull();
    expect(alertFor({ orders: [{ status: 'DELIVERED', dispatchedAt: daysAgo(CYCLE) }, { status: 'PENDING', dispatchedAt: null }] })).toBeNull();
  });

  it('honours a different cycle length and warning window', () => {
    const orders = [{ status: 'DELIVERED', dispatchedAt: daysAgo(20) }];
    expect(alertFor({ orders }, { cycleDays: 30, leadDays: 12 })).toMatchObject({ daysUntilDue: 10, urgency: 'UPCOMING' });
  });

  describe('what is holding it up', () => {
    const due = [{ status: 'DELIVERED', dispatchedAt: daysAgo(CYCLE) }];
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
        orders: [{ status: 'DELIVERED', dispatchedAt: daysAgo(2 * CYCLE) }, { status: 'DELIVERED', dispatchedAt: daysAgo(CYCLE) }],
        hasCheckIns: true,
        latestCheckIn: done(2, null, null),
      });
      expect(a).toMatchObject({ blocker: 'NO_REPEATS_LEFT', repeatsLeft: 0 });
    });

    it('says nothing when the doctor put this month on hold', () => {
      expect(alertFor({ orders: due, hasCheckIns: true, latestCheckIn: done(3, 2, 'HOLD') })).toBeNull();
    });

    describe('after a hold', () => {
      // Shipped two cycles and two days ago; the doctor held month 1 (check-in completed a cycle and three days ago, i.e. a day before it was due).
      const held = [{ status: 'DELIVERED', dispatchedAt: daysAgo(2 * CYCLE + 2) }];
      const hold = done(CYCLE + 3, CYCLE + 2, 'HOLD');

      it('does not silence the following month: the alert returns when that one is due', () => {
        const a = alertFor({ orders: held, hasCheckIns: true, latestCheckIn: hold });
        expect(a).toMatchObject({ urgency: 'DUE', daysUntilDue: -2 });
        expect(a!.nextDueAt.getTime()).toBe(daysAgo(2 * CYCLE + 2).getTime() + 2 * CYCLE * DAY);
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
        // Shipped two days before the supply runs out, held two days ago: the skipped month is not nagged about, nor is the next, a cycle further on.
        expect(alertFor({ orders: [{ status: 'DELIVERED', dispatchedAt: daysAgo(CYCLE - 2) }], hasCheckIns: true, latestCheckIn: done(2, 1, 'HOLD') })).toBeNull();
      });

      // Shipped on day 0 of a 28-day cycle; the supply dates after it are day 28, 56, 84 …
      const nextDueDayAfterHoldOn = (day: number) => {
        const shipped = 3 * CYCLE;
        const a = alertFor({ orders: [{ status: 'DELIVERED', dispatchedAt: daysAgo(shipped) }], hasCheckIns: true, latestCheckIn: done(shipped - day, shipped - day - 0.5, 'HOLD') }, { leadDays: 36_500 });
        return (a!.nextDueAt.getTime() - daysAgo(shipped).getTime()) / DAY;
      };

      it.each([25, 28, 31, 40, 43, 50])('skips one supply, not two, for a hold on a check-in done on day %i', (day) => {
        // Early, on time or weeks late, it is the day-28 supply that was held (nothing went out for it): day 56 is next.
        expect(nextDueDayAfterHoldOn(day)).toBe(2 * CYCLE);
      });

      it.each([52, 56, 60])('holds the day-56 supply when the check-in was done for that one (day %i)', (day) => {
        // From the last few days before day 56 on, the check-in is that supply's: day 84 is next.
        expect(nextDueDayAfterHoldOn(day)).toBe(3 * CYCLE);
      });

      it('reads the same from the patient’s refill button, which looks much further ahead than the alert does', () => {
        const shipped = 3 * CYCLE;
        const far = alertFor({ orders: [{ status: 'DELIVERED', dispatchedAt: daysAgo(shipped) }], hasCheckIns: true, latestCheckIn: done(shipped - 31, shipped - 32, 'HOLD') }, { leadDays: 36_500 });
        expect((far!.nextDueAt.getTime() - daysAgo(shipped).getTime()) / DAY).toBe(2 * CYCLE);
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
    const sorted = [mk('upcoming', CYCLE - 4), mk('late-5', CYCLE + 5), mk('due', CYCLE), mk('late-9', CYCLE + 9)].sort(sortAlerts);
    expect(sorted.map((a) => a.patientId)).toEqual(['late-9', 'late-5', 'due', 'upcoming']);
  });
});

describe('refillStateOf', () => {
  const state = (over: Partial<ShipmentInput> = {}, shippedDaysAgo = 26) =>
    refillStateOf(alertFor({ orders: [{ status: 'DELIVERED', dispatchedAt: daysAgo(shippedDaysAgo) }], ...over }, { leadDays: 36_500 }), 5);

  it('has nothing to offer before a supply has shipped or while one is being prepared', () => {
    expect(refillStateOf(null, 5)).toBe('UNAVAILABLE');
  });

  it('opens five days before the next supply (day 23 of a 28-day cycle), not earlier', () => {
    expect(state({}, CYCLE - 6)).toBe('NOT_YET'); // 6 days left
    expect(state({}, CYCLE - 5)).toBe('READY'); // 5 days left
    expect(state({}, CYCLE + 1)).toBe('READY'); // late is still fine to ask
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
