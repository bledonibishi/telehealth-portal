import { DosingService } from './dosing.service';

const DAY = 86_400_000;

function makePrisma() {
  const store = new Map<string, any>();
  const upsert = jest.fn(({ where, create }) => {
    const key = `${where.prescriptionItemId_scheduledFor.prescriptionItemId}:${where.prescriptionItemId_scheduledFor.scheduledFor.toISOString()}`;
    if (!store.has(key)) store.set(key, { id: key, status: 'SCHEDULED', ...create });
    return Promise.resolve(store.get(key));
  });
  return {
    store,
    product: { findUnique: jest.fn() },
    doseEvent: {
      upsert,
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    prescriptionItem: { findMany: jest.fn().mockResolvedValue([]) },
    prescription: { findUnique: jest.fn().mockResolvedValue({ validUntil: null }) },
  };
}

describe('DosingService.generateForItem', () => {
  it('generates a weekly window of scheduled doses anchored on the given date', async () => {
    const prisma = makePrisma();
    prisma.product.findUnique.mockResolvedValue({ doseIntervalDays: 7 });
    const service = new DosingService(prisma as any);
    const anchor = new Date('2026-10-01T09:00:00Z');

    await service.generateForItem({ id: 'item-1', prescriptionId: 'rx-1', productId: 'sema' }, 'p-1', anchor);

    expect(prisma.doseEvent.upsert).toHaveBeenCalledTimes(8);
    const dates = prisma.doseEvent.upsert.mock.calls.map((c: any) => c[0].create.scheduledFor.getTime());
    expect(dates[0]).toBe(anchor.getTime());
    expect(dates[1]).toBe(anchor.getTime() + 7 * DAY);
    expect(new Set(dates).size).toBe(8);
  });

  it('schedules a twice-weekly patch on the same two weekdays every week', async () => {
    const prisma = makePrisma();
    prisma.product.findUnique.mockResolvedValue({ doseIntervalDays: null, dosesPerWeek: 2 });
    const service = new DosingService(prisma as any);
    const monday = new Date('2026-10-05T09:00:00Z'); // pinned to midday UTC for patches

    await service.generateForItem({ id: 'item-1', prescriptionId: 'rx-1', productId: 'patch' }, 'p-1', monday);

    const dates = prisma.doseEvent.upsert.mock.calls.map((c: any) => c[0].create.scheduledFor as Date);
    expect(dates).toHaveLength(8);
    expect(dates.map((d) => d.getUTCDay())).toEqual([1, 4, 1, 4, 1, 4, 1, 4]); // Mon/Thu
    expect(dates[0].toISOString()).toBe('2026-10-05T12:00:00.000Z');
    expect(dates[2].getTime()).toBe(dates[0].getTime() + 7 * DAY);
  });

  it('does not schedule past the prescription’s validity', async () => {
    const prisma = makePrisma();
    prisma.product.findUnique.mockResolvedValue({ doseIntervalDays: 7 });
    const anchor = new Date('2026-10-01T09:00:00Z');
    prisma.prescription.findUnique.mockResolvedValue({ validUntil: new Date(anchor.getTime() + 20 * DAY) });
    await new DosingService(prisma as any).generateForItem({ id: 'item-1', prescriptionId: 'rx-1', productId: 'sema' }, 'p-1', anchor);

    expect(prisma.doseEvent.upsert).toHaveBeenCalledTimes(3); // days 0, 7, 14
  });

  it('does nothing for a product with no dosing schedule', async () => {
    const prisma = makePrisma();
    prisma.product.findUnique.mockResolvedValue({ doseIntervalDays: null, dosesPerWeek: null });
    const service = new DosingService(prisma as any);

    await service.generateForItem({ id: 'item-1', prescriptionId: 'rx-1', productId: 'patch' }, 'p-1', new Date());

    expect(prisma.doseEvent.upsert).not.toHaveBeenCalled();
  });
});

describe('DosingService.cancelForPrescription', () => {
  it('deletes only not-yet-due scheduled doses for the prescription, keeping history', async () => {
    const prisma = makePrisma();
    const service = new DosingService(prisma as any);

    await service.cancelForPrescription('rx-1');

    expect(prisma.doseEvent.deleteMany).toHaveBeenCalledWith({
      where: { status: 'SCHEDULED', prescriptionItem: { prescriptionId: 'rx-1' } },
    });
  });
});

describe('DosingService patient actions', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: DosingService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new DosingService(prisma as any);
  });

  it('marks an owned, scheduled dose as taken', async () => {
    prisma.doseEvent.findUnique.mockResolvedValue({ id: 'd-1', patientId: 'p-1', status: 'SCHEDULED' });
    prisma.doseEvent.update.mockResolvedValue({ id: 'd-1', status: 'TAKEN' });

    await service.markTaken('p-1', 'd-1');

    expect(prisma.doseEvent.update).toHaveBeenCalledWith({
      where: { id: 'd-1' },
      data: { status: 'TAKEN', takenAt: expect.any(Date) },
    });
  });

  it('refuses to act on another patient’s dose', async () => {
    prisma.doseEvent.findUnique.mockResolvedValue({ id: 'd-1', patientId: 'someone-else', status: 'SCHEDULED' });
    await expect(service.markTaken('p-1', 'd-1')).rejects.toThrow(/not found/);
    expect(prisma.doseEvent.update).not.toHaveBeenCalled();
  });

  it('refuses to mark an already-skipped dose as taken', async () => {
    prisma.doseEvent.findUnique.mockResolvedValue({ id: 'd-1', patientId: 'p-1', status: 'SKIPPED' });
    await expect(service.markTaken('p-1', 'd-1')).rejects.toThrow(/already marked as skipped/);
  });

  it('is idempotent when a dose is already taken', async () => {
    const taken = { id: 'd-1', patientId: 'p-1', status: 'TAKEN' };
    prisma.doseEvent.findUnique.mockResolvedValue(taken);
    const result = await service.markTaken('p-1', 'd-1');
    expect(result).toBe(taken);
    expect(prisma.doseEvent.update).not.toHaveBeenCalled();
  });

  it('marks a scheduled dose as skipped with an optional note', async () => {
    prisma.doseEvent.findUnique.mockResolvedValue({ id: 'd-1', patientId: 'p-1', status: 'SCHEDULED' });
    await service.markSkipped('p-1', 'd-1', '  Paused by clinician  ');
    expect(prisma.doseEvent.update).toHaveBeenCalledWith({ where: { id: 'd-1' }, data: { status: 'SKIPPED', note: 'Paused by clinician' } });
  });

  it('refuses to skip an already-taken dose', async () => {
    prisma.doseEvent.findUnique.mockResolvedValue({ id: 'd-1', patientId: 'p-1', status: 'TAKEN' });
    await expect(service.markSkipped('p-1', 'd-1')).rejects.toThrow(/already marked as taken/);
  });

  it('unmarks back to scheduled if still within the grace window, or missed if overdue', async () => {
    prisma.doseEvent.findUnique.mockResolvedValue({ id: 'd-1', patientId: 'p-1', status: 'TAKEN', scheduledFor: new Date() });
    await service.unmark('p-1', 'd-1');
    expect(prisma.doseEvent.update).toHaveBeenCalledWith({ where: { id: 'd-1' }, data: { status: 'SCHEDULED', takenAt: null, note: null } });

    prisma.doseEvent.findUnique.mockResolvedValue({ id: 'd-2', patientId: 'p-1', status: 'TAKEN', scheduledFor: new Date(Date.now() - 3 * DAY) });
    await service.unmark('p-1', 'd-2');
    expect(prisma.doseEvent.update).toHaveBeenCalledWith({ where: { id: 'd-2' }, data: { status: 'MISSED', takenAt: null, note: null } });
  });
});

