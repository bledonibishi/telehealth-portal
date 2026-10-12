import { LeadRemindersService, MAX_REMINDERS } from './lead-reminders.service';
import { findQuestionnaire } from '../questionnaires/definitions';
import { ConsultationKind } from '../common/enums';

const HOUR = 3_600_000;
const now = new Date('2026-10-20T12:00:00Z');
const ago = (hours: number) => new Date(now.getTime() - hours * HOUR);

const lead = (over: object = {}) => ({
  id: 'lead-1',
  email: 'a@example.com',
  firstName: 'Ana',
  productKind: 'HRT',
  quizAnswers: [],
  reminderCount: 0,
  lastReminderAt: null,
  updatedAt: ago(30),
  ...over,
});

function build(leads: any[], opts: { enabled?: boolean; accepted?: boolean } = {}) {
  const prisma = { lead: { findMany: jest.fn().mockResolvedValueOnce(leads).mockResolvedValue([]), update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
  const email = { sendLeadReminderEmail: jest.fn().mockResolvedValue(opts.accepted ?? true) };
  const env: Record<string, string> = { JWT_SECRET: 'secret', API_PUBLIC_URL: 'https://api.example.com', WEBFLOW_SITE_URL: 'https://example.com', ...(opts.enabled === false ? {} : { LEAD_REMINDERS_ENABLED: 'true' }) };
  const service = new LeadRemindersService(prisma as any, email as any, { get: (k: string) => env[k] } as any);
  return { prisma, email, service };
}

describe('LeadRemindersService.sendDue', () => {
  it('sends nothing, and does not even look, unless the feature is switched on', async () => {
    const { prisma, email, service } = build([lead()], { enabled: false });
    expect(await service.sendDue(now)).toBe(0);
    expect(prisma.lead.findMany).not.toHaveBeenCalled();
    expect(email.sendLeadReminderEmail).not.toHaveBeenCalled();
  });

  it('asks only for unpaid, unstopped leads who reached the plans, with no account, idle between a day and a month, and due for their next reminder', async () => {
    const { prisma, service } = build([]);
    await service.sendDue(now);
    const where = prisma.lead.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ convertedAt: null, remindersStoppedAt: null, patient: null, intakeSavedAt: { not: null }, reminderCount: { lt: MAX_REMINDERS } });
    expect(where.updatedAt.lte).toEqual(ago(24));
    expect(where.updatedAt.gte).toEqual(ago(24 * 30));
    // The wait before the second reminder is in the query, so a lead that is not due can't hold a place in the batch.
    expect(where.OR).toEqual([{ reminderCount: 0 }, { lastReminderAt: { lte: ago(4 * 24) } }]);
  });

  it('can be narrowed to some addresses, so a test run never reaches real leads', async () => {
    const { prisma, service } = build([]);
    await service.sendDue(now, 'demo.');
    expect(prisma.lead.findMany.mock.calls[0][0].where.email).toEqual({ startsWith: 'demo.' });
  });

  it('claims the lead before it emails it, and sends the first reminder with a continue link and a signed stop link', async () => {
    const l = lead();
    const { prisma, email, service } = build([l]);
    expect(await service.sendDue(now)).toBe(1);
    expect(prisma.lead.updateMany).toHaveBeenCalledWith({
      where: { id: 'lead-1', reminderCount: 0, remindersStoppedAt: null, convertedAt: null },
      data: { reminderCount: { increment: 1 }, lastReminderAt: now, updatedAt: l.updatedAt },
    });
    expect(prisma.lead.updateMany.mock.invocationCallOrder[0]).toBeLessThan(email.sendLeadReminderEmail.mock.invocationCallOrder[0]);
    const [to, name, continueUrl, stopUrl, last] = email.sendLeadReminderEmail.mock.calls[0];
    expect([to, name, continueUrl, last]).toEqual(['a@example.com', 'Ana', 'https://example.com/hrt-eligibility', false]);
    expect(stopUrl).toMatch(/^https:\/\/api\.example\.com\/leads\/unsubscribe\?lead=lead-1&sig=[0-9a-f]{64}$/);
  });

  it('does not email a lead another run claimed first', async () => {
    const { prisma, email, service } = build([lead()]);
    prisma.lead.updateMany.mockResolvedValue({ count: 0 });
    expect(await service.sendDue(now)).toBe(0);
    expect(email.sendLeadReminderEmail).not.toHaveBeenCalled();
  });

  it('sends the second one as the last, and counts it from the first', async () => {
    const ready = build([lead({ reminderCount: 1, lastReminderAt: ago(5 * 24) })]);
    expect(await ready.service.sendDue(now)).toBe(1);
    expect(ready.email.sendLeadReminderEmail.mock.calls[0][4]).toBe(true);
    expect(ready.prisma.lead.updateMany.mock.calls[0][0].where.reminderCount).toBe(1);
  });

  it('never reminds someone the eligibility triage ruled out, and goes on to the leads behind them', async () => {
    const q = findQuestionnaire(ConsultationKind.GLP1, 'ELIGIBILITY');
    const age = q.questions.find((x) => x.id === 'age')!.options!.find((o) => !o.flag)!.label;
    const history = q.questions.find((x) => x.id === 'medical_history')!.options!.find((o) => o.value === 'pancreatitis')!;
    const quizAnswers = [
      { questionId: 'age', question: q.questions.find((x) => x.id === 'age')!.text, answer: age },
      { questionId: 'medical_history', question: q.questions.find((x) => x.id === 'medical_history')!.text, answer: history.label },
    ];
    const { email, service } = build([lead({ id: 'ruled-out', email: 'r@example.com', productKind: 'GLP1', quizAnswers }), lead({ id: 'fine', email: 'f@example.com' })]);
    expect(await service.sendDue(now)).toBe(1);
    expect(email.sendLeadReminderEmail.mock.calls.map((c: any[]) => c[0])).toEqual(['f@example.com']);
  });

  it('keeps paging past leads it skips until it has sent a full batch, so a pile of skipped ones never blocks everyone else', async () => {
    const q = findQuestionnaire(ConsultationKind.GLP1, 'ELIGIBILITY');
    const age = q.questions.find((x) => x.id === 'age')!.options!.find((o) => !o.flag)!.label;
    const history = q.questions.find((x) => x.id === 'medical_history')!.options!.find((o) => o.value === 'pancreatitis')!;
    const red = [{ questionId: 'age', question: 'a', answer: age }, { questionId: 'medical_history', question: 'm', answer: history.label }];
    const blocked = Array.from({ length: 200 }, (_, i) => lead({ id: `red-${i}`, email: `r${i}@example.com`, productKind: 'GLP1', quizAnswers: red }));
    const { prisma, email, service } = build(blocked);
    prisma.lead.findMany.mockResolvedValueOnce(blocked).mockResolvedValueOnce([lead({ id: 'later', email: 'later@example.com' })]).mockResolvedValue([]);
    expect(await service.sendDue(now)).toBe(1);
    expect(email.sendLeadReminderEmail).toHaveBeenCalledTimes(1);
    expect(prisma.lead.findMany.mock.calls[1][0]).toMatchObject({ cursor: { id: 'red-199' }, skip: 1 });
  });

  it('gives the claim back when the email is not accepted or throws, so the next run tries again', async () => {
    const l = lead({ reminderCount: 1, lastReminderAt: ago(5 * 24) });
    const refused = build([l], { accepted: false });
    expect(await refused.service.sendDue(now)).toBe(0);
    expect(refused.prisma.lead.updateMany).toHaveBeenLastCalledWith({ where: { id: 'lead-1', reminderCount: 2 }, data: { reminderCount: 1, lastReminderAt: l.lastReminderAt, updatedAt: l.updatedAt } });

    const thrown = build([lead()]);
    thrown.email.sendLeadReminderEmail.mockRejectedValue(new Error('provider down'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await thrown.service.sendDue(now)).toBe(0);
    expect(thrown.prisma.lead.updateMany).toHaveBeenCalledTimes(2);
  });
});

describe('LeadRemindersService.unsubscribe', () => {
  it('stops the reminders for a link it signed, and only for that lead', async () => {
    const { prisma, service } = build([]);
    const sig = service.unsubscribeUrl('lead-1').split('sig=')[1];
    expect(await service.unsubscribe('lead-1', sig)).toBe(true);
    expect(prisma.lead.updateMany).toHaveBeenCalledWith({ where: { id: 'lead-1', remindersStoppedAt: null }, data: { remindersStoppedAt: expect.any(Date) } });

    prisma.lead.updateMany.mockClear();
    expect(await service.unsubscribe('lead-2', sig)).toBe(false);
    expect(await service.unsubscribe('lead-1', 'nope')).toBe(false);
    expect(prisma.lead.updateMany).not.toHaveBeenCalled();
  });
});
