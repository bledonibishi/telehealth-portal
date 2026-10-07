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
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    prescriptionItem: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
    prescription: { findUnique: jest.fn().mockResolvedValue({ validUntil: null }) },
  };
}

function makeEmail() {
  return { sendDoseReminderEmail: jest.fn().mockResolvedValue(true) };
}

function makeConfig() {
  return { get: jest.fn().mockReturnValue(undefined) };
}

describe('DosingService.generateForItem', () => {
  it('generates a weekly window of scheduled doses anchored on the given date', async () => {
    const prisma = makePrisma();
    prisma.product.findUnique.mockResolvedValue({ doseIntervalDays: 7 });
    const service = new DosingService(prisma as any, makeEmail() as any, makeConfig() as any);
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
    const service = new DosingService(prisma as any, makeEmail() as any, makeConfig() as any);
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
    await new DosingService(prisma as any, makeEmail() as any, makeConfig() as any).generateForItem({ id: 'item-1', prescriptionId: 'rx-1', productId: 'sema' }, 'p-1', anchor);

    expect(prisma.doseEvent.upsert).toHaveBeenCalledTimes(3); // days 0, 7, 14
  });

  it('does nothing for a product with no dosing schedule', async () => {
    const prisma = makePrisma();
    prisma.product.findUnique.mockResolvedValue({ doseIntervalDays: null, dosesPerWeek: null });
    const service = new DosingService(prisma as any, makeEmail() as any, makeConfig() as any);

    await service.generateForItem({ id: 'item-1', prescriptionId: 'rx-1', productId: 'patch' }, 'p-1', new Date());

    expect(prisma.doseEvent.upsert).not.toHaveBeenCalled();
  });
});

