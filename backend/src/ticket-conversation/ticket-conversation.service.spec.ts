import { TicketConversationService } from './ticket-conversation.service';

const cx = { id: 'cx-1', email: 'cx@x.com', role: 'CLINICIAN', clinicianRole: 'CX_TEAM' } as any;

function setup(ticket: any = { id: 't-1', patientId: 'p-1', type: 'BILLING' }) {
  const prisma: any = { message: { findMany: jest.fn().mockResolvedValue([{ id: 'm2' }, { id: 'm1' }]) }, supportThread: { findFirst: jest.fn().mockResolvedValue(null) } };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const messaging = { sendAs: jest.fn().mockResolvedValue({ id: 'm-new' }), sendToThread: jest.fn().mockResolvedValue({ id: 'm-thread' }) };
  const tickets = {
    get: jest.fn().mockResolvedValue(ticket),
    assertCanReply: jest.fn().mockResolvedValue(ticket),
    recordStaffReply: jest.fn().mockResolvedValue({ id: 't-1', status: 'WAITING_ON_PATIENT' }),
  };
  return { service: new TicketConversationService(prisma, audit as any, messaging as any, tickets as any), prisma, audit, messaging, tickets };
}

describe('TicketConversationService.conversation', () => {
  it('returns the patient’s messages oldest first', async () => {
    const { service } = setup();
    expect((await service.conversation(cx, 't-1')).map((m: any) => m.id)).toEqual(['m1', 'm2']);
  });

  it('is empty for a ticket with no patient', async () => {
    expect(await setup({ id: 't-1', patientId: null, type: 'OTHER' }).service.conversation(cx, 't-1')).toEqual([]);
  });

  it('records the read once, however often the screen refreshes', async () => {
    const { service, audit } = setup();
    await service.conversation(cx, 't-1');
    await service.conversation(cx, 't-1');
    await service.conversation(cx, 't-1');
    expect(audit.log).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'MESSAGES_VIEWED_FROM_TICKET', patientId: 'p-1' }));
  });

  it('refuses a ticket the reader may not see', async () => {
    const s = setup();
    s.tickets.get.mockRejectedValue(new Error('not yours'));
    await expect(s.service.conversation(cx, 't-1')).rejects.toThrow('not yours');
    expect(s.prisma.message.findMany).not.toHaveBeenCalled();
  });
});

describe('TicketConversationService.reply', () => {
  it('sends the message as the person signed in, then updates the ticket', async () => {
    const { service, messaging, tickets } = setup();
    const result: any = await service.reply(cx, 't-1', '  Your card was charged once.  ');
    expect(messaging.sendAs).toHaveBeenCalledWith(cx, expect.objectContaining({ patientId: 'p-1', content: 'Your card was charged once.' }));
    expect(tickets.recordStaffReply).toHaveBeenCalledWith(cx, 't-1');
    expect(result.ticket.status).toBe('WAITING_ON_PATIENT');
  });

  it('replies in the conversation the ticket came from, not the newest chat', async () => {
    const { service, messaging, prisma } = setup();
    prisma.supportThread.findFirst.mockResolvedValue({ patientId: 'p-1', consultationId: 'c-old' });
    await service.reply(cx, 't-1', 'Sorted now');
    expect(messaging.sendToThread).toHaveBeenCalledWith(cx, { patientId: 'p-1', consultationId: 'c-old' }, 'Sorted now');
    expect(messaging.sendAs).not.toHaveBeenCalled();
  });

  it('sends nothing when the reply is not allowed (a medical ticket answered by support)', async () => {
    const s = setup();
    s.tickets.assertCanReply.mockRejectedValue(new Error('A doctor needs to answer'));
    await expect(s.service.reply(cx, 't-1', 'Take half a dose')).rejects.toThrow(/doctor/);
    expect(s.messaging.sendAs).not.toHaveBeenCalled();
  });

  it('refuses an empty or very long reply', async () => {
    const { service, messaging } = setup();
    await expect(service.reply(cx, 't-1', '   ')).rejects.toThrow(/write something/i);
    await expect(service.reply(cx, 't-1', 'x'.repeat(2001))).rejects.toThrow(/too long/i);
    expect(messaging.sendAs).not.toHaveBeenCalled();
  });
});
