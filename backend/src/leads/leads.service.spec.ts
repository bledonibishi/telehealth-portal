import { BadRequestException, ConflictException } from '@nestjs/common';
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

describe('LeadsService.upsert with the health answers', () => {
  const consent = CURRENT_CONSENTS.TELEHEALTH.version;
  const answers = Object.entries({
    height_cm: '170', weight_kg: '95', bp_known: 'yes', bp_systolic: '120', bp_diastolic: '80', smoking: 'never',
    current_medications: 'None', allergies: 'None', glp1_prior_use: 'no',
    diabetes_medicines: 'none', eating_disorder: 'no', gallbladder: 'no', kidney_disease: 'no', bariatric_surgery: 'no',
  }).map(([questionId, v]) => ({ questionId, answer: v, value: v }));
  const withIntake = { ...input, intakeAnswers: answers, telehealthConsentVersion: consent } as any;

  it('keeps the health answers and the consent on the lead, in the same save as the quiz', async () => {
    const { svc, prisma } = build();
    await svc.upsert(withIntake, { ip: '1.2.3.4', userAgent: 'UA' });
    const { create, update } = prisma.lead.upsert.mock.calls[0][0];
    for (const data of [create, update]) {
      expect(data).toMatchObject({ intakeConsentVersion: consent, intakeConsentIp: '1.2.3.4', intakeConsentUserAgent: 'UA', intakeSavedAt: expect.any(Date) });
      expect(data.intakeAnswers).toHaveLength(answers.length);
    }
  });

  it('refuses incomplete health answers, and an out-of-date consent, before saving anything', async () => {
    const { svc, prisma } = build();
    await expect(svc.upsert({ ...withIntake, intakeAnswers: answers.slice(1) })).rejects.toThrow(BadRequestException);
    await expect(svc.upsert({ ...withIntake, telehealthConsentVersion: 'old' })).rejects.toThrow(/consent/);
    expect(prisma.lead.upsert).not.toHaveBeenCalled();
  });

  it('saves a quiz that came without health answers as before', async () => {
    const { svc, prisma } = build();
    await svc.upsert(input);
    const { create } = prisma.lead.upsert.mock.calls[0][0];
    expect(create).not.toHaveProperty('intakeAnswers');
  });

  it('drops another treatment’s earlier health answers when the quiz comes without new ones', async () => {
    const { svc, prisma } = build({ lead: { id: 'l-1', convertedAt: null, productKind: 'HRT' } });
    await svc.upsert(input); // input is GLP1
    expect(prisma.lead.upsert.mock.calls[0][0].update).toHaveProperty('intakeSavedAt', null);
  });

  it('still refuses an email that already has an account', async () => {
    const { svc } = build({ patient: { id: 'p-1' } });
    await expect(svc.upsert(withIntake)).rejects.toThrow(ConflictException);
  });
});
