import { ForbiddenException } from '@nestjs/common';
import { ReferralsService } from './referrals.service';

// The real Stripe SDK throws at construction time with no apiKey at all, so
// give it a placeholder here — every test below replaces `stripe` with a spy
// anyway before making any calls, matching the constructor's own real-world
// assumption that STRIPE_SECRET_KEY is always set once deployed.
const config = { get: jest.fn((key: string, def?: any) => (key === 'STRIPE_SECRET_KEY' ? 'sk_test_dummy' : def)) };
const email = { sendReferralRewardEmail: jest.fn() };
const posthog = { capture: jest.fn() };
const posthogLogger = { info: jest.fn() };

function newService(prisma: any) {
  const service = new ReferralsService(prisma, config as any, email as any, posthog as any, posthogLogger as any);
  // Stripe itself is real (constructed with no key), but no test here should
  // hit the network — replace it with a spy so a missed mock fails loudly.
  (service as any).stripe = { customers: { createBalanceTransaction: jest.fn().mockResolvedValue({}) } };
  return service;
}

beforeEach(() => jest.clearAllMocks());

describe('ReferralsService.codeFor', () => {
  it('returns the existing code without writing, when one is already set', async () => {
    const prisma = { patient: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referralCode: 'ABC123' }), update: jest.fn() } };
    const code = await newService(prisma).codeFor('p-1');
    expect(code).toBe('ABC123');
    expect(prisma.patient.update).not.toHaveBeenCalled();
  });

  it('generates and persists a new code when the patient has none', async () => {
    const prisma = {
      patient: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referralCode: null }), update: jest.fn().mockResolvedValue({}) },
    };
    const code = await newService(prisma).codeFor('p-1');
    expect(code).toMatch(/^[0-9A-F]{10}$/);
    expect(prisma.patient.update).toHaveBeenCalledWith({ where: { id: 'p-1' }, data: { referralCode: code } });
  });
});