describe('DosingService.cancelForPrescription', () => {
  it('deletes only not-yet-due scheduled doses for the prescription, keeping history', async () => {
    const prisma = makePrisma();
    const service = new DosingService(prisma as any, makeEmail() as any, makeConfig() as any);

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
    service = new DosingService(prisma as any, makeEmail() as any, makeConfig() as any);
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

  describe('injection site', () => {
    const pen = { product: { form: 'INJECTION_PEN' } };

    it('records where an injection went when marking it taken', async () => {
      prisma.doseEvent.findUnique.mockResolvedValue({ id: 'd-1', patientId: 'p-1', status: 'SCHEDULED', prescriptionItemId: 'item-1' });
      prisma.prescriptionItem.findUnique.mockResolvedValue(pen);
      await service.markTaken('p-1', 'd-1', 'THIGH_LEFT' as any);
      expect(prisma.doseEvent.update).toHaveBeenCalledWith({ where: { id: 'd-1' }, data: { status: 'TAKEN', takenAt: expect.any(Date), injectionSite: 'THIGH_LEFT' } });
    });

    it('refuses a site for something that is not injected', async () => {
      prisma.doseEvent.findUnique.mockResolvedValue({ id: 'd-1', patientId: 'p-1', status: 'SCHEDULED', prescriptionItemId: 'item-1' });
      prisma.prescriptionItem.findUnique.mockResolvedValue({ product: { form: 'GEL' } });
      await expect(service.markTaken('p-1', 'd-1', 'ARM_LEFT' as any)).rejects.toThrow(/only applies to an injection/);
      expect(prisma.doseEvent.update).not.toHaveBeenCalled();
    });

    it('adds a site to a dose already logged without one, but never replaces a chosen one', async () => {
      prisma.prescriptionItem.findUnique.mockResolvedValue(pen);
      prisma.doseEvent.findUnique.mockResolvedValue({ id: 'd-1', patientId: 'p-1', status: 'TAKEN', prescriptionItemId: 'item-1', injectionSite: null });
      await service.markTaken('p-1', 'd-1', 'ARM_RIGHT' as any);
      expect(prisma.doseEvent.update).toHaveBeenCalledWith({ where: { id: 'd-1' }, data: { injectionSite: 'ARM_RIGHT' } });

      prisma.doseEvent.update.mockClear();
      prisma.doseEvent.findUnique.mockResolvedValue({ id: 'd-1', patientId: 'p-1', status: 'TAKEN', prescriptionItemId: 'item-1', injectionSite: 'THIGH_LEFT' });
      await service.markTaken('p-1', 'd-1', 'ARM_RIGHT' as any);
      expect(prisma.doseEvent.update).not.toHaveBeenCalled();
    });
  });

  describe('feeling after a dose', () => {
    it('is stored on an injection that was taken', async () => {
      prisma.doseEvent.findUnique.mockResolvedValue({ id: 'd-1', patientId: 'p-1', status: 'TAKEN', prescriptionItemId: 'item-1' });
      prisma.prescriptionItem.findUnique.mockResolvedValue({ product: { form: 'INJECTION_PEN' } });
      await service.logFeeling('p-1', 'd-1', 'NOT_WELL' as any);
      expect(prisma.doseEvent.update).toHaveBeenCalledWith({ where: { id: 'd-1' }, data: { feelingAfter: 'NOT_WELL', feelingAfterAt: expect.any(Date) } });
    });

    it('is not recorded for a patch or a gel', async () => {
      prisma.doseEvent.findUnique.mockResolvedValue({ id: 'd-1', patientId: 'p-1', status: 'TAKEN', prescriptionItemId: 'item-1' });
      prisma.prescriptionItem.findUnique.mockResolvedValue({ product: { form: 'PATCH' } });
      await expect(service.logFeeling('p-1', 'd-1', 'GOOD' as any)).rejects.toThrow(/only recorded for injections/);
      expect(prisma.doseEvent.update).not.toHaveBeenCalled();
    });

    it('cannot be given for a dose that was not taken', async () => {
      prisma.doseEvent.findUnique.mockResolvedValue({ id: 'd-1', patientId: 'p-1', status: 'MISSED' });
      await expect(service.logFeeling('p-1', 'd-1', 'GOOD' as any)).rejects.toThrow(/taken first/);
    });

    it('cannot be given for another patient’s dose', async () => {
      prisma.doseEvent.findUnique.mockResolvedValue({ id: 'd-1', patientId: 'someone-else', status: 'TAKEN' });
      await expect(service.logFeeling('p-1', 'd-1', 'GOOD' as any)).rejects.toThrow(/not found/);
    });
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
    expect(prisma.doseEvent.update).toHaveBeenCalledWith({ where: { id: 'd-1' }, data: { status: 'SCHEDULED', takenAt: null, note: null, injectionSite: null, feelingAfter: null, feelingAfterAt: null } });

    prisma.doseEvent.findUnique.mockResolvedValue({ id: 'd-2', patientId: 'p-1', status: 'TAKEN', scheduledFor: new Date(Date.now() - 3 * DAY) });
    await service.unmark('p-1', 'd-2');
    expect(prisma.doseEvent.update).toHaveBeenCalledWith({ where: { id: 'd-2' }, data: { status: 'MISSED', takenAt: null, note: null, injectionSite: null, feelingAfter: null, feelingAfterAt: null } });
  });
});

describe('DosingService.houseKeeping', () => {
  it('flips overdue scheduled doses to missed', async () => {
    const prisma = makePrisma();
    prisma.doseEvent.updateMany.mockResolvedValue({ count: 3 });
    const service = new DosingService(prisma as any, makeEmail() as any, makeConfig() as any);

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

    const service = new DosingService(prisma as any, makeEmail() as any, makeConfig() as any);
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

    const service = new DosingService(prisma as any, makeEmail() as any, makeConfig() as any);
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
    await new DosingService(prisma as any, makeEmail() as any, makeConfig() as any).houseKeeping();

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
    await new DosingService(prisma as any, makeEmail() as any, makeConfig() as any).houseKeeping();

    expect(prisma.doseEvent.upsert).toHaveBeenCalledTimes(1); // only last + 7 days fits
  });

  it('does not top up an item that already has a full window', async () => {
    const prisma = makePrisma();
    prisma.prescriptionItem.findMany.mockResolvedValue([
      { id: 'item-1', product: { doseIntervalDays: 7 }, prescription: { patientId: 'p-1' }, doseEvents: [{ scheduledFor: new Date() }] },
    ]);
    prisma.doseEvent.count.mockResolvedValue(8);

    const service = new DosingService(prisma as any, makeEmail() as any, makeConfig() as any);
    await service.houseKeeping();

    expect(prisma.doseEvent.upsert).not.toHaveBeenCalled();
  });
});

describe('DosingService.missedDoseAlerts', () => {
  const item = (step: number, statuses: string[]) => ({
    product: { name: 'Semaglutide', brandName: 'Wegovy' },
    strength: { label: '1 mg', titrationStep: step },
    prescription: { patient: { id: `p-${step}-${statuses.join('')}`, firstName: 'Sofia', lastName: 'Meyer' } },
    // newest first, as the query orders them
    doseEvents: statuses.map((status, i) => ({ scheduledFor: new Date(Date.UTC(2026, 8, 29 - 7 * i)), status, takenAt: null })),
  });

  it('lists stepped-up GLP-1 patients with 2+ doses not taken in a row', async () => {
    const prisma = makePrisma();
    prisma.prescriptionItem.findMany.mockResolvedValue([
      item(3, ['MISSED', 'MISSED', 'TAKEN']),
      item(3, ['MISSED', 'TAKEN']), // only one
      item(3, ['TAKEN', 'MISSED', 'MISSED']), // back on track
    ]);
    const alerts = await new DosingService(prisma as any, makeEmail() as any, makeConfig() as any).missedDoseAlerts();

    expect(alerts).toEqual([
      expect.objectContaining({ patientName: 'Sofia Meyer', productName: 'Wegovy', strengthLabel: '1 mg', titrationStep: 3, missedInARow: 2 }),
    ]);
    expect(prisma.prescriptionItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { prescription: { status: 'ACTIVE' }, product: { category: 'GLP1' }, strength: { titrationStep: { gt: 1 } } },
        include: expect.objectContaining({
          // The whole logged history up to now — no cap — so long runs count in full.
          doseEvents: { where: { status: { not: 'SCHEDULED' }, scheduledFor: { lte: expect.any(Date) } }, orderBy: { scheduledFor: 'desc' } },
        }),
      }),
    );
  });

  it('counts a run longer than a dozen doses in full', async () => {
    const prisma = makePrisma();
    prisma.prescriptionItem.findMany.mockResolvedValue([item(3, [...Array(13).fill('MISSED'), 'TAKEN'])]);
    const [alert] = await new DosingService(prisma as any, makeEmail() as any, makeConfig() as any).missedDoseAlerts();
    expect(alert.missedInARow).toBe(13);
  });
});

