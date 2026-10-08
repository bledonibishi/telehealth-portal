import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CURRENT_CONSENTS } from '../consents/consent-texts';
import { LeadsService } from './leads.service';

function build(over: { patient?: any; lead?: any } = {}) {
  const prisma = {
    patient: { findFirst: jest.fn().mockResolvedValue(over.patient ?? null) },
    lead: {
      findUnique: jest.fn().mockResolvedValue(over.lead ?? null),
      upsert: jest.fn().mockResolvedValue({ id: 'lead-1', email: 'a@b.com' }),
      update: jest.fn().mockResolvedValue({}),
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

describe('LeadsService.saveIntake', () => {
  const lead = { id: 'lead-1', email: 'a@b.com', productKind: 'GLP1', convertedAt: null };
  const consent = CURRENT_CONSENTS.TELEHEALTH.version;
  const answers = Object.entries({
    height_cm: '170', weight_kg: '95', bp_known: 'yes', bp_systolic: '120', bp_diastolic: '80', smoking: 'never',
    current_medications: 'None', allergies: 'None', glp1_prior_use: 'no',
    diabetes_medicines: 'none', eating_disorder: 'no', gallbladder: 'no', kidney_disease: 'no', bariatric_surgery: 'no',
  }).map(([questionId, v]) => ({ questionId, answer: v, value: v }));
  const input = { leadId: 'lead-1', email: 'A@b.com', answers, telehealthConsentVersion: consent } as any;

  it('keeps the answers and the consent on the lead', async () => {
    const { svc, prisma } = build({ lead });
    await svc.saveIntake(input, { ip: '1.2.3.4', userAgent: 'UA' });
    expect(prisma.lead.update).toHaveBeenCalledWith({
      where: { id: 'lead-1' },
      data: expect.objectContaining({ intakeConsentVersion: consent, intakeConsentIp: '1.2.3.4', intakeConsentUserAgent: 'UA', intakeSavedAt: expect.any(Date) }),
    });
  });

  it('gives the same answer for an unknown lead and a wrong email', async () => {
    await expect(build({ lead }).svc.saveIntake({ ...input, email: 'other@b.com' })).rejects.toThrow(NotFoundException);
    await expect(build().svc.saveIntake(input)).rejects.toThrow(NotFoundException);
  });

  it('refuses a lead that has already paid', async () => {
    const { svc, prisma } = build({ lead: { ...lead, convertedAt: new Date() } });
    await expect(svc.saveIntake(input)).rejects.toThrow(ConflictException);
    expect(prisma.lead.update).not.toHaveBeenCalled();
  });

  it('refuses incomplete answers and an out-of-date consent', async () => {
    const { svc, prisma } = build({ lead });
    await expect(svc.saveIntake({ ...input, answers: answers.slice(1) })).rejects.toThrow(BadRequestException);
    await expect(svc.saveIntake({ ...input, telehealthConsentVersion: 'old' })).rejects.toThrow(/consent/);
    expect(prisma.lead.update).not.toHaveBeenCalled();
  });
});
