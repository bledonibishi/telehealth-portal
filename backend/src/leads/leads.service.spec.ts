import { ConflictException } from '@nestjs/common';
import { LeadsService } from './leads.service';

function build(over: { patient?: any; lead?: any } = {}) {
  const prisma = {
    patient: { findFirst: jest.fn().mockResolvedValue(over.patient ?? null) },
    lead: {
      findUnique: jest.fn().mockResolvedValue(over.lead ?? null),
      upsert: jest.fn().mockResolvedValue({ id: 'lead-1', email: 'a@b.com' }),
    },
  };
  const posthog = { identify: jest.fn(), capture: jest.fn() };
  const logger = { info: jest.fn() };
  const referrals = { validateAndAttach: jest.fn() };
  return { svc: new LeadsService(prisma as any, posthog as any, logger as any, referrals as any), prisma };
}

const input = { email: 'a@b.com', firstName: 'A', lastName: 'B', productKind: 'GLP1', quizAnswers: [] } as any;

describe('LeadsService.upsert', () => {
  it('rejects an email that already has a patient account', async () => {
    const { svc, prisma } = build({ patient: { id: 'p-1' } });
    await expect(svc.upsert(input)).rejects.toThrow(ConflictException);
    expect(prisma.lead.upsert).not.toHaveBeenCalled();
  });

  it('rejects an email whose lead has already paid', async () => {
    const { svc, prisma } = build({ lead: { id: 'l-1', convertedAt: new Date() } });
    await expect(svc.upsert(input)).rejects.toThrow(/already exists/);
    expect(prisma.lead.upsert).not.toHaveBeenCalled();
  });

  it('still saves a new or unpaid lead', async () => {
    const { svc, prisma } = build({ lead: { id: 'l-1', convertedAt: null } });
    await svc.upsert(input);
    expect(prisma.lead.upsert).toHaveBeenCalled();
  });
});
