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
      update: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    prescriptionItem: { findMany: jest.fn().mockResolvedValue([]) },
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

  it('does nothing for a product with no fixed dosing interval', async () => {
    const prisma = makePrisma();
    prisma.product.findUnique.mockResolvedValue({ doseIntervalDays: null });
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
