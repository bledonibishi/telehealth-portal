import { SupportAction, SupportActionsService } from './support-actions.service';

const support = { id: 'cx-1', email: 'cx@x.com', role: 'CLINICIAN', clinicianRole: 'CX_TEAM' } as any;
const patient = { id: 'p-1', email: 'pat@x.com', firstName: 'Pat', activatedAt: null as Date | null, stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' };

function setup(over: Partial<typeof patient> = {}) {
  const prisma: any = {
    patient: { findUnique: jest.fn().mockResolvedValue({ ...patient, ...over }) },
    auditLogEntry: { findFirst: jest.fn().mockResolvedValue(null) },
    ticketNote: { create: jest.fn().mockResolvedValue({}) },
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const auth = { requestActivationLink: jest.fn().mockResolvedValue(true), requestPasswordReset: jest.fn().mockResolvedValue(true) };
  const billing = { retryUnpaidInvoice: jest.fn().mockResolvedValue({ ok: true, note: 'The payment went through' }) };
  return { service: new SupportActionsService(prisma, audit as any, auth as any, billing as any), prisma, audit, auth, billing };
}

const base = { patientId: 'p-1', reason: 'Patient called, never got the email' };

describe('SupportActionsService.perform', () => {
  it('needs a reason', async () => {
    const { service, auth } = setup();
    await expect(service.perform(support, { ...base, action: SupportAction.RESEND_ACTIVATION_LINK, reason: ' no ' })).rejects.toThrow(/why/i);
    expect(auth.requestActivationLink).not.toHaveBeenCalled();
  });

  it('resends the activation link to a patient who has not activated, and audits it with the reason', async () => {
    const { service, auth, audit } = setup();
    const result = await service.perform(support, { ...base, action: SupportAction.RESEND_ACTIVATION_LINK });
    expect(result.ok).toBe(true);
    expect(auth.requestActivationLink).toHaveBeenCalledWith('pat@x.com');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'SUPPORT_RESEND_ACTIVATION_LINK', actorId: 'cx-1', patientId: 'p-1', metadata: expect.objectContaining({ reason: base.reason, ok: true }) }));
  });

  it('does not resend an activation link to an account that is already active', async () => {
    const { service, auth } = setup({ activatedAt: new Date() });
    const result = await service.perform(support, { ...base, action: SupportAction.RESEND_ACTIVATION_LINK });
    expect(result.ok).toBe(false);
    expect(auth.requestActivationLink).not.toHaveBeenCalled();
  });

  it('sends a password reset only to an activated account', async () => {
    const inactive = setup();
    expect((await inactive.service.perform(support, { ...base, action: SupportAction.SEND_PASSWORD_RESET })).ok).toBe(false);
    expect(inactive.auth.requestPasswordReset).not.toHaveBeenCalled();

    const active = setup({ activatedAt: new Date() });
    expect((await active.service.perform(support, { ...base, action: SupportAction.SEND_PASSWORD_RESET })).ok).toBe(true);
    expect(active.auth.requestPasswordReset).toHaveBeenCalledWith('pat@x.com', 'patient');
  });

  it('retries the payment through billing and reports a decline as not ok', async () => {
    const { service, billing, audit } = setup();
    billing.retryUnpaidInvoice.mockResolvedValue({ ok: false, note: 'The card was declined' });
    const result = await service.perform(support, { ...base, action: SupportAction.RETRY_FAILED_PAYMENT });
    expect(result).toEqual({ ok: false, message: 'The card was declined' });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ ok: false }) }));
  });

  it('refuses to repeat the same action on the same patient within the cooldown', async () => {
    const { service, prisma, auth } = setup();
    prisma.auditLogEntry.findFirst.mockResolvedValue({ id: 'a-1' });
    await expect(service.perform(support, { ...base, action: SupportAction.RESEND_ACTIVATION_LINK })).rejects.toThrow(/already done/i);
    expect(auth.requestActivationLink).not.toHaveBeenCalled();
  });

  it('leaves a note on the ticket it was done for', async () => {
    const { service, prisma } = setup();
    await service.perform(support, { ...base, action: SupportAction.RESEND_ACTIVATION_LINK, ticketId: 't-1' });
    expect(prisma.ticketNote.create.mock.calls[0][0].data).toMatchObject({ ticketId: 't-1', authorId: 'cx-1' });
  });

  it('refuses an unknown patient', async () => {
    const { service, prisma } = setup();
    prisma.patient.findUnique.mockResolvedValue(null);
    await expect(service.perform(support, { ...base, action: SupportAction.RESEND_ACTIVATION_LINK })).rejects.toThrow(/exist/i);
  });
});