describe('DosingService.missedDoseStatusFor', () => {
  const item = (step: number, statuses: string[]) => ({
    strength: { titrationStep: step },
    prescription: { patient: { id: 'p-1' } },
    doseEvents: statuses.map((status, i) => ({ scheduledFor: new Date(Date.UTC(2026, 8, 29 - 7 * i)), status, takenAt: null })),
  });

  it('looks only at the patient’s active GLP-1 prescription', async () => {
    const prisma = makePrisma();
    prisma.prescriptionItem.findMany.mockResolvedValue([item(3, ['MISSED', 'MISSED', 'TAKEN'])]);
    expect(await new DosingService(prisma as any, makeEmail() as any, makeConfig() as any).missedDoseStatusFor('p-1')).toEqual({ missedInARow: 2, needsClinician: true });
    expect(prisma.prescriptionItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { prescription: { patientId: 'p-1', status: 'ACTIVE' }, product: { category: 'GLP1' } } }),
    );
  });

  it('does not ask for the clinician on the starting dose or with nothing active', async () => {
    const prisma = makePrisma();
    prisma.prescriptionItem.findMany.mockResolvedValue([item(1, ['MISSED', 'MISSED'])]);
    expect(await new DosingService(prisma as any, makeEmail() as any, makeConfig() as any).missedDoseStatusFor('p-1')).toEqual({ missedInARow: 2, needsClinician: false });
    prisma.prescriptionItem.findMany.mockResolvedValue([]);
    expect(await new DosingService(prisma as any, makeEmail() as any, makeConfig() as any).missedDoseStatusFor('p-1')).toEqual({ missedInARow: 0, needsClinician: false });
  });
});