describe('DosingService.houseKeeping', () => {
  it('flips overdue scheduled doses to missed', async () => {
    const prisma = makePrisma();
    prisma.doseEvent.updateMany.mockResolvedValue({ count: 3 });
    const service = new DosingService(prisma as any);

    await service.houseKeeping();

    expect(prisma.doseEvent.updateMany).toHaveBeenCalledWith({
      where: { status: 'SCHEDULED', scheduledFor: { lt: expect.any(Date) } },
      data: { status: 'MISSED' },
    });
  });

  it('tops up only the shortfall for an item running low, anchored off its last scheduled dose', async () => {
    const prisma = makePrisma();
    const lastDate = new Date('2026-10-01T09:00:00Z');
    prisma.prescriptionItem.findMany.mockResolvedValue([
      {
        id: 'item-1',
        product: { doseIntervalDays: 7 },
        prescription: { patientId: 'p-1' },
        doseEvents: [{ scheduledFor: lastDate }],
      },
    ]);
    prisma.doseEvent.count.mockResolvedValue(3); // 3 of the usual 8 left

    const service = new DosingService(prisma as any);
    await service.houseKeeping();

    expect(prisma.doseEvent.upsert).toHaveBeenCalledTimes(5); // top up to 8
    const first = prisma.doseEvent.upsert.mock.calls[0][0].create.scheduledFor.getTime();
    expect(first).toBe(lastDate.getTime() + 7 * DAY); // starts after the last one, not on it
  });

  it('tops up a twice-weekly patch keeping the weekdays set by its first dose', async () => {
    const prisma = makePrisma();
    const firstMonday = new Date('2026-10-05T12:00:00Z');
    const lastThursday = new Date('2026-10-22T12:00:00Z');
    prisma.prescriptionItem.findMany.mockResolvedValue([
      {
        id: 'item-1',
        product: { doseIntervalDays: null, dosesPerWeek: 2 },
        prescription: { patientId: 'p-1', issuedAt: firstMonday, validUntil: null },
        doseEvents: [{ scheduledFor: lastThursday }],
      },
    ]);
    prisma.doseEvent.findFirst.mockResolvedValue({ scheduledFor: firstMonday });
    prisma.doseEvent.count.mockResolvedValue(5);

    const service = new DosingService(prisma as any);
    await service.houseKeeping();

    const dates = prisma.doseEvent.upsert.mock.calls.map((c: any) => (c[0].create.scheduledFor as Date).toISOString());
    expect(dates).toEqual(['2026-10-26T12:00:00.000Z', '2026-10-29T12:00:00.000Z', '2026-11-02T12:00:00.000Z']);
  });

  it('backfills a patch prescription with no doses on its own schedule, future dates only', async () => {
    const prisma = makePrisma();
    const issuedAt = new Date(Date.now() - 10 * DAY);
    prisma.prescriptionItem.findMany.mockResolvedValue([
      { id: 'item-1', product: { doseIntervalDays: null, dosesPerWeek: 2 }, prescription: { patientId: 'p-1', issuedAt, validUntil: null }, doseEvents: [] },
    ]);
    prisma.doseEvent.count.mockResolvedValue(0);

    const before = Date.now();
    await new DosingService(prisma as any).houseKeeping();

    const dates = prisma.doseEvent.upsert.mock.calls.map((c: any) => c[0].create.scheduledFor as Date);
    expect(dates).toHaveLength(8);
    expect(dates[0].getTime()).toBeGreaterThan(before);
    // Same weekdays as the prescription's issue date (+0 / +3 days).
    const issuedDay = issuedAt.getUTCDay();
    expect(new Set(dates.map((d) => d.getUTCDay()))).toEqual(new Set([issuedDay, (issuedDay + 3) % 7]));
    expect(prisma.prescriptionItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          prescription: { status: 'ACTIVE', OR: [{ validUntil: null }, { validUntil: { gt: expect.any(Date) } }] },
          product: { OR: [{ doseIntervalDays: { not: null } }, { dosesPerWeek: { not: null } }] },
        },
      }),
    );
  });

  it('never tops up beyond the prescription’s validity', async () => {
    const prisma = makePrisma();
    const last = new Date(Date.now() + DAY);
    prisma.prescriptionItem.findMany.mockResolvedValue([
      { id: 'item-1', product: { doseIntervalDays: 7 }, prescription: { patientId: 'p-1', issuedAt: new Date(), validUntil: new Date(last.getTime() + 10 * DAY) }, doseEvents: [{ scheduledFor: last }] },
    ]);
    prisma.doseEvent.count.mockResolvedValue(1);
    await new DosingService(prisma as any).houseKeeping();

    expect(prisma.doseEvent.upsert).toHaveBeenCalledTimes(1); // only last + 7 days fits
  });

  it('does not top up an item that already has a full window', async () => {
    const prisma = makePrisma();
    prisma.prescriptionItem.findMany.mockResolvedValue([
      { id: 'item-1', product: { doseIntervalDays: 7 }, prescription: { patientId: 'p-1' }, doseEvents: [{ scheduledFor: new Date() }] },
    ]);
    prisma.doseEvent.count.mockResolvedValue(8);

    const service = new DosingService(prisma as any);
    await service.houseKeeping();

    expect(prisma.doseEvent.upsert).not.toHaveBeenCalled();
  });
});
