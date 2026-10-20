import { LapsedPatientsService, CLOSE_AFTER_DAYS } from './lapsed-patients.service';

const DAY = 86_400_000;
const now = new Date('2027-03-01T09:00:00Z');
const ago = (days: number) => new Date(now.getTime() - days * DAY);

function build(patients: any[]) {
  const prisma: any = { patient: { findMany: jest.fn().mockResolvedValue(patients), updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
  const audit = { log: jest.fn() };
  const email = { sendLapsedEmail: jest.fn().mockResolvedValue(undefined), sendLapsedClosedEmail: jest.fn().mockResolvedValue(undefined) };
  const service = new LapsedPatientsService(prisma, audit as any, email as any, { get: jest.fn() } as any);
  return { service, prisma, audit, email };
}
const p = (over: Record<string, unknown>) => ({ id: 'p-1', email: 'a@x', firstName: 'Arta', subscriptionEndedAt: ago(31), lapsedEmailsSent: 0, lapsedEmailAt: null, ...over });

describe('LapsedPatientsService', () => {
  it('sends the first email a month after the subscription ended, claiming it first', async () => {
    const { service, prisma, email } = build([p({})]);
    const r = await service.sweep(now);
    expect(r.emailed).toBe(1);
    expect(prisma.patient.updateMany).toHaveBeenCalledWith({ where: expect.objectContaining({ id: 'p-1', lapsedEmailsSent: 0 }), data: { lapsedEmailsSent: 1, lapsedEmailAt: now } });
    expect(email.sendLapsedEmail).toHaveBeenCalledWith('a@x', 'Arta', expect.objectContaining({ month: 1, of: 6 }));
  });

  it('waits for the next month before the next email', async () => {
    const { service, email } = build([p({ subscriptionEndedAt: ago(45), lapsedEmailsSent: 1, lapsedEmailAt: ago(14) })]);
    await service.sweep(now);
    expect(email.sendLapsedEmail).not.toHaveBeenCalled();
  });

  it('does not send a run of emails to someone who lapsed long ago', async () => {
    const { service, email } = build([p({ subscriptionEndedAt: ago(400), lapsedEmailsSent: 1, lapsedEmailAt: ago(2) })]);
    await service.sweep(now);
    expect(email.sendLapsedEmail).not.toHaveBeenCalled();
  });

  it('hands the claim back when the email fails', async () => {
    const { service, prisma, email } = build([p({})]);
    email.sendLapsedEmail.mockRejectedValue(new Error('down'));
    prisma.patient.findMany.mockResolvedValueOnce([p({})]).mockResolvedValueOnce([]);
    expect((await service.sweep(now)).emailed).toBe(0);
    expect(prisma.patient.updateMany).toHaveBeenLastCalledWith({ where: { id: 'p-1', lapsedEmailsSent: 1 }, data: { lapsedEmailsSent: 0, lapsedEmailAt: null } });
  });

  it('closes sign-in after the sixth email and a month, keeps the records, and says so', async () => {
    const { service, prisma, audit, email } = build([p({ subscriptionEndedAt: ago(CLOSE_AFTER_DAYS + 1), lapsedEmailsSent: 6, lapsedEmailAt: ago(30) })]);
    prisma.patient.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([p({})]);
    const r = await service.sweep(now);
    expect(r.closed).toBe(1);
    expect(prisma.patient.updateMany).toHaveBeenCalledWith({ where: expect.objectContaining({ id: 'p-1' }), data: { accessClosedAt: now, accessClosedReason: 'LAPSED', tokenVersion: { increment: 1 } } });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'ACCESS_CLOSED' }));
    expect(email.sendLapsedClosedEmail).toHaveBeenCalledWith('a@x', 'Arta');
  });
});
