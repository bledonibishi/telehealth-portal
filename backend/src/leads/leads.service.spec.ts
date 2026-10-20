import { BadRequestException, ConflictException } from '@nestjs/common';
import { CURRENT_CONSENTS } from '../consents/consent-texts';
import { ConsentType } from '../common/enums';
import { findQuestionnaire } from '../questionnaires/definitions';
import { LeadsService } from './leads.service';
import { OrdersService } from '../prescriptions/orders.service';

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
  // The email proof is checked first; by default the visitor has it.
  const verification = { assertVerified: jest.fn().mockResolvedValue(undefined) };
  return { svc: new LeadsService(prisma as any, posthog as any, logger as any, referrals as any, verification as any), prisma, verification };
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

describe('LeadsService.upsert for a patient refunded on their first order', () => {
  const closed = { id: 'p-1', accessClosedAt: new Date(), accessClosedReason: 'REFUNDED_FIRST_ORDER' };
  const withOrders = (svc: any, offerReturn: jest.Mock) => { svc.moduleRef = { get: jest.fn((t) => (t === OrdersService ? { offerReturn } : null)) }; };

  it('tells them their prescription is still valid and the fee is not charged again', async () => {
    const { svc, prisma } = build({ patient: closed });
    const offerReturn = jest.fn().mockResolvedValue({ orderId: 'o-1', until: new Date('2030-01-10') });
    withOrders(svc, offerReturn);
    await expect(svc.upsert(input)).rejects.toThrow(/won’t pay the prescription fee again/);
    expect(offerReturn).toHaveBeenCalledWith('p-1');
    expect(prisma.lead.upsert).not.toHaveBeenCalled();
  });

  it('lets them start over once the prescription has run out', async () => {
    const { svc, prisma } = build({ patient: closed });
    withOrders(svc, jest.fn().mockResolvedValue(null));
    await svc.upsert(input);
    expect(prisma.lead.upsert).toHaveBeenCalled();
  });

  it('reopens the old paid lead so they can pay again, when there is no prescription to go back to', async () => {
    const { svc, prisma } = build({ patient: closed, lead: { id: 'l-1', convertedAt: new Date(), productKind: 'GLP1' } });
    withOrders(svc, jest.fn().mockResolvedValue(null));
    await svc.upsert(input);
    expect(prisma.lead.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ convertedAt: null }) }));
  });

  it('hands a refunded patient with a valid prescription their payment link, once the inbox is proved', async () => {
    const { svc, prisma } = build({ patient: closed });
    (prisma as any).voucher = { aggregate: jest.fn().mockResolvedValue({ _sum: { amountCents: 1000 } }) };
    (prisma as any).order = { findUnique: jest.fn().mockResolvedValue({ prescription: { items: [{ product: { name: 'Estradiol gel', brandName: 'Oestrogel' }, strength: { label: '0.75 mg per pump' } }] } }) };
    const offer = { orderId: 'o-1', until: new Date('2030-01-10'), payUrl: 'https://pay/in_1', amountCents: 2500, currency: 'eur' };
    withOrders(svc, jest.fn().mockResolvedValue(offer));
    expect(await svc.returnOffer({ email: 'a@b.com', emailVerificationToken: 't' } as any)).toEqual({ ...offer, treatment: 'Oestrogel 0.75 mg per pump', clientSecret: null, totalCents: null, unusedVoucherCents: 1000 });
  });

  it('has no offer for someone whose account is open, or was closed for another reason', async () => {
    const a = build({ patient: { id: 'p-2', accessClosedAt: null, accessClosedReason: null } });
    withOrders(a.svc, jest.fn());
    expect(await a.svc.returnOffer({ email: 'a@b.com', emailVerificationToken: 't' } as any)).toBeNull();
    const b = build({ patient: { id: 'p-3', accessClosedAt: new Date(), accessClosedReason: 'LAPSED' } });
    withOrders(b.svc, jest.fn());
    expect(await b.svc.returnOffer({ email: 'a@b.com', emailVerificationToken: 't' } as any)).toBeNull();
  });

  it('still sends any other account to sign in', async () => {
    const { svc } = build({ patient: { id: 'p-2', accessClosedAt: null, accessClosedReason: null } });
    await expect(svc.upsert(input)).rejects.toThrow(/already exists/);
  });
});

