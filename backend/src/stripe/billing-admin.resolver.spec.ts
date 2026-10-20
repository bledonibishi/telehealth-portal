import { BillingAdminResolver } from './billing-admin.resolver';

const PATIENT = { id: 'p-1', email: 'p@example.com', firstName: 'Emma', lastName: 'White', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1', paysPerSupply: false };

function build(over: { patient?: any; subscription?: any; invoices?: any[] | Error } = {}) {
  const prisma: any = {
    patient: { findUnique: jest.fn().mockResolvedValue('patient' in over ? over.patient : PATIENT), findMany: jest.fn().mockResolvedValue([]) },
    order: { findMany: jest.fn().mockResolvedValue([]) },
    refundRequest: { findMany: jest.fn().mockResolvedValue([]) },
    prescription: { findFirst: jest.fn().mockResolvedValue(null) },
    clinician: { findMany: jest.fn().mockResolvedValue([{ id: 'a-1', firstName: 'Dr', lastName: 'Admin' }]) },
  };
  const billing: any = {
    subscriptionState: jest.fn().mockResolvedValue('subscription' in over ? over.subscription : { status: 'active', endsAtPeriodEnd: false, endsAt: null }),
    previewRefund: jest.fn().mockResolvedValue({ amountCents: 9500, feeKeptCents: 4000, currency: 'eur' }),
    listInvoices: over.invoices instanceof Error ? jest.fn().mockRejectedValue(over.invoices) : jest.fn().mockResolvedValue(over.invoices ?? []),
  };
  return { resolver: new BillingAdminResolver(prisma, billing), prisma, billing };
}

describe('BillingAdminResolver', () => {
  it('says a patient on a running subscription pays by subscription', async () => {
    const { resolver } = build();
    expect((await resolver.billingOverview('p-1')).plan).toBe('SUBSCRIPTION');
  });

  it('says a patient who pays per supply pays once for each, whatever Stripe holds', async () => {
    const { resolver } = build({ patient: { ...PATIENT, paysPerSupply: true }, subscription: null });
    expect((await resolver.billingOverview('p-1')).plan).toBe('ONE_TIME');
  });

  it('does not fail when Stripe cannot list the payments: it says the list may be incomplete', async () => {
    const { resolver } = build({ invoices: new Error('Stripe is down') });
    expect(await resolver.billingOverview('p-1')).toMatchObject({ invoices: [], invoicesAvailable: false });
  });

  it('refuses an unknown patient', async () => {
    const { resolver } = build({ patient: null });
    await expect(resolver.billingOverview('nope')).rejects.toThrow(/Patient not found/);
  });

  it('names the admin who decided a refund request', async () => {
    const { resolver, prisma } = build();
    prisma.refundRequest.findMany.mockResolvedValue([{ id: 'r-1', status: 'APPROVED', requestedAt: new Date(), decidedAt: new Date(), outcome: 'Refunded', decidedById: 'a-1', patient: { firstName: 'Emma', lastName: 'White', email: 'p@example.com' } }]);
    const [row] = await resolver.refundDecisions(50);
    expect(row).toMatchObject({ patientName: 'Emma White', decidedByName: 'Dr Admin', status: 'APPROVED' });
  });

  it('lists the unpaid supplies with the amount and the link', async () => {
    const { resolver, prisma } = build();
    prisma.order.findMany.mockResolvedValue([{ id: 'cmv-abc12345', sequence: 3, createdAt: new Date(), paymentUrl: 'https://pay/x', paymentAmountCents: 12900, paymentCurrency: 'eur', paymentReminderAt: null, patient: { id: 'p-1', firstName: 'Emma', lastName: 'White', email: 'p@example.com' }, prescription: { medication: 'Wegovy', dosage: '0.25 mg' } }]);
    const [row] = await resolver.awaitingPayment();
    expect(row).toMatchObject({ patientName: 'Emma White', medication: 'Wegovy', paymentAmountCents: 12900, paymentUrl: 'https://pay/x', sequence: 3 });
    expect(prisma.order.findMany.mock.calls[0][0].where).toEqual({ status: 'AWAITING_PAYMENT' });
  });

  it('shows what a refund would return, working it out from the latest prescription', async () => {
    const { resolver, prisma, billing } = build();
    const issuedAt = new Date('2026-10-20T10:00:00Z');
    prisma.prescription.findFirst.mockResolvedValue({ issuedAt });
    const overview = await resolver.billingOverview('p-1');
    expect(billing.previewRefund).toHaveBeenCalledWith(expect.anything(), { prescriptionIssuedAt: issuedAt });
    expect(overview.refundPreview).toEqual({ amountCents: 9500, feeKeptCents: 4000, currency: 'eur' });
  });
});