describe('ReferralsService.validateAndAttach', () => {
  it('no-ops when no code was given', async () => {
    const prisma = { patient: { findUnique: jest.fn() } };
    await newService(prisma).validateAndAttach(undefined, { id: 'lead-1', email: 'friend@x.com' });
    expect(prisma.patient.findUnique).not.toHaveBeenCalled();
  });

  it('no-ops on an unknown code', async () => {
    const prisma = { referral: { findUnique: jest.fn().mockResolvedValue(null) }, patient: { findUnique: jest.fn().mockResolvedValue(null) }, $transaction: jest.fn() };
    await newService(prisma).validateAndAttach('NOPE', { id: 'lead-1', email: 'friend@x.com' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('no-ops on a self-referral (same email, case-insensitive)', async () => {
    const prisma = {
      referral: { findUnique: jest.fn().mockResolvedValue(null) },
      patient: { findUnique: jest.fn().mockResolvedValue({ id: 'p-1', email: 'Friend@X.com' }) },
      $transaction: jest.fn(),
    };
    await newService(prisma).validateAndAttach('ABC123', { id: 'lead-1', email: 'friend@x.com' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('keeps the first attribution when the lead already has a referral', async () => {
    const prisma = { referral: { findUnique: jest.fn().mockResolvedValue({ id: 'r-1' }) }, patient: { findUnique: jest.fn() }, $transaction: jest.fn() };
    await newService(prisma).validateAndAttach('ABC123', { id: 'lead-1', email: 'friend@x.com' });
    expect(prisma.patient.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('attaches the code to the lead and creates a PENDING referral for a valid code', async () => {
    const leadUpdate = jest.fn().mockResolvedValue({});
    const referralCreate = jest.fn().mockResolvedValue({});
    const prisma = {
      referral: { findUnique: jest.fn().mockResolvedValue(null), create: referralCreate },
      patient: { findUnique: jest.fn().mockResolvedValue({ id: 'referrer-1', email: 'advocate@x.com' }) },
      lead: { update: leadUpdate },
      $transaction: jest.fn(async (ops: any[]) => Promise.all(ops)),
    };
    await newService(prisma).validateAndAttach('ABC123', { id: 'lead-1', email: 'friend@x.com' });

    expect(leadUpdate).toHaveBeenCalledWith({ where: { id: 'lead-1' }, data: { referralCode: 'ABC123' } });
    expect(referralCreate).toHaveBeenCalledWith({ data: { code: 'ABC123', referrerId: 'referrer-1', referredLeadId: 'lead-1' } });
    expect(posthog.capture).toHaveBeenCalledWith('referrer-1', 'referral_lead_attributed', { referred_lead_id: 'lead-1' });
  });
});

describe('ReferralsService.handleConversion', () => {
  const lead = { id: 'lead-1' };
  const patient = { id: 'patient-1', email: 'friend@x.com', firstName: 'Friend' };

  it('no-ops when there is no referral for this lead', async () => {
    const prisma = { referral: { findUnique: jest.fn().mockResolvedValue(null) }, voucher: { create: jest.fn() } };
    await newService(prisma).handleConversion(lead, patient);
    expect(prisma.voucher.create).not.toHaveBeenCalled();
  });

  it('no-ops when the referral has already converted', async () => {
    const prisma = {
      referral: { findUnique: jest.fn().mockResolvedValue({ id: 'r-1', status: 'CONVERTED' }) },
      voucher: { create: jest.fn() },
    };
    await newService(prisma).handleConversion(lead, patient);
    expect(prisma.voucher.create).not.toHaveBeenCalled();
  });

  it('auto-applies the referrer reward when their preference is on (default)', async () => {
    const voucherCreate = jest
      .fn()
      .mockResolvedValueOnce({ id: 'voucher-referee' })
      .mockResolvedValueOnce({ id: 'voucher-referrer' });
    const referrer = { id: 'referrer-1', email: 'advocate@x.com', firstName: 'Advocate', voucherAutoApply: true, stripeCustomerId: 'cus_1' };
    const voucherFindUniqueOrThrow = jest.fn().mockResolvedValue({ id: 'voucher-referrer', patientId: 'referrer-1', status: 'ISSUED', amountCents: 2000, currency: 'gbp' });
    const prisma = {
      referral: { findUnique: jest.fn().mockResolvedValue({ id: 'r-1', status: 'PENDING', referrerId: 'referrer-1' }), update: jest.fn().mockResolvedValue({}) },
      voucher: { create: voucherCreate, findUniqueOrThrow: voucherFindUniqueOrThrow, update: jest.fn().mockResolvedValue({}) },
      patient: { findUniqueOrThrow: jest.fn().mockResolvedValue(referrer) },
    };
    const service = newService(prisma);
    await service.handleConversion(lead, patient);

    expect(prisma.referral.update).toHaveBeenCalledWith({
      where: { id: 'r-1' },
      data: { status: 'CONVERTED', convertedAt: expect.any(Date), referredPatientId: 'patient-1' },
    });
    expect((service as any).stripe.customers.createBalanceTransaction).toHaveBeenCalledWith('cus_1', {
      amount: -2000,
      currency: 'gbp',
      description: expect.stringContaining('voucher-referrer'),
    });
    expect(email.sendReferralRewardEmail).toHaveBeenCalledWith('advocate@x.com', 'Advocate', '£20.00', true, expect.stringMatching(/\/rewards$/));
  });

  it('leaves the referrer reward unapplied when their preference is off', async () => {
    const voucherCreate = jest
      .fn()
      .mockResolvedValueOnce({ id: 'voucher-referee' })
      .mockResolvedValueOnce({ id: 'voucher-referrer' });
    const referrer = { id: 'referrer-1', email: 'advocate@x.com', firstName: 'Advocate', voucherAutoApply: false, stripeCustomerId: 'cus_1' };
    const prisma = {
      referral: { findUnique: jest.fn().mockResolvedValue({ id: 'r-1', status: 'PENDING', referrerId: 'referrer-1' }), update: jest.fn().mockResolvedValue({}) },
      voucher: { create: voucherCreate, findUniqueOrThrow: jest.fn(), update: jest.fn() },
      patient: { findUniqueOrThrow: jest.fn().mockResolvedValue(referrer) },
    };
    const service = newService(prisma);
    await service.handleConversion(lead, patient);

    expect((service as any).stripe.customers.createBalanceTransaction).not.toHaveBeenCalled();
    expect(email.sendReferralRewardEmail).toHaveBeenCalledWith('advocate@x.com', 'Advocate', '£20.00', false, expect.stringMatching(/\/rewards$/));
  });
});

describe('ReferralsService.applyVoucher', () => {
  it('rejects a voucher that does not belong to the caller', async () => {
    const prisma = { voucher: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'v-1', patientId: 'someone-else' }) } };
    await expect(newService(prisma).applyVoucher('v-1', 'patient-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('is a no-op if the voucher is already applied', async () => {
    const prisma = { voucher: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'v-1', patientId: 'patient-1', status: 'APPLIED' }) } };
    const service = newService(prisma);
    await service.applyVoucher('v-1', 'patient-1');
    expect((service as any).stripe.customers.createBalanceTransaction).not.toHaveBeenCalled();
  });

  it('credits the Stripe balance and marks the voucher applied', async () => {
    const prisma = {
      voucher: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'v-1', patientId: 'patient-1', status: 'ISSUED', amountCents: 2000, currency: 'gbp' }),
        update: jest.fn().mockResolvedValue({ id: 'v-1', status: 'APPLIED' }),
      },
      patient: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'patient-1', stripeCustomerId: 'cus_1' }) },
    };
    const service = newService(prisma);
    await service.applyVoucher('v-1', 'patient-1');

    expect((service as any).stripe.customers.createBalanceTransaction).toHaveBeenCalledWith('cus_1', {
      amount: -2000,
      currency: 'gbp',
      description: expect.stringContaining('v-1'),
    });
    expect(prisma.voucher.update).toHaveBeenCalledWith({
      where: { id: 'v-1' },
      data: { status: 'APPLIED', appliedAt: expect.any(Date), note: 'Credited to your account balance' },
    });
  });
});