describe('DosingService.sendReminders', () => {
  it('claims a dose, emails it, and keeps the claim when delivery succeeds', async () => {
    const prisma = makePrisma();
    const scheduledFor = new Date(Date.now() + 3 * 3_600_000);
    prisma.doseEvent.findMany.mockResolvedValue([
      {
        id: 'd-1',
        scheduledFor,
        patient: { email: 'p@example.com', firstName: 'Tia' },
        prescriptionItem: { product: { name: 'Semaglutide' } },
      },
    ]);
    prisma.doseEvent.updateMany.mockResolvedValueOnce({ count: 1 }); // the claim succeeds
    const email = makeEmail();
    const service = new DosingService(prisma as any, email as any, makeConfig() as any);

    const sent = await service.sendReminders();

    expect(sent).toBe(1);
    expect(prisma.doseEvent.updateMany).toHaveBeenCalledWith({ where: { id: 'd-1', reminderSentAt: null }, data: { reminderSentAt: expect.any(Date) } });
    expect(email.sendDoseReminderEmail).toHaveBeenCalledWith('p@example.com', 'Tia', 'Semaglutide', scheduledFor, expect.stringContaining('/doses'));
    expect(prisma.doseEvent.updateMany).toHaveBeenCalledTimes(1); // no release call on success
  });

  it('skips a dose that another run already claimed', async () => {
    const prisma = makePrisma();
    prisma.doseEvent.findMany.mockResolvedValue([
      { id: 'd-1', scheduledFor: new Date(), patient: { email: 'p@example.com', firstName: 'Tia' }, prescriptionItem: { product: { name: 'Semaglutide' } } },
    ]);
    prisma.doseEvent.updateMany.mockResolvedValueOnce({ count: 0 }); // lost the race (or the dose was cancelled)
    const email = makeEmail();
    const service = new DosingService(prisma as any, email as any, makeConfig() as any);

    const sent = await service.sendReminders();

    expect(sent).toBe(0);
    expect(email.sendDoseReminderEmail).not.toHaveBeenCalled();
  });

  it('releases the claim on a failed send and keeps processing the rest of the batch', async () => {
    const prisma = makePrisma();
    prisma.doseEvent.findMany.mockResolvedValue([
      { id: 'd-1', scheduledFor: new Date(), patient: { email: 'a@example.com', firstName: 'A' }, prescriptionItem: { product: { name: 'Semaglutide' } } },
      { id: 'd-2', scheduledFor: new Date(), patient: { email: 'b@example.com', firstName: 'B' }, prescriptionItem: { product: { name: 'Semaglutide' } } },
    ]);
    prisma.doseEvent.updateMany
      .mockResolvedValueOnce({ count: 1 }) // claim d-1
      .mockResolvedValueOnce({ count: 1 }) // release d-1 after its failed send
      .mockResolvedValueOnce({ count: 1 }); // claim d-2
    const email = makeEmail();
    email.sendDoseReminderEmail.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const service = new DosingService(prisma as any, email as any, makeConfig() as any);

    const sent = await service.sendReminders();

    expect(sent).toBe(1); // only d-2 counted
    expect(email.sendDoseReminderEmail).toHaveBeenCalledTimes(2); // d-2 still attempted despite d-1 failing
    expect(prisma.doseEvent.updateMany).toHaveBeenNthCalledWith(2, { where: { id: 'd-1' }, data: { reminderSentAt: null } });
  });

  it('only looks at scheduled doses within the reminder window that have not already been reminded', async () => {
    const prisma = makePrisma();
    const service = new DosingService(prisma as any, makeEmail() as any, makeConfig() as any);

    await service.sendReminders();

    expect(prisma.doseEvent.findMany).toHaveBeenCalledWith({
      where: { status: 'SCHEDULED', reminderSentAt: null, scheduledFor: { gte: expect.any(Date), lte: expect.any(Date) } },
      include: { patient: true, prescriptionItem: { include: { product: true } } },
    });
  });

  it('does nothing when there is nothing upcoming', async () => {
    const prisma = makePrisma();
    const email = makeEmail();
    const service = new DosingService(prisma as any, email as any, makeConfig() as any);

    const sent = await service.sendReminders();

    expect(sent).toBe(0);
    expect(email.sendDoseReminderEmail).not.toHaveBeenCalled();
  });
});

