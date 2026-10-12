import { BadRequestException } from '@nestjs/common';
import { MessageAssistService } from './message-assist.service';
import { MessageUrgencyService } from './message-urgency.service';
import { PatientSearchService, sanitiseFilters } from './patient-search.service';

const ok = <T>(data: T) => ({ status: 'COMPLETED' as const, data, model: 'm' });
const ai = (result: any, enabled = true) => ({ isEnabled: jest.fn().mockReturnValue(enabled), json: jest.fn().mockResolvedValue(result) }) as any;
const audit = () => ({ log: jest.fn().mockResolvedValue(undefined) }) as any;
const user = { id: 'u-1', role: 'CLINICIAN', clinicianRole: 'CX_TEAM' } as any;

describe('MessageAssistService.draftReply', () => {
  const thread = [
    { senderRole: 'PATIENT', content: 'Hi, can I take the dose a day early?' },
    { senderRole: 'CLINICIAN', content: 'Hello Alma, let me check.' },
  ];
  const build = (aiMock: any, messages: any[] = [...thread].reverse()) => {
    const prisma: any = { message: { findMany: jest.fn().mockResolvedValue(messages) }, patient: { findUnique: jest.fn().mockResolvedValue({ firstName: 'Alma' }) }, consultation: { findFirst: jest.fn().mockResolvedValue({ id: 'c-1' }) } };
    return { prisma, svc: new MessageAssistService(prisma, aiMock, audit(), { get: () => 'Omo' } as any) };
  };

  it('sends the AI the conversation oldest first, marked by who wrote it, and returns the draft', async () => {
    const mock = ai(ok({ draft: ' Hi Alma, your doctor will reply. ', language: 'en', needs_clinician: true, reason: 'Asks about dose timing' }));
    const { svc } = build(mock);
    const out = await svc.draftReply(user, { patientId: 'p-1' });
    const sent = mock.json.mock.calls[0][0].user as string;
    expect(sent.indexOf('<Patient>Hi, can I')).toBeLessThan(sent.indexOf('<Team>Hello Alma'));
    expect(sent).toContain('customer-support team member');
    expect(out).toEqual({ draft: 'Hi Alma, your doctor will reply.', language: 'en', needsClinician: true, reason: 'Asks about dose timing' });
  });

  it('reads only the conversation it was asked about (and the one from before it), and only if it is this patient’s', async () => {
    const mock = ai(ok({ draft: 'Hi', language: 'en', needs_clinician: false, reason: '' }));
    const { svc, prisma } = build(mock);
    await svc.draftReply(user, { patientId: 'p-1', consultationId: 'c-1' });
    expect(prisma.consultation.findFirst).toHaveBeenCalledWith({ where: { id: 'c-1', patientId: 'p-1' }, select: { id: true } });
    expect(prisma.message.findMany.mock.calls[0][0].where).toEqual({ patientId: 'p-1', consultationId: { in: ['c-1', null] } });

    prisma.consultation.findFirst.mockResolvedValue(null);
    await expect(svc.draftReply(user, { patientId: 'p-1', consultationId: 'someone-elses' })).rejects.toThrow(/isn’t this patient’s/);

    // Without a conversation, everything the patient wrote.
    const all = build(ai(ok({ draft: 'Hi', language: 'en', needs_clinician: false, reason: '' })));
    await all.svc.draftReply(user, { patientId: 'p-1' });
    expect(all.prisma.message.findMany.mock.calls[0][0].where).toEqual({ patientId: 'p-1' });
  });

  it('refuses when switched off, or when the patient has not written', async () => {
    await expect(build(ai(ok({}), false)).svc.draftReply(user, { patientId: 'p-1' })).rejects.toThrow(/isn’t switched on/);
    await expect(build(ai(ok({})), [{ senderRole: 'CLINICIAN', content: 'Hello' }]).svc.draftReply(user, { patientId: 'p-1' })).rejects.toThrow(/no patient message/);
  });

  it('passes on a failure as a message for the user, and writes nothing', async () => {
    const { svc } = build(ai({ status: 'FAILED', reason: 'The AI helper isn’t available right now' }));
    await expect(svc.draftReply(user, { patientId: 'p-1' })).rejects.toThrow(BadRequestException);
  });
});

describe('MessageAssistService.translate', () => {
  const build = (aiMock: any, hit: any = null) => {
    const prisma: any = { message: { findUnique: jest.fn().mockResolvedValue({ id: 'm-1', content: 'Përshëndetje', patientId: 'p-1' }) }, aiOutput: { findUnique: jest.fn().mockResolvedValue(hit), upsert: jest.fn() } };
    return { prisma, svc: new MessageAssistService(prisma, aiMock, audit(), { get: () => undefined } as any) };
  };

  it('translates once and remembers it', async () => {
    const mock = ai(ok({ text: 'Hello', source_language: 'sq' }));
    const { svc, prisma } = build(mock);
    expect(await svc.translate(user, 'm-1', 'en')).toEqual({ text: 'Hello', sourceLanguage: 'sq', cached: false });
    expect(prisma.aiOutput.upsert).toHaveBeenCalled();
  });

  it('serves a remembered translation without asking again', async () => {
    const mock = ai(ok({}));
    const { svc } = build(mock, { output: { text: 'Hello', sourceLanguage: 'sq' } });
    expect(await svc.translate(user, 'm-1', 'en')).toEqual({ text: 'Hello', sourceLanguage: 'sq', cached: true });
    expect(mock.json).not.toHaveBeenCalled();
  });

  it('refuses a language it does not offer', async () => {
    await expect(build(ai(ok({}))).svc.translate(user, 'm-1', 'fr')).rejects.toThrow(/isn’t available/);
  });
});

