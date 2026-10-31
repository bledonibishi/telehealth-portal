import { CLOSE_AFTER_HOURS, MAX_ATTEMPTS, QUIET_MS, SupportBotService } from './support-bot.service';
import { overpromises } from './answer-guard';
import { DEFAULT_ARTICLES } from './support-knowledge';
import { GROUNDING_SYSTEM } from './grounding-check';

const NOW = new Date('2026-10-14T12:00:00Z');
const thread = (over: any = {}) => ({ id: 't-1', threadKey: 'p-1:pre', patientId: 'p-1', consultationId: null, status: 'ACTIVE', replyDueAt: new Date(NOW.getTime() - 1000), attempts: 0, usedArticles: [], ticketId: null, awaitingSince: null, ...over });
const msg = (id: string, role: 'PATIENT' | 'CLINICIAN', content: string, over: any = {}) => ({ id, senderRole: role, content, isAi: false, aiCheckedAt: new Date(), aiUrgent: false, sentAt: new Date(NOW.getTime() - 60_000), ...over });
const decision = (over: any = {}) => ({ status: 'COMPLETED', data: { language: 'en', intent: 'SUPPORT_QUESTION', ticketType: 'ACCOUNT', subject: 'Forgot password', articleId: 'reset-password', answer: 'Use Forgot password on the sign-in page.', ...over } });

function setup(opts: { enabled?: boolean; row?: any; messages?: any[]; ai?: any; grounding?: any } = {}) {
  const row = opts.row ?? thread();
  const prisma: any = {
    supportThread: {
      findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}), update: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([row]),
    },
    message: { findMany: jest.fn().mockResolvedValue([...(opts.messages ?? [msg('m1', 'PATIENT', 'I forgot my password')])].reverse()), count: jest.fn().mockResolvedValue(0) },
    ticket: { findUnique: jest.fn().mockResolvedValue({ status: 'OPEN' }) },
    uploadedFile: { count: jest.fn().mockResolvedValue(0) },
    order: { findMany: jest.fn().mockResolvedValue([]) },
  };
  // The assistant's decision, and the second model's check of its draft (which passes unless a test says otherwise).
  const ai = {
    isEnabled: jest.fn().mockReturnValue(opts.enabled ?? true),
    checkerModel: jest.fn().mockReturnValue('claude-haiku-4-5'),
    json: jest.fn().mockImplementation(async (o: any) => (o.system === GROUNDING_SYSTEM ? opts.grounding ?? { status: 'COMPLETED', data: { grounded: true, problem: '' } } : opts.ai ?? decision())),
  };
  const tickets = { openForAssistant: jest.fn().mockResolvedValue('tk-1'), assistantUpdate: jest.fn().mockResolvedValue(undefined), notifyStaffAbout: jest.fn().mockResolvedValue(undefined) };
  const urgency = { check: jest.fn().mockResolvedValue(false) };
  const articles = { active: jest.fn().mockResolvedValue(DEFAULT_ARTICLES) };
  const bot = new SupportBotService(prisma, ai as any, tickets as any, articles as any, urgency as any);
  const sent: string[] = [];
  bot.useSender(async (_p, _c, content) => { sent.push(content); });
  return { bot, prisma, ai, tickets, urgency, articles, sent, row };
}

