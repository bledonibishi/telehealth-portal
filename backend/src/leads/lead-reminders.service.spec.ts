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
  const prisma = { lead: { findMany: jest.fn().mockResolvedValue(leads), update: jest.fn(), updateMany: jest.fn() } };
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

  it('asks only for unpaid, unstopped leads who reached the plans, with no account, idle between a day and a month', async () => {
    const { prisma, service } = build([]);
    await service.sendDue(now);
    const where = prisma.lead.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ convertedAt: null, remindersStoppedAt: null, patient: null, intakeSavedAt: { not: null }, reminderCount: { lt: MAX_REMINDERS } });
    expect(where.updatedAt.lte).toEqual(ago(24));
    expect(where.updatedAt.gte).toEqual(ago(24 * 30));
  });

  it('can be narrowed to some addresses, so a test run never reaches real leads', async () => {
    const { prisma, service } = build([]);
    await service.sendDue(now, 'demo.');
    expect(prisma.lead.findMany.mock.calls[0][0].where.email).toEqual({ startsWith: 'demo.' });
  });

  it('sends the first reminder with a continue link to the programme and a signed stop link, and counts it without touching the lead’s activity time', async () => {
    const l = lead();
    const { prisma, email, service } = build([l]);
    expect(await service.sendDue(now)).toBe(1);
    const [to, name, continueUrl, stopUrl, last] = email.sendLeadReminderEmail.mock.calls[0];
    expect([to, name, continueUrl, last]).toEqual(['a@example.com', 'Ana', 'https://example.com/hrt-eligibility', false]);
    expect(stopUrl).toMatch(/^https:\/\/api\.example\.com\/leads\/unsubscribe\?lead=lead-1&sig=[0-9a-f]{64}$/);
    expect(prisma.lead.update).toHaveBeenCalledWith({ where: { id: 'lead-1' }, data: { reminderCount: { increment: 1 }, lastReminderAt: now, updatedAt: l.updatedAt } });
  });

  it('holds the second reminder back for four days, then sends it as the last', async () => {
    const tooSoon = build([lead({ reminderCount: 1, lastReminderAt: ago(48) })]);
    expect(await tooSoon.service.sendDue(now)).toBe(0);

    const ready = build([lead({ reminderCount: 1, lastReminderAt: ago(5 * 24) })]);
    expect(await ready.service.sendDue(now)).toBe(1);
    expect(ready.email.sendLeadReminderEmail.mock.calls[0][4]).toBe(true);
  });

  it('never reminds someone the eligibility triage ruled out', async () => {
    const q = findQuestionnaire(ConsultationKind.GLP1, 'ELIGIBILITY');
    const age = q.questions.find((x) => x.id === 'age')!.options!.find((o) => !o.flag)!.label;
    const history = q.questions.find((x) => x.id === 'medical_history')!.options!.find((o) => o.value === 'pancreatitis')!;
    const quizAnswers = [
      { questionId: 'age', question: q.questions.find((x) => x.id === 'age')!.text, answer: age },
      { questionId: 'medical_history', question: q.questions.find((x) => x.id === 'medical_history')!.text, answer: history.label },
    ];
    const { email, service } = build([lead({ productKind: 'GLP1', quizAnswers })]);
    expect(await service.sendDue(now)).toBe(0);
    expect(email.sendLeadReminderEmail).not.toHaveBeenCalled();
  });

  it('does not count a reminder the email provider did not accept', async () => {
    const { prisma, service } = build([lead()], { accepted: false });
    expect(await service.sendDue(now)).toBe(0);
    expect(prisma.lead.update).not.toHaveBeenCalled();
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