describe('LeadsService.upsert email proof', () => {
  it('saves nothing without the proof that the visitor can read the inbox, and says nothing about the address', async () => {
    const { svc, prisma, verification } = build({ patient: { id: 'p-1' } });
    verification.assertVerified.mockRejectedValue(new BadRequestException('Please verify your email address first.'));
    // Even for an email that has an account, the answer is the same: no "account exists" before the proof.
    await expect(svc.upsert(input)).rejects.toThrow(/verify your email/);
    expect(prisma.patient.findFirst).not.toHaveBeenCalled();
    expect(prisma.lead.upsert).not.toHaveBeenCalled();
  });

  it('checks the proof against the email and the token that came with the quiz', async () => {
    const { svc, verification } = build();
    await svc.upsert({ ...input, emailVerificationToken: 'tok' });
    expect(verification.assertVerified).toHaveBeenCalledWith('a@b.com', 'tok');
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

describe('LeadsService.previousAssessment / resumeLead', () => {
  const DAY = 86_400_000;
  const ask = { email: 'a@b.com', productKind: 'GLP1', emailVerificationToken: 'tok' } as any;
  const earlier = (over: object = {}) => ({
    id: 'lead-1',
    email: 'a@b.com',
    productKind: 'GLP1',
    convertedAt: null,
    updatedAt: new Date(Date.now() - 14 * DAY),
    intakeSavedAt: new Date(Date.now() - 14 * DAY),
    quizAnswers: [{ questionId: 'age', question: 'How old are you?', answer: '40 to 54' }],
    intakeAnswers: [{ questionId: 'weight_kg', answer: '95', value: '95' }],
    intakeConsentVersion: CURRENT_CONSENTS[ConsentType.TELEHEALTH].version,
    ...over,
  });
  // Answers the current questionnaire accepts, for the tests that need a lead that really can be kept.
  const validIntake = () => {
    const out: Array<{ questionId: string; answer: string; value: string }> = [];
    const chosen: Record<string, string[]> = {};
    for (const q of findQuestionnaire('GLP1' as any, 'INTAKE').questions) {
      if (q.showIf && !(chosen[q.showIf.questionId] ?? []).some((v) => q.showIf!.anyOf.includes(v))) continue;
      const v = q.type === 'single' ? (q.options!.find((o) => !o.flag) ?? q.options![0]).value : q.type === 'multi' ? (q.options!.find((o) => !o.flag && !o.exclusive) ?? q.options![0]).value : q.type === 'number' ? String(q.min ?? 0) : q.quickAnswer ?? 'None';
      chosen[q.id] = v.split('|');
      out.push({ questionId: q.id, answer: v, value: v });
    }
    return out;
  };
  const make = (lead: any, patient: any = null) => {
    const b = build({ patient });
    (b.prisma.lead as any).findFirst = jest.fn().mockResolvedValue(lead);
    return b;
  };

  it('returns the earlier answers, with the health questions worded, once the email is proved', async () => {
    const { svc, verification } = make(earlier({ intakeAnswers: validIntake() }));
    const result = await svc.previousAssessment(ask);
    expect(verification.assertVerified).toHaveBeenCalledWith('a@b.com', 'tok');
    expect(result).toMatchObject({ productKind: 'GLP1', canKeep: true, eligibility: [{ questionId: 'age', answer: '40 to 54' }] });
    expect(result!.health[0].questionId).toBe(validIntake()[0].questionId);
    expect(result!.health[0].question).not.toBe(result!.health[0].questionId);
  });

  it('gives nothing without the proof, for someone who has paid, for another treatment, or for a lead that never got to the health questions', async () => {
    const noProof = make(earlier());
    noProof.verification.assertVerified.mockRejectedValue(new BadRequestException('Please verify your email address first.'));
    await expect(noProof.svc.previousAssessment(ask)).rejects.toThrow(/verify your email/);

    await expect(make(earlier(), { id: 'p-1' }).svc.previousAssessment(ask)).rejects.toThrow(ConflictException);
    expect(await make(earlier({ productKind: 'HRT' })).svc.previousAssessment(ask)).toBeNull();
    expect(await make(earlier({ intakeSavedAt: null })).svc.previousAssessment(ask)).toBeNull();
    expect(await make(null).svc.previousAssessment(ask)).toBeNull();
  });

  it('shows old answers but will not let them be kept once the health answers are over 30 days old', async () => {
    const old = earlier({ intakeSavedAt: new Date(Date.now() - 31 * DAY) });
    const { svc } = make(old);
    expect(await svc.previousAssessment(ask)).toMatchObject({ canKeep: false, keepBlockedReason: expect.stringMatching(/30 days/) });
    await expect(svc.resumeLead(ask)).rejects.toThrow(/30 days/);
  });

  it('goes on with the earlier answers without changing them, and counts the visit as activity', async () => {
    const { svc, prisma } = make(earlier({ intakeAnswers: validIntake() }));
    await svc.resumeLead(ask);
    expect(prisma.lead.update).toHaveBeenCalledWith({ where: { id: 'lead-1' }, data: { updatedAt: expect.any(Date) } });
  });

  it('will not keep answers the questionnaire or the consent wording has moved on from, so the visitor is not asked again after paying', async () => {
    const consent = make(earlier({ intakeAnswers: validIntake(), intakeConsentVersion: 'old-consent' }));
    expect(await consent.svc.previousAssessment(ask)).toMatchObject({ canKeep: false, keepBlockedReason: expect.stringMatching(/consent statement has changed/) });
    await expect(consent.svc.resumeLead(ask)).rejects.toThrow(/consent statement has changed/);

    // The default test answers (a lone weight) no longer satisfy the current health questions.
    const questions = make(earlier());
    expect(await questions.svc.previousAssessment(ask)).toMatchObject({ canKeep: false, keepBlockedReason: expect.stringMatching(/health questions have changed/) });
    await expect(questions.svc.resumeLead(ask)).rejects.toThrow(/health questions have changed/);
  });

  it('cannot resume when there is nothing saved to go back to', async () => {
    await expect(make(null).svc.resumeLead(ask)).rejects.toThrow(/couldn’t find your earlier answers/);
  });
});