describe('waiting for the patient to finish typing', () => {
  it('starts a 30 second timer on the first message', async () => {
    const { bot, prisma } = setup();
    const before = Date.now();
    await bot.onPatientMessage({ patientId: 'p-1', consultationId: null });
    const due: Date = prisma.supportThread.create.mock.calls[0][0].data.replyDueAt;
    expect(due.getTime() - before).toBeGreaterThanOrEqual(QUIET_MS - 50);
    expect(due.getTime() - before).toBeLessThan(QUIET_MS + 2000);
  });

  it('pushes the timer back each time they write again', async () => {
    const { bot, prisma } = setup();
    prisma.supportThread.findUnique.mockResolvedValue(thread({ replyDueAt: new Date(Date.now() + 5000) }));
    await bot.onPatientMessage({ patientId: 'p-1', consultationId: null });
    const due: Date = prisma.supportThread.update.mock.calls[0][0].data.replyDueAt;
    expect(due.getTime()).toBeGreaterThan(Date.now() + QUIET_MS - 1000);
  });

  it('does nothing when the assistant is switched off', async () => {
    const { bot, prisma } = setup({ enabled: false });
    await bot.onPatientMessage({ patientId: 'p-1', consultationId: null });
    expect(prisma.supportThread.create).not.toHaveBeenCalled();
    expect(await bot.processDue(NOW)).toBe(0);
  });

  it('leaves a conversation a person has taken over alone, until their ticket is finished', async () => {
    const { bot, prisma } = setup();
    prisma.supportThread.findUnique.mockResolvedValue(thread({ status: 'ESCALATED', ticketId: 'tk-1' }));
    await bot.onPatientMessage({ patientId: 'p-1', consultationId: null });
    expect(prisma.supportThread.update).not.toHaveBeenCalled();
    prisma.ticket.findUnique.mockResolvedValue({ status: 'RESOLVED' });
    await bot.onPatientMessage({ patientId: 'p-1', consultationId: null });
    expect(prisma.supportThread.update.mock.calls[0][0].data).toMatchObject({ status: 'ACTIVE', attempts: 0, ticketId: null });
  });

  it('steps back when a person from the team writes', async () => {
    const { bot, prisma } = setup();
    await bot.onStaffMessage({ patientId: 'p-1', consultationId: null });
    expect(prisma.supportThread.updateMany.mock.calls[0][0].data).toMatchObject({ status: 'ESCALATED', replyDueAt: null });
  });

  it('only answers conversations whose timer has run out, and claims each one first', async () => {
    const { bot, prisma } = setup();
    await bot.processDue(NOW);
    expect(prisma.supportThread.findMany.mock.calls[0][0].where.replyDueAt).toEqual({ lte: NOW });
    expect(prisma.supportThread.updateMany).toHaveBeenCalledWith({ where: { id: 't-1', replyDueAt: { lte: NOW } }, data: { replyDueAt: null } });
  });

  it('does not answer twice when another run already claimed the thread', async () => {
    const { bot, prisma, ai } = setup();
    prisma.supportThread.updateMany.mockResolvedValue({ count: 0 });
    expect(await bot.processDue(NOW)).toBe(0);
    expect(ai.json).not.toHaveBeenCalled();
  });
});

describe('answering a practical question', () => {
  it('answers from the article, says it is waiting to hear back, and opens a ticket', async () => {
    const { bot, sent, tickets, prisma } = setup();
    await bot.processDue(NOW);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('Forgot password');
    expect(sent[0]).toMatch(/Did that solve it/);
    expect(tickets.openForAssistant).toHaveBeenCalledWith('p-1', expect.objectContaining({ type: 'ACCOUNT' }));
    expect(prisma.supportThread.update.mock.calls.at(-1)[0].data).toMatchObject({ status: 'AWAITING_PATIENT', attempts: 1, ticketId: 'tk-1' });
    expect(tickets.notifyStaffAbout).not.toHaveBeenCalled();
  });

  it('only waits through the greeting, without counting an attempt or opening a ticket', async () => {
    const { bot, sent, tickets } = setup({ ai: decision({ intent: 'GREETING', articleId: null, answer: '' }), messages: [msg('m1', 'PATIENT', 'hi there')] });
    await bot.processDue(NOW);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatch(/automated assistant/i);
    expect(tickets.openForAssistant).not.toHaveBeenCalled();
  });

  it('hands over at once when no article covers the question, saying so to the patient', async () => {
    const { bot, sent, tickets } = setup({ ai: decision({ articleId: null, answer: '' }) });
    await bot.processDue(NOW);
    expect(tickets.notifyStaffAbout).toHaveBeenCalled();
    expect(sent[0]).toMatch(/passed this to our team/i);
  });

  it('refuses to send an answer that names no real article', async () => {
    const { bot, tickets } = setup({ ai: decision({ articleId: 'made-up-article' }) });
    await bot.processDue(NOW);
    expect(tickets.notifyStaffAbout).toHaveBeenCalled();
  });

  it('also opens it for the team when the article is only a first step', async () => {
    const { bot, tickets } = setup({ ai: decision({ articleId: 'activation-email', answer: 'Check spam, and the team can send a new link.' }) });
    await bot.processDue(NOW);
    expect(tickets.notifyStaffAbout).toHaveBeenCalled();
  });

  it('answers in the patient’s language for the fixed sentences', async () => {
    const { bot, sent } = setup({ ai: decision({ language: 'sq', intent: 'GREETING', articleId: null, answer: '' }), messages: [msg('m1', 'PATIENT', 'Përshëndetje')] });
    await bot.processDue(NOW);
    expect(sent[0]).toMatch(/asistenti automatik/);
  });
});

