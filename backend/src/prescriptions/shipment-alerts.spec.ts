import { evaluateShipment, sortAlerts, type ShipmentInput } from './shipment-alerts';

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
  });
});

describe('sortAlerts', () => {
  it('puts overdue first, then due, then upcoming, soonest first within each', () => {
    const mk = (id: string, daysAgoShipped: number) => evaluateShipment(input({ patient: { id, name: id }, orders: [{ status: 'DELIVERED', dispatchedAt: daysAgo(daysAgoShipped) }] }), { now: NOW })!;
    const sorted = [mk('upcoming', 26), mk('late-5', 35), mk('due', 30), mk('late-9', 39)].sort(sortAlerts);
    expect(sorted.map((a) => a.patientId)).toEqual(['late-9', 'late-5', 'due', 'upcoming']);
  });
});