describe('DosingService.summaryFor', () => {
  const item = { id: 'item-1', product: { name: 'Semaglutide', brandName: 'Wegovy' }, strength: { label: '0.25 mg' } };
  const build = (rx: any, next: any) => {
    const prisma = makePrisma() as any;
    prisma.prescription.findFirst = jest.fn().mockResolvedValue(rx);
    prisma.doseEvent.findFirst.mockResolvedValue(next);
    return { prisma, service: new DosingService(prisma, makeEmail() as any, makeConfig() as any) };
  };

  it('names the current dose and gives the date of the next injection', async () => {
    const at = new Date(Date.now() + 3 * DAY);
    const { service, prisma } = build({ medication: 'Semaglutide', dosage: '0.25 mg', items: [item] }, { id: 'ev-1', scheduledFor: at, prescriptionItem: item });
    expect(await service.summaryFor('p-1')).toEqual({ current: 'Wegovy 0.25 mg', nextDoseId: 'ev-1', nextDoseAt: at });
    // only the patient's own, still-scheduled doses of the active prescription
    expect(prisma.doseEvent.findFirst.mock.calls[0][0].where).toMatchObject({ patientId: 'p-1', prescriptionItemId: { in: ['item-1'] }, status: 'SCHEDULED' });
  });

  it('still shows the dose when no further dose has been scheduled yet', async () => {
    const { service } = build({ medication: 'Semaglutide', dosage: '0.25 mg', items: [item] }, null);
    expect(await service.summaryFor('p-1')).toEqual({ current: 'Wegovy 0.25 mg', nextDoseId: undefined, nextDoseAt: undefined });
  });

  it('is null without an active prescription', async () => {
    const { service } = build(null, null);
    expect(await service.summaryFor('p-1')).toBeNull();
  });
});

describe('DosingService.ensureSchedule', () => {
  const item = (issuedAt: Date, product: Record<string, unknown> = { doseIntervalDays: 7, dosesPerWeek: null }) => ({
    id: 'item-1', product, prescription: { issuedAt, validUntil: null },
  });

  it('writes the schedule a prescription never got, starting on the day it was issued', async () => {
    const prisma = makePrisma();
    const issuedAt = new Date(Date.now() - 2 * DAY);
    prisma.prescriptionItem.findMany.mockResolvedValue([item(issuedAt)]);
    const service = new DosingService(prisma as any, makeEmail() as any, makeConfig() as any);

    await service.calendarFor('p-1');

    // Only active, in-date prescriptions on a medicine with fixed dose days that have no doses at all.
    expect(prisma.prescriptionItem.findMany.mock.calls[0][0].where).toMatchObject({ prescription: { patientId: 'p-1', status: 'ACTIVE' }, doseEvents: { none: {} } });
    const dates = prisma.doseEvent.upsert.mock.calls.map((c: any) => c[0].create.scheduledFor.getTime());
    expect(dates).toHaveLength(8);
    expect(dates[0]).toBe(issuedAt.getTime());
    expect(dates[1]).toBe(issuedAt.getTime() + 7 * DAY);
    expect(prisma.doseEvent.upsert.mock.calls[0][0].create).toMatchObject({ prescriptionItemId: 'item-1', patientId: 'p-1' });
  });

  it('picks an old prescription up from today instead of inventing months of missed doses', async () => {
    const prisma = makePrisma();
    prisma.prescriptionItem.findMany.mockResolvedValue([item(new Date(Date.now() - 90 * DAY))]);
    const service = new DosingService(prisma as any, makeEmail() as any, makeConfig() as any);

    await service.ensureSchedule('p-1');

    const dates = prisma.doseEvent.upsert.mock.calls.map((c: any) => c[0].create.scheduledFor.getTime());
    expect(dates).toHaveLength(8);
    expect(Math.min(...dates)).toBeGreaterThan(Date.now() - DAY);
  });

  it('writes nothing when every prescription already has its doses, or the medicine has no fixed days', async () => {
    const prisma = makePrisma();
    const service = new DosingService(prisma as any, makeEmail() as any, makeConfig() as any);
    await service.ensureSchedule('p-1');
    prisma.prescriptionItem.findMany.mockResolvedValue([item(new Date(), { doseIntervalDays: null, dosesPerWeek: null })]);
    await service.ensureSchedule('p-1');
    expect(prisma.doseEvent.upsert).not.toHaveBeenCalled();
  });
});