describe('help articles from the database', () => {
  it('answers only from articles that are switched on', async () => {
    const { bot, articles, tickets, sent } = setup();
    articles.active.mockResolvedValue(DEFAULT_ARTICLES.filter((a) => a.id !== 'reset-password'));
    await bot.processDue(NOW); // the model names reset-password, which the team has switched off
    expect(sent.some((m) => /Did that solve it/.test(m))).toBe(false);
    expect(tickets.notifyStaffAbout).toHaveBeenCalled();
  });

  it('records which article an answer came from, and why it handed a conversation over', async () => {
    const { bot, prisma } = setup();
    let meta: any;
    bot.useSender(async (_p, _c, _t, m) => { meta = m; });
    await bot.processDue(NOW);
    expect(meta).toEqual({ articleId: 'reset-password' });
    const none = setup({ ai: decision({ articleId: null, answer: '' }) });
    await none.bot.processDue(NOW);
    expect(none.prisma.supportThread.update.mock.calls.at(-1)[0].data).toMatchObject({ status: 'ESCALATED', escalationReason: 'No help article covers this question.' });
    void prisma;
  });
});

describe('what it never answers', () => {
  it('hands over a message that has a file, because it cannot see it', async () => {
    const { bot, prisma, tickets, sent } = setup({ messages: [msg('m1', 'PATIENT', 'here is the error')] });
    prisma.uploadedFile.count.mockResolvedValue(1);
    await bot.processDue(NOW);
    expect(tickets.notifyStaffAbout).toHaveBeenCalled();
    expect(sent.join(' ')).not.toMatch(/help article|did that help/i);
  });

  it('sends a health message with a photo to the doctors, not to support', async () => {
    const { bot, prisma, tickets } = setup({ ai: decision({ intent: 'MEDICAL', articleId: null, answer: '' }), messages: [msg('m1', 'PATIENT', 'my injection site looks like this')] });
    prisma.uploadedFile.count.mockResolvedValue(1);
    await bot.processDue(NOW);
    expect(tickets.openForAssistant).toHaveBeenCalledWith('p-1', expect.objectContaining({ type: 'CLINICAL' }));
  });

  it('does not answer when the patient wrote again while the model was thinking', async () => {
    const { bot, prisma, sent } = setup();
    prisma.supportThread.findUnique.mockResolvedValue({ replyDueAt: new Date(NOW.getTime() + 30_000) });
    await bot.processDue(NOW);
    expect(sent).toHaveLength(0);
  });

  it('hands a health question to the doctors without answering it', async () => {
    const { bot, sent, tickets } = setup({ ai: decision({ intent: 'MEDICAL', articleId: null, answer: '' }), messages: [msg('m1', 'PATIENT', 'I feel dizzy after my dose')] });
    await bot.processDue(NOW);
    expect(tickets.openForAssistant).toHaveBeenCalledWith('p-1', expect.objectContaining({ type: 'CLINICAL', priority: 'HIGH' }));
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatch(/doctors/i);
    expect(sent[0]).toMatch(/emergency/i);
  });

  it('does not even ask the AI when a message was marked urgent', async () => {
    const { bot, ai, tickets, prisma } = setup({ messages: [msg('m1', 'PATIENT', 'chest pain')] });
    prisma.message.count.mockResolvedValue(1);
    await bot.processDue(NOW);
    expect(ai.json).not.toHaveBeenCalled();
    expect(tickets.openForAssistant).toHaveBeenCalledWith('p-1', expect.objectContaining({ type: 'CLINICAL', priority: 'URGENT' }));
  });

  it('runs the urgency check first on a message that has not been checked', async () => {
    const { bot, urgency } = setup({ messages: [msg('m1', 'PATIENT', 'hello', { aiCheckedAt: null })] });
    await bot.processDue(NOW);
    expect(urgency.check).toHaveBeenCalledWith('m1');
  });

  it('hands over when the patient asks for a person', async () => {
    const { bot, tickets } = setup({ ai: decision({ intent: 'HUMAN_REQUESTED', articleId: null, answer: '' }) });
    await bot.processDue(NOW);
    expect(tickets.notifyStaffAbout).toHaveBeenCalled();
  });

  it('hands over, quietly, when the AI service fails: nobody is left waiting', async () => {
    const { bot, sent, tickets } = setup({ ai: { status: 'FAILED', reason: 'down' } });
    await bot.processDue(NOW);
    expect(tickets.notifyStaffAbout).toHaveBeenCalled();
    expect(sent).toHaveLength(0);
  });

  it('hands over when something unexpected breaks', async () => {
    const { bot, ai, tickets } = setup();
    ai.json.mockRejectedValue(new Error('boom'));
    await bot.processDue(NOW);
    expect(tickets.notifyStaffAbout).toHaveBeenCalled();
  });
});

