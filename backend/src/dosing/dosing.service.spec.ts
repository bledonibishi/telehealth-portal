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
      findMany: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    prescriptionItem: { findMany: jest.fn().mockResolvedValue([]) },
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

  it('does nothing for a product with no fixed dosing interval', async () => {
    const prisma = makePrisma();
    prisma.product.findUnique.mockResolvedValue({ doseIntervalDays: null });
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
    const alerts = await new DosingService(prisma as any).missedDoseAlerts();

    expect(alerts).toEqual([
      expect.objectContaining({ patientName: 'Sofia Meyer', productName: 'Wegovy', strengthLabel: '1 mg', titrationStep: 3, missedInARow: 2 }),
    ]);
    expect(prisma.prescriptionItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { prescription: { status: 'ACTIVE' }, product: { category: 'GLP1' }, strength: { titrationStep: { gt: 1 } } },
      }),
    );
  });
});