describe('SupportActionsService.context', () => {
  const entry = (action: string, minutesAgo: number, meta: any = { ok: true, outcome: 'Done', reason: 'Patient called' }) => ({ id: `a-${action}-${minutesAgo}`, action: `SUPPORT_${action}`, actorId: 'cx-1', metadata: meta, timestamp: new Date(Date.now() - minutesAgo * 60_000) });
  function ctxSetup(over: Partial<typeof patient> = {}, entries: any[] = []) {
    const s = setup(over);
    s.prisma.auditLogEntry.findMany = jest.fn().mockResolvedValue(entries);
    s.prisma.patient.findUnique.mockResolvedValue({ ...patient, lastName: 'Lee', stripeCustomerId: null, stripeSubscriptionId: null, ...over });
    s.prisma.clinician = { findMany: jest.fn().mockResolvedValue([{ id: 'cx-1', firstName: 'Clara', lastName: 'Watson' }]) };
    return s;
  }
  const stateOf = (c: any, a: string) => c.actions.find((x: any) => x.action === a);

  it('offers the activation link, not the reset, to a patient who has not set up their account', async () => {
    const c = await ctxSetup().service.context('p-1');
    expect(stateOf(c, 'RESEND_ACTIVATION_LINK').available).toBe(true);
    expect(stateOf(c, 'SEND_PASSWORD_RESET').available).toBe(false);
    expect(stateOf(c, 'SEND_PASSWORD_RESET').unavailableReason).toMatch(/activation link/i);
  });

  it('offers the reset, not the activation link, to an activated patient', async () => {
    const c = await ctxSetup({ activatedAt: new Date() }).service.context('p-1');
    expect(stateOf(c, 'RESEND_ACTIVATION_LINK').available).toBe(false);
    expect(stateOf(c, 'SEND_PASSWORD_RESET').available).toBe(true);
  });

  it('only offers the payment retry when there is a payment profile', async () => {
    expect(stateOf(await ctxSetup().service.context('p-1'), 'RETRY_FAILED_PAYMENT').available).toBe(false);
    expect(stateOf(await ctxSetup({ stripeCustomerId: 'cus_1' }).service.context('p-1'), 'RETRY_FAILED_PAYMENT').available).toBe(true);
  });

  it('blocks an action done a few minutes ago, naming who did it, and shows the history', async () => {
    const c = await ctxSetup({}, [entry('RESEND_ACTIVATION_LINK', 3)]).service.context('p-1');
    const s = stateOf(c, 'RESEND_ACTIVATION_LINK');
    expect(s.available).toBe(false);
    expect(s.unavailableReason).toMatch(/Clara Watson/);
    expect(s.cooldownUntil).toBeInstanceOf(Date);
    expect(c.history[0]).toMatchObject({ action: 'RESEND_ACTIVATION_LINK', byName: 'Clara Watson', ok: true, reason: 'Patient called' });
  });

  it('allows it again once the cooldown has passed', async () => {
    const c = await ctxSetup({}, [entry('RESEND_ACTIVATION_LINK', 45)]).service.context('p-1');
    expect(stateOf(c, 'RESEND_ACTIVATION_LINK').available).toBe(true);
  });
});