describe('after its answer', () => {
  const waiting = (attempts = 1) => thread({ status: 'AWAITING_PATIENT', attempts, ticketId: 'tk-1', awaitingSince: new Date(NOW.getTime() - 3_600_000) });
  const convo = [msg('m0', 'PATIENT', 'I forgot my password', { sentAt: new Date(NOW.getTime() - 3_600_000) }), msg('m1', 'CLINICIAN', 'Use Forgot password.', { isAi: true, sentAt: new Date(NOW.getTime() - 3_500_000) }), msg('m2', 'PATIENT', 'thanks')];

  it('resolves the ticket when the patient says it worked', async () => {
    const { bot, tickets, prisma, sent } = setup({ row: waiting(), messages: convo, ai: decision({ intent: 'SATISFIED', articleId: null, answer: '' }) });
    await bot.processDue(NOW);
    expect(tickets.assistantUpdate).toHaveBeenCalledWith('tk-1', expect.objectContaining({ status: 'RESOLVED' }));
    expect(prisma.supportThread.update.mock.calls.at(-1)[0].data).toMatchObject({ status: 'DONE' });
    expect(sent[0]).toMatch(/Glad/);
  });

  it('tries again when the patient says it did not help, counting the attempt', async () => {
    const { bot, prisma, sent } = setup({ row: waiting(2), messages: convo, ai: decision({ intent: 'NOT_SATISFIED' }) });
    await bot.processDue(NOW);
    expect(sent).toHaveLength(1);
    expect(prisma.supportThread.update.mock.calls.at(-1)[0].data).toMatchObject({ attempts: 3, status: 'AWAITING_PATIENT' });
  });

  it(`hands over to a person after ${MAX_ATTEMPTS} answers did not solve it`, async () => {
    const { bot, tickets, sent } = setup({ row: waiting(MAX_ATTEMPTS), messages: convo, ai: decision({ intent: 'NOT_SATISFIED' }) });
    await bot.processDue(NOW);
    expect(tickets.notifyStaffAbout).toHaveBeenCalledWith('tk-1');
    expect(sent[0]).toMatch(/passed this to our team/i);
    expect(sent.some((s) => /Did that solve it/.test(s))).toBe(false);
  });

  it('hands over instead of repeating an article that already failed this patient', async () => {
    const { bot, tickets, sent } = setup({ row: { ...waiting(1), usedArticles: ['reset-password'] }, messages: convo, ai: decision({ intent: 'NOT_SATISFIED' }) });
    await bot.processDue(NOW);
    expect(tickets.notifyStaffAbout).toHaveBeenCalledWith('tk-1');
    expect(sent.some((m) => /Did that solve it/.test(m))).toBe(false);
  });

  it('may use a different article for a patient it has already helped with another one', async () => {
    const { bot, sent } = setup({ row: { ...waiting(1), usedArticles: ['manage-subscription'] }, messages: convo, ai: decision({ intent: 'NOT_SATISFIED', articleId: 'reset-password' }) });
    await bot.processDue(NOW);
    expect(sent.some((m) => /Did that solve it/.test(m))).toBe(true);
  });

  it('steps back if a person wrote in the meantime', async () => {
    const withHuman = [...convo.slice(0, 2), msg('m3', 'CLINICIAN', 'Hi, Clara here', { sentAt: new Date(NOW.getTime() - 120_000) }), msg('m4', 'PATIENT', 'ok thanks')];
    const { bot, ai, prisma } = setup({ row: waiting(), messages: withHuman });
    await bot.processDue(NOW);
    expect(ai.json).not.toHaveBeenCalled();
    expect(prisma.supportThread.update.mock.calls.at(-1)[0].data).toMatchObject({ status: 'ESCALATED' });
  });

  it(`closes the ticket after ${CLOSE_AFTER_HOURS} hours of silence`, async () => {
    const { bot, tickets, prisma } = setup({ row: waiting() });
    prisma.supportThread.findMany.mockResolvedValue([thread({ status: 'AWAITING_PATIENT', replyDueAt: null, ticketId: 'tk-1', awaitingSince: new Date(NOW.getTime() - (CLOSE_AFTER_HOURS + 1) * 3_600_000) })]);
    expect(await bot.closeStale(NOW)).toBe(1);
    expect(tickets.assistantUpdate).toHaveBeenCalledWith('tk-1', expect.objectContaining({ status: 'CLOSED' }));
    expect(prisma.supportThread.findMany.mock.calls[0][0].where.awaitingSince.lte.getTime()).toBe(NOW.getTime() - CLOSE_AFTER_HOURS * 3_600_000);
  });
});