describe('MessageUrgencyService.check', () => {
  const msg = (over: object = {}) => ({ id: 'm-1', content: 'I have chest pain', patientId: 'p-1', senderRole: 'PATIENT', aiCheckedAt: null, ...over });
  const build = (aiMock: any, message: any = msg()) => {
    const prisma: any = { message: { findUnique: jest.fn().mockResolvedValue(message), update: jest.fn().mockResolvedValue({}) } };
    return { prisma, svc: new MessageUrgencyService(prisma, aiMock) };
  };

  it('marks a message the AI thinks is urgent, with the reason', async () => {
    const { svc, prisma } = build(ai(ok({ urgent: true, reason: 'chest pain' })));
    expect(await svc.check('m-1')).toBe(true);
    expect(prisma.message.update).toHaveBeenCalledWith({ where: { id: 'm-1' }, data: { aiCheckedAt: expect.any(Date), aiUrgent: true, aiUrgentReason: 'chest pain' } });
  });

  it('records a routine message as checked, with no mark and no reason', async () => {
    const { svc, prisma } = build(ai(ok({ urgent: false, reason: 'ignore me' })));
    expect(await svc.check('m-1')).toBe(false);
    expect(prisma.message.update.mock.calls[0][0].data).toMatchObject({ aiUrgent: false, aiUrgentReason: null });
  });

  it('leaves the message exactly as it was when the check fails, is off, or does not apply', async () => {
    const failed = build(ai({ status: 'FAILED', reason: 'x' }));
    expect(await failed.svc.check('m-1')).toBe(false);
    expect(failed.prisma.message.update).not.toHaveBeenCalled();

    const off = build(ai(ok({ urgent: true, reason: '' }), false));
    expect(await off.svc.check('m-1')).toBe(false);
    expect(off.prisma.message.update).not.toHaveBeenCalled();

    for (const other of [msg({ senderRole: 'CLINICIAN' }), msg({ aiCheckedAt: new Date() }), msg({ content: '  ' })]) {
      const b = build(ai(ok({ urgent: true, reason: '' })), other);
      expect(await b.svc.check('m-1')).toBe(false);
      expect(b.prisma.message.update).not.toHaveBeenCalled();
    }
  });

  it('never throws, even if the database does', async () => {
    const { svc, prisma } = build(ai(ok({ urgent: true, reason: 'x' })));
    prisma.message.update.mockRejectedValue(new Error('db down'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(svc.check('m-1')).resolves.toBe(false);
  });
});

describe('MessageUrgencyService.sweep', () => {
  const build = (aiMock: any, rows: any[]) => {
    const prisma: any = { message: { findMany: jest.fn().mockResolvedValue(rows), findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) } };
    const svc = new MessageUrgencyService(prisma, aiMock);
    jest.spyOn(svc, 'check').mockImplementation(async (id: string) => id === 'm-urgent');
    return { prisma, svc };
  };

  it('picks up patient messages with no result yet, between two minutes and six hours old, a few at a time', async () => {
    const now = new Date('2026-10-12T12:00:00Z');
    const { prisma, svc } = build(ai(ok({})), [{ id: 'm-1' }, { id: 'm-urgent' }]);
    expect(await svc.sweep(now)).toBe(1);
    const where = prisma.message.findMany.mock.calls[0][0];
    expect(where.where).toMatchObject({ senderRole: 'PATIENT', aiCheckedAt: null });
    expect(where.where.sentAt).toEqual({ lte: new Date('2026-10-12T11:58:00Z'), gte: new Date('2026-10-12T06:00:00Z') });
    expect(where.take).toBe(20);
  });

  it('does nothing when the helper is off', async () => {
    const { prisma, svc } = build(ai(ok({}), false), [{ id: 'm-1' }]);
    expect(await svc.sweep()).toBe(0);
    expect(prisma.message.findMany).not.toHaveBeenCalled();
  });
});

describe('patient search', () => {
  it('keeps only filters the list has, with values it knows, and says what it could not do', () => {
    const { filters, unsupported } = sanitiseFilters({ programme: 'HRT', status: 'MADE_UP', quick: 'REPLY', medication: ' Wegovy ', text: '', bmiRange: '35+', joined: null, unsupported: ['lab results', 7, ' '] });
    expect(filters).toEqual({ programme: 'HRT', quick: 'REPLY', medication: 'Wegovy', bmiRange: '35+' });
    expect(unsupported).toEqual(['lab results']);
  });

  it('asks the AI with only what was typed', async () => {
    const mock = ai(ok({ programme: 'HRT', quick: 'REPLY', unsupported: [] }));
    const out = await new PatientSearchService(mock).interpret(' HRT patients waiting for a reply ');
    expect(mock.json.mock.calls[0][0].user).toBe('<request>HRT patients waiting for a reply</request>');
    expect(out.filters).toEqual({ programme: 'HRT', quick: 'REPLY' });
  });

  it('refuses a request that is too short or switched off', async () => {
    await expect(new PatientSearchService(ai(ok({}))).interpret('hi')).rejects.toThrow(/little more/);
    await expect(new PatientSearchService(ai(ok({}), false)).interpret('HRT patients')).rejects.toThrow(/isn’t switched on/);
  });
});
