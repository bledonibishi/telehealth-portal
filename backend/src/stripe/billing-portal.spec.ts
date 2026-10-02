import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingPortalResolver } from './billing-portal.resolver';

const config = { get: jest.fn((key: string) => (key === 'STRIPE_SECRET_KEY' ? 'sk_test_dummy' : undefined)) };
const PATIENT = { id: 'p-1', email: 'p@example.com', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' };

function buildBilling(stripe: any) {
  const billing = new BillingService(config as any);
  (billing as any).stripe = stripe;
  return billing;
}

describe('BillingService.createPortalSession', () => {
  it('opens a portal session for the patient’s own Stripe customer and returns to the app', async () => {
    const stripe = { billingPortal: { sessions: { create: jest.fn().mockResolvedValue({ url: 'https://billing.stripe.com/s/abc' }) } } };
    const url = await buildBilling(stripe).createPortalSession(PATIENT, 'http://localhost:3000/dashboard');
    expect(url).toBe('https://billing.stripe.com/s/abc');
    expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith({ customer: 'cus_1', return_url: 'http://localhost:3000/dashboard' });
  });

  it('finds the customer by email for a patient who paid before ids were recorded', async () => {
    const stripe = {
      customers: { list: jest.fn().mockResolvedValue({ data: [{ id: 'cus_by_email' }] }) },
      billingPortal: { sessions: { create: jest.fn().mockResolvedValue({ url: 'https://billing.stripe.com/s/x' }) } },
    };
    await buildBilling(stripe).createPortalSession({ ...PATIENT, stripeCustomerId: null }, 'http://x/dashboard');
    expect(stripe.customers.list).toHaveBeenCalledWith({ email: 'p@example.com', limit: 1 });
    expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith(expect.objectContaining({ customer: 'cus_by_email' }));
  });

  it('says so when the patient has no Stripe customer', async () => {
    const stripe = { customers: { list: jest.fn().mockResolvedValue({ data: [] }) }, billingPortal: { sessions: { create: jest.fn() } } };
    await expect(buildBilling(stripe).createPortalSession({ ...PATIENT, stripeCustomerId: null }, 'http://x')).rejects.toThrow(NotFoundException);
    expect(stripe.billingPortal.sessions.create).not.toHaveBeenCalled();
  });

  it('gives the patient a plain message, not Stripe’s, when the portal is not set up', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const stripe = { billingPortal: { sessions: { create: jest.fn().mockRejectedValue(new Error('No configuration provided and your test mode default configuration has not been created')) } } };
    const err = await buildBilling(stripe).createPortalSession(PATIENT, 'http://x').catch((e) => e);
    expect(err).toBeInstanceOf(ServiceUnavailableException);
    expect(err.message).not.toContain('configuration');
  });

  it('is unavailable when Stripe is not configured', async () => {
    const billing = buildBilling({});
    (billing as any).configured = false;
    await expect(billing.createPortalSession(PATIENT, 'http://x')).rejects.toThrow(ServiceUnavailableException);
  });
});

describe('BillingPortalResolver', () => {
  it('uses the signed-in patient’s record (never an id from the request), returns to the dashboard and audits', async () => {
    const prisma = { patient: { findUniqueOrThrow: jest.fn().mockResolvedValue(PATIENT) } };
    const billing = { createPortalSession: jest.fn().mockResolvedValue('https://billing.stripe.com/s/abc') };
    const audit = { log: jest.fn() };
    const cfg = { get: jest.fn((k: string) => (k === 'PATIENT_APP_URL' ? 'https://app.example.com' : undefined)) };
    const resolver = new BillingPortalResolver(billing as any, prisma as any, audit as any, cfg as any);

    const result = await resolver.createBillingPortalSession({ id: 'p-1', email: 'p@example.com', role: 'PATIENT' });

    expect(prisma.patient.findUniqueOrThrow).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'p-1' } }));
    expect(billing.createPortalSession).toHaveBeenCalledWith(PATIENT, 'https://app.example.com/dashboard');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'BILLING_PORTAL_OPENED', actorId: 'p-1', resourceType: 'Patient', resourceId: 'p-1' }));
    expect(result).toEqual({ url: 'https://billing.stripe.com/s/abc' });
  });
});