describe('answers that promise or ask for too much', () => {
  it('spots a promise of action and a request for personal details', () => {
    expect(overpromises('Please reply with the email address you signed up with, and we\'ll make sure you get it.')).toBe(true);
    expect(overpromises('I\'ll send you a new link right away.')).toBe(true);
    expect(overpromises('We will refund you within 3 days.')).toBe(true);
    expect(overpromises('Send me your password and I can help.')).toBe(true);
  });

  it('lets an ordinary answer through', () => {
    expect(overpromises('On the sign-in page choose “Forgot password” and enter the email you signed up with. We email a link to set a new password.')).toBe(false);
    expect(overpromises('Open Settings and use “Manage subscription”. It opens our payment provider, where you can update your card.')).toBe(false);
    expect(overpromises('If it is not there, the team can send you a new link.')).toBe(false);
  });

  it('hands the conversation to a person instead of sending such an answer', async () => {
    const { bot, sent, tickets } = setup({ ai: decision({ answer: 'Reply with your email and we\'ll make sure you get it.' }) });
    await bot.processDue(NOW);
    expect(sent.some((m) => /make sure you get it/.test(m))).toBe(false);
    expect(tickets.notifyStaffAbout).toHaveBeenCalled();
  });
});

describe('the second look at a draft answer', () => {
  const groundingCall = (ai: any) => ai.json.mock.calls.find((c: any[]) => c[0].system === GROUNDING_SYSTEM)?.[0];

  it('checks the draft against the article with the small model before sending it', async () => {
    const { bot, ai, sent } = setup();
    await bot.processDue(NOW);
    const check = groundingCall(ai);
    expect(check.model).toBe('claude-haiku-4-5');
    expect(check.user).toContain(DEFAULT_ARTICLES.find((a) => a.id === 'reset-password')!.body);
    expect(check.user).toContain('Use Forgot password on the sign-in page.');
    expect(sent[0]).toMatch(/Did that solve it/);
  });

  it('does not send a draft the check says goes beyond its sources, in any language, and hands it over', async () => {
    const albanian = 'Mos u shqetëso, do t’ju kthejmë paratë brenda 3 ditëve.';
    const { bot, sent, tickets } = setup({ ai: decision({ language: 'sq', articleId: 'stop-or-refund', answer: albanian }), grounding: { status: 'COMPLETED', data: { grounded: false, problem: 'Promises a refund within 3 days.' } } });
    await bot.processDue(NOW);
    expect(sent.join('\n')).not.toContain(albanian);
    expect(tickets.notifyStaffAbout).toHaveBeenCalled();
    expect(sent).toHaveLength(1);
    expect(sent[0]).not.toMatch(/Did that solve it/);
  });

  it('does not send anything it could not check', async () => {
    const { bot, sent, prisma } = setup({ grounding: { status: 'FAILED', reason: 'down' } });
    await bot.processDue(NOW);
    expect(sent.some((m) => /Did that solve it/.test(m))).toBe(false);
    expect(prisma.supportThread.update.mock.calls.at(-1)[0].data).toMatchObject({ status: 'ESCALATED', escalationReason: 'The assistant could not check its draft answer, so it was not sent.' });
  });

  it('checks an order answer against what the lookup returned as well', async () => {
    const lookup = '{"orders":[{"stage":"DISPATCHED","courier":"PostaKS"}]}';
    const { bot, ai } = setup({ ai: { ...decision({ articleId: 'track-order', answer: 'Your order is with PostaKS.' }), toolOutputs: [{ name: 'get_my_orders', output: lookup }] } });
    await bot.processDue(NOW);
    expect(groundingCall(ai).user).toContain(lookup);
  });
});

