import { TrtMonitoringService } from './trt-monitoring.service';

const DAY = 86_400_000;

function makePrisma({ prescriptions = [] as any[], labResults = [] as any[], trtRx = null as any } = {}) {
  return {
    prescription: {
      findMany: jest.fn().mockResolvedValue(prescriptions),
      findFirst: jest.fn().mockResolvedValue(trtRx),
    },
    labResult: { findMany: jest.fn().mockResolvedValue(labResults) },
  };
}

describe('TrtMonitoringService', () => {
  it('is null for a patient not currently on testosterone', async () => {
    const prisma = makePrisma({ prescriptions: [{ issuedAt: new Date(), status: 'SUPERSEDED' }] });
    expect(await new TrtMonitoringService(prisma as any).statusFor('p-1')).toBeNull();
  });

  it('dates the schedule from the first testosterone prescription', async () => {
    const first = new Date(Date.now() - 10 * DAY);
    const prisma = makePrisma({
      prescriptions: [{ issuedAt: first, status: 'SUPERSEDED' }, { issuedAt: new Date(), status: 'ACTIVE' }],
    });
    const status = await new TrtMonitoringService(prisma as any).statusFor('p-1');

    expect(status?.startedAt).toEqual(first);
    expect(status?.labs.map((l) => l.kind)).toEqual(['TESTOSTERONE', 'HEMATOCRIT', 'PSA']);
    expect(status?.refillsOnHold).toBe(false); // baseline due, but within the grace period
  });

  it('blocks a repeat while on hold, and allows other prescriptions', async () => {
    const prisma = makePrisma({
      trtRx: { patientId: 'p-1' },
      prescriptions: [{ issuedAt: new Date(Date.now() - 60 * DAY), status: 'ACTIVE' }],
    });
    const service = new TrtMonitoringService(prisma as any);
    await expect(service.assertRepeatAllowed('rx-1')).rejects.toThrow(/Testosterone repeat on hold: Testosterone test overdue/);

    prisma.prescription.findFirst.mockResolvedValue(null); // not a testosterone prescription
    await expect(service.assertRepeatAllowed('rx-2')).resolves.toBeUndefined();
  });
});
