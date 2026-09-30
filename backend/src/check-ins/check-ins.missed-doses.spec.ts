import { CheckInsService } from './check-ins.service';

// Only the parts of submit() the missed-dose flag depends on.
function setup(doseEvents: { scheduledFor: Date; status: string }[], titrationStep = 3) {
  const prisma = {
    checkIn: {
      findUnique: jest.fn().mockResolvedValue({ id: 'c-1', patientId: 'p-1', status: 'SENT', tokenExpiresAt: new Date(Date.now() + 86_400_000) }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'c-1', patient: {} }),
    },
    prescription: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'rx-1',
        items: [{ id: 'item-1', product: { kind: 'GLP1', category: 'GLP1' }, strength: { label: '1 mg', titrationStep } }],
      }),
    },
    patient: { findUnique: jest.fn().mockResolvedValue({ id: 'p-1', lead: null }) },
    doseEvent: { findMany: jest.fn().mockResolvedValue(doseEvents) },
  };
  const service = new CheckInsService(prisma as any, {} as any, { get: () => undefined } as any);
  return { prisma, service };
}

const answers = [
  { questionId: 'weight_kg', answer: '100', value: '100' },
  { questionId: 'doses_missed', answer: 'None', value: '0' },
  { questionId: 'side_effects', answer: 'None', value: 'none' },
  { questionId: 'abdominal_pain', answer: 'No', value: 'no' },
  { questionId: 'gallbladder_symptoms', answer: 'No', value: 'no' },
  { questionId: 'pregnancy', answer: 'No', value: 'no' },
  { questionId: 'new_medicines', answer: 'No', value: 'no' },
];
const week = (n: number) => new Date(Date.UTC(2026, 8, 1 + 7 * n));
const savedFlags = (prisma: ReturnType<typeof setup>['prisma']) => prisma.checkIn.updateMany.mock.calls[0][0].data.redFlags;

describe('CheckInsService.submit — missed GLP-1 doses', () => {
  it('flags 2+ doses in a row not taken, even when the patient answers "none missed"', async () => {
    const { prisma, service } = setup([
      { scheduledFor: week(2), status: 'MISSED' },
      { scheduledFor: week(1), status: 'MISSED' },
      { scheduledFor: week(0), status: 'TAKEN' },
    ]);
    await service.submit('tok', { answers, wantsToReorder: true, feeling: 'GOOD' as any });

    expect(prisma.doseEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { prescriptionItemId: 'item-1', status: { not: 'SCHEDULED' }, scheduledFor: { lte: expect.any(Date) } } }));
    expect(savedFlags(prisma)).toEqual([expect.objectContaining({ severity: 'WARNING', description: expect.stringMatching(/^2 doses in a row not taken/) })]);
  });

  it('adds nothing when doses are being taken, or on the starting dose', async () => {
    const onTrack = setup([{ scheduledFor: week(1), status: 'TAKEN' }, { scheduledFor: week(0), status: 'MISSED' }]);
    await onTrack.service.submit('tok', { answers, wantsToReorder: true, feeling: 'GOOD' as any });
    expect(savedFlags(onTrack.prisma)).toEqual([]);

    const starting = setup([{ scheduledFor: week(1), status: 'MISSED' }, { scheduledFor: week(0), status: 'MISSED' }], 1);
    await starting.service.submit('tok', { answers, wantsToReorder: true, feeling: 'GOOD' as any });
    expect(savedFlags(starting.prisma)).toEqual([]);
  });
});