describe('looking up the patient’s orders', () => {
  it('offers the lookup only while the order article is on, and it reads only that patient’s orders', async () => {
    const { bot, ai, prisma } = setup();
    await bot.processDue(NOW);
    const tools = ai.json.mock.calls[0][0].tools;
    expect(tools.map((t: any) => t.name)).toEqual(['get_my_orders']);
    // Whatever the model asks for, the lookup is for the patient in this conversation.
    await tools[0].run({ patientId: 'someone-else' });
    expect(prisma.order.findMany.mock.calls[0][0].where).toEqual({ patientId: 'p-1' });

    const off = setup();
    off.articles.active.mockResolvedValue(DEFAULT_ARTICLES.filter((a) => a.id !== 'track-order'));
    await off.bot.processDue(NOW);
    expect(off.ai.json.mock.calls[0][0].tools).toEqual([]);
  });

  it('tells the model where an order is, and nothing about the medicine, the address, the payment or a cancellation reason', async () => {
    const { bot, prisma } = setup();
    prisma.order.findMany.mockResolvedValue([{ sequence: 2, status: 'DISPATCHED', createdAt: new Date('2026-10-10T08:00:00Z'), dispatchedAt: new Date('2026-10-12T08:00:00Z'), carrier: 'PostaKS', trackingNumber: 'PK123', trackingUrl: 'https://track/PK123', estimatedDeliveryFrom: new Date('2026-10-15T00:00:00Z'), estimatedDeliveryTo: null, outForDeliveryAt: null, deliveredAt: null, cancelledAt: null }]);
    const out = await bot.ordersFor('p-1');
    expect(out.orders[0]).toMatchObject({ supply: 2, stage: 'DISPATCHED', shipped: '2026-10-12', courier: 'PostaKS', trackingNumber: 'PK123', expectedFrom: '2026-10-15' });
    const select = prisma.order.findMany.mock.calls[0][0].select;
    for (const field of ['shippingAddress', 'prescriptionId', 'prescription', 'cancelReason', 'cancelBillingNote', 'paymentUrl', 'paymentAmountCents']) expect(select[field]).toBeUndefined();
  });
});

describe('a draft it has no use for', () => {
  it('is dropped for a health question, so the model’s own words can never reach the patient', async () => {
    const draft = 'I’m not a doctor, but dizziness after a dose is usually nothing to worry about.';
    const { bot, sent } = setup({ ai: decision({ intent: 'MEDICAL', articleId: 'reset-password', answer: draft }) });
    const r: any = await bot.interpret({ articles: DEFAULT_ARTICLES, transcript: 'Patient: I feel dizzy', attempts: 0, awaiting: false });
    expect(r.data).toMatchObject({ intent: 'MEDICAL', articleId: null, answer: '' });
    await bot.processDue(NOW);
    expect(sent.join('\n')).not.toContain(draft);
  });

  it('is kept for a practical question', async () => {
    const { bot } = setup();
    const r: any = await bot.interpret({ articles: DEFAULT_ARTICLES, transcript: 'Patient: I forgot my password', attempts: 0, awaiting: false });
    expect(r.data).toMatchObject({ articleId: 'reset-password', answer: 'Use Forgot password on the sign-in page.' });
  });
});
