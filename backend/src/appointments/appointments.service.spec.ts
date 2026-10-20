import { AppointmentsService } from './appointments.service';
import { EMERGENCY_ADVICE } from './triage';

const row = (over: Record<string, unknown> = {}) => ({
  id: 'a-1', patientId: 'p-1', reason: 'QUESTION', details: 'Can I drink alcohol?', painLevel: null, redFlags: [], urgency: 'ROUTINE',
  emergencyAdvised: false, preferredTimes: null, status: 'REQUESTED', respondBy: new Date(), scheduledFor: null, meetingUrl: null,
  clinicianNote: null, handledById: null, cancelledAt: null, createdAt: new Date(), updatedAt: new Date(), ...over,
});

function build() {
  const prisma: any = {
    appointmentRequest: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(({ data }) => Promise.resolve(row(data))),
      findUnique: jest.fn().mockResolvedValue(row()),
      findUniqueOrThrow: jest.fn().mockResolvedValue(row({ status: 'SCHEDULED', handledBy: { firstName: 'Sarah', lastName: 'M' } })),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    patient: { findUniqueOrThrow: jest.fn().mockResolvedValue({ email: 'arta@example.com', firstName: 'Arta' }), findUnique: jest.fn().mockResolvedValue({ firstName: 'Arta', lastName: 'K' }) },
  };
  prisma.$transaction = (fn: any) => fn(prisma);
  const audit = { log: jest.fn() };
  const email = { sendConsultationUpdateEmail: jest.fn() };
  const bookings: any = { register: jest.fn(), available: jest.fn().mockReturnValue(false), cancelFor: jest.fn() };
  const notifier = { toStaff: jest.fn().mockResolvedValue(undefined), toPatient: jest.fn().mockResolvedValue(undefined), resolve: jest.fn().mockResolvedValue(undefined) };
  const service = new AppointmentsService(prisma, audit as any, email as any, { get: jest.fn() } as any, bookings, notifier as any);
  service.onModuleInit();
  return { service, prisma, audit, email, bookings, notifier };
}

describe('AppointmentsService paid consultations', () => {
  function paid(fee: string | undefined, invoice?: () => Promise<any>) {
    const b = build();
    const billing = { createConsultInvoice: invoice ? jest.fn(invoice) : jest.fn().mockResolvedValue({ invoiceId: 'in_1', url: 'https://pay/in_1', amountCents: 3000, currency: 'eur', paid: false }), voidSupplyInvoice: jest.fn() };
    const svc: any = b.service;
    svc.config = { get: jest.fn((k: string) => (k === 'CONSULT_FEE_CENTS' ? fee : undefined)) };
    svc.moduleRef = { get: jest.fn(() => billing) };
    b.prisma.appointmentRequest.update = jest.fn(({ data }) => Promise.resolve(row({ status: 'AWAITING_PAYMENT', ...data })));
    b.prisma.appointmentRequest.findFirst = jest.fn();
    return { ...b, svc, billing };
  }

  it('is free when no fee is set', async () => {
    const { svc, prisma, billing } = paid(undefined);
    await svc.request('p-1', { reason: 'CHECK_UP' });
    expect(prisma.appointmentRequest.create.mock.calls[0][0].data.status).toBeUndefined();
    expect(billing.createConsultInvoice).not.toHaveBeenCalled();
  });

  it('waits for payment, with an invoice, when a routine consultation is charged', async () => {
    const { svc, prisma, billing } = paid('3000');
    const res = await svc.request('p-1', { reason: 'CHECK_UP' });
    expect(prisma.appointmentRequest.create.mock.calls[0][0].data).toMatchObject({ status: 'AWAITING_PAYMENT', paymentAmountCents: 3000 });
    expect(billing.createConsultInvoice).toHaveBeenCalled();
    expect(res.status).toBe('AWAITING_PAYMENT');
    expect(res.paymentUrl).toBe('https://pay/in_1');
  });

  it('never charges for a symptom, pain, urgency or a warning sign', async () => {
    for (const input of [{ reason: 'SIDE_EFFECT' }, { reason: 'PAIN' }, { reason: 'CHECK_UP', urgent: true }, { reason: 'QUESTION', redFlags: ['chest_pain'] }]) {
      const { svc, prisma } = paid('3000');
      await svc.request('p-1', input);
      expect(prisma.appointmentRequest.create.mock.calls[0][0].data.status).toBeUndefined();
    }
  });

  it('goes to the doctors free when the invoice cannot be made', async () => {
    const { svc, prisma } = paid('3000', () => Promise.reject(new Error('stripe down')));
    const res = await svc.request('p-1', { reason: 'CHECK_UP' });
    expect(prisma.appointmentRequest.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'REQUESTED' }) }));
    expect(res.status).toBe('REQUESTED');
  });

  it('releases the request to the doctors when the invoice is paid, once', async () => {
    const { svc, prisma } = paid('3000');
    prisma.appointmentRequest.findFirst.mockResolvedValue(row({ status: 'AWAITING_PAYMENT' }));
    expect(await svc.markPaid('in_1')).toBe(true);
    expect(prisma.appointmentRequest.updateMany).toHaveBeenCalledWith({ where: { id: 'a-1', status: 'AWAITING_PAYMENT' }, data: { status: 'REQUESTED', paidAt: expect.any(Date) } });
    prisma.appointmentRequest.findFirst.mockResolvedValue(null);
    expect(await svc.markPaid('in_1')).toBe(false);
  });

  describe('refunds', () => {
    const paidRow = (over: Record<string, unknown> = {}) => row({ status: 'SCHEDULED', paidAt: new Date(), paymentInvoiceId: 'in_1', scheduledFor: new Date(Date.now() + 86_400_000), refundedAt: null, refundOfferedAt: null, ...over });
    function refundable(found: any) {
      const b = paid('3000');
      b.prisma.appointmentRequest.findUnique.mockResolvedValue(found);
      b.prisma.appointmentRequest.findUniqueOrThrow.mockResolvedValue(found);
      (b.billing as any).refundConsultInvoice = jest.fn().mockResolvedValue({ refundId: 're_1' });
      return b;
    }

    it('refunds a patient who cancels before the consultation starts', async () => {
      const { svc, prisma, billing } = refundable(paidRow());
      await svc.cancelMine('p-1', 'a-1');
      expect((billing as any).refundConsultInvoice).toHaveBeenCalledWith('in_1');
      expect(prisma.appointmentRequest.updateMany).toHaveBeenCalledWith({ where: { id: 'a-1', paidAt: { not: null }, refundedAt: null }, data: { refundedAt: expect.any(Date) } });
    });

    it('does not refund, or cancel, once the consultation has started', async () => {
      const { svc, billing, bookings } = refundable(paidRow({ scheduledFor: new Date(Date.now() - 60_000) }));
      await expect(svc.cancelMine('p-1', 'a-1')).rejects.toThrow(/already started/);
      expect((billing as any).refundConsultInvoice).not.toHaveBeenCalled();
      expect(bookings.cancelFor).not.toHaveBeenCalled();
    });

    it('keeps the request open when the refund fails', async () => {
      const { svc, billing, bookings, prisma } = refundable(paidRow());
      (billing as any).refundConsultInvoice.mockRejectedValue(new Error('stripe down'));
      await expect(svc.cancelMine('p-1', 'a-1')).rejects.toThrow(/couldn’t refund/);
      expect(bookings.cancelFor).not.toHaveBeenCalled();
      expect(prisma.appointmentRequest.updateMany).toHaveBeenLastCalledWith({ where: { id: 'a-1' }, data: { refundedAt: null } });
    });

    it('asks the patient to choose when the doctor cancels a booked, paid time', async () => {
      const { svc, prisma, billing } = refundable(paidRow());
      await svc.cancel('doc-1', 'a-1', 'Sorry, I am ill');
      expect((billing as any).refundConsultInvoice).not.toHaveBeenCalled();
      expect(prisma.appointmentRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'CANCELLED', refundOfferedAt: expect.any(Date) }) }));
    });

    it('refunds at once when the doctor turns down a paid request that had no time yet', async () => {
      const { svc, billing } = refundable(paidRow({ status: 'REQUESTED', scheduledFor: null }));
      await svc.cancel('doc-1', 'a-1', 'Answered in messages');
      expect((billing as any).refundConsultInvoice).toHaveBeenCalledWith('in_1');
    });

    it('lets the patient take the refund, or keep the payment for a new time', async () => {
      const offered = paidRow({ status: 'CANCELLED', refundOfferedAt: new Date(), scheduledFor: null });
      const a = refundable(offered);
      await a.svc.chooseRefund('p-1', 'a-1');
      expect((a.billing as any).refundConsultInvoice).toHaveBeenCalledWith('in_1');
      const b = refundable(offered);
      await b.svc.chooseReschedule('p-1', 'a-1');
      expect(b.prisma.appointmentRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'REQUESTED', refundOfferedAt: null }) }));
      expect((b.billing as any).refundConsultInvoice).not.toHaveBeenCalled();
    });

    it('has nothing to choose when no refund was offered', async () => {
      const { svc } = refundable(paidRow());
      await expect(svc.chooseRefund('p-1', 'a-1')).rejects.toThrow(/nothing to choose/);
    });
  });

  it('withdraws unpaid requests, with their invoices, after a week', async () => {
    const { svc, prisma, billing } = paid('3000');
    prisma.appointmentRequest.findMany.mockResolvedValue([row({ status: 'AWAITING_PAYMENT', paymentInvoiceId: 'in_1' })]);
    expect(await svc.expireUnpaid()).toBe(1);
    expect(billing.voidSupplyInvoice).toHaveBeenCalledWith('in_1');
  });
});

describe('AppointmentsService', () => {
  describe('request', () => {
    it('saves the triaged urgency, never one the client sent, and audits it', async () => {
      const { service, prisma, audit } = build();
      const res = await service.request('p-1', { reason: 'PAIN' as any, details: ' Sharp pain ', painLevel: 8 });
      expect(prisma.appointmentRequest.create.mock.calls[0][0].data).toMatchObject({ patientId: 'p-1', details: 'Sharp pain', urgency: 'URGENT', emergencyAdvised: false });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'APPOINTMENT_REQUESTED', patientId: 'p-1' }), prisma);
      expect(res.advice).toBeNull();
    });

    it('tells the patient to call 112 when they tick a warning sign', async () => {
      const { service } = build();
      expect((await service.request('p-1', { reason: 'SIDE_EFFECT' as any, details: 'Pain', redFlags: ['chest_pain'] })).advice).toBe(EMERGENCY_ADVICE);
    });

    it('needs only a reason: words are optional', async () => {
      const { service, prisma } = build();
      await service.request('p-1', { reason: 'CHECK_UP' as any });
      expect(prisma.appointmentRequest.create.mock.calls[0][0].data).toMatchObject({ reason: 'CHECK_UP', details: '', urgency: 'ROUTINE' });
    });

    it('refuses bad pain scores, unknown warning signs and too many waiting requests', async () => {
      const { service, prisma } = build();
      await expect(service.request('p-1', { reason: 'PAIN' as any, details: 'x', painLevel: 11 })).rejects.toThrow(/0 to 10/);
      await expect(service.request('p-1', { reason: 'PAIN' as any, details: 'x', redFlags: ['nope'] })).rejects.toThrow(/Unknown/);
      prisma.appointmentRequest.count.mockResolvedValue(3);
      await expect(service.request('p-1', { reason: 'QUESTION' as any, details: 'x' })).rejects.toThrow(/already have requests/);
    });
  });

  it('lets a patient cancel only their own request', async () => {
    const { service, prisma } = build();
    prisma.appointmentRequest.findUnique.mockResolvedValue(row({ patientId: 'someone-else' }));
    await expect(service.cancelMine('p-1', 'a-1')).rejects.toThrow(/not found/);
  });

  describe('schedule', () => {
    it('books it conditionally, records who did, and emails the patient', async () => {
      const { service, prisma, email } = build();
      const res = await service.schedule('doc-1', { id: 'a-1', scheduledFor: new Date('2026-10-06T10:00:00Z'), meetingUrl: 'https://meet.example/x' });
      expect(prisma.appointmentRequest.updateMany).toHaveBeenCalledWith({
        where: { id: 'a-1', status: { in: ['REQUESTED', 'SCHEDULED'] } },
        data: expect.objectContaining({ status: 'SCHEDULED', handledById: 'doc-1', meetingUrl: 'https://meet.example/x' }),
      });
      expect(email.sendConsultationUpdateEmail).toHaveBeenCalledWith('arta@example.com', 'Arta', 'Your appointment is booked', expect.stringContaining('/appointments'));
      expect(res.clinicianName).toBe('Dr. Sarah M');
    });

    it('refuses a non-https meeting link, and a request someone else already closed', async () => {
      const { service, prisma } = build();
      await expect(service.schedule('doc-1', { id: 'a-1', scheduledFor: new Date(), meetingUrl: 'http://x' })).rejects.toThrow(/https/);
      prisma.appointmentRequest.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.schedule('doc-1', { id: 'a-1', scheduledFor: new Date() })).rejects.toThrow(/already/);
    });

    it('keeps the booking when the email fails', async () => {
      const { service, email } = build();
      email.sendConsultationUpdateEmail.mockRejectedValue(new Error('Resend down'));
      await expect(service.schedule('doc-1', { id: 'a-1', scheduledFor: new Date() })).resolves.toMatchObject({ status: 'SCHEDULED' });
    });
  });

  it('lists urgent first and marks requests past their respond-by time', async () => {
    const { service, prisma } = build();
    const now = new Date('2026-10-05T12:00:00Z');
    prisma.appointmentRequest.findMany.mockResolvedValue([
      row({ id: 'routine', urgency: 'ROUTINE', respondBy: new Date('2026-10-05T13:00:00Z'), patient: { firstName: 'A', lastName: 'B' } }),
      row({ id: 'urgent', urgency: 'URGENT', respondBy: new Date('2026-10-05T11:00:00Z'), patient: { firstName: 'C', lastName: 'D' } }),
    ]);
    const list = await service.open(now);
    expect(list.map((a) => [a.id, a.overdue])).toEqual([['urgent', true], ['routine', false]]);
  });

  it('needs a reason to turn a request down', async () => {
    await expect(build().service.cancel('doc-1', 'a-1', ' ')).rejects.toThrow(/why/);
  });

  describe('online booking', () => {
    const purpose = (b: any, key: string) => b.register.mock.calls[0].find((p: any) => p.key === key);
    const booking = (over: Record<string, unknown> = {}) => ({ referenceId: 'a-1', status: 'CONFIRMED', startsAt: new Date('2026-10-07T09:30:00Z'), meetingUrl: 'https://cal.example/v/1', clinicianId: 'doc-1', ...over });

    it('offers the diary that matches the request’s urgency, only while scheduling is set up', async () => {
      const { service, prisma, bookings } = build();
      prisma.appointmentRequest.findMany.mockResolvedValue([row({ urgency: 'URGENT' })]);
      expect((await service.mine('p-1'))[0].bookingPurpose).toBeNull();
      bookings.available.mockReturnValue(true);
      expect((await service.mine('p-1'))[0].bookingPurpose).toBe('APPOINTMENT_URGENT');
    });

    it('lets a patient book only their own open request, and only in the diary triage gave it', async () => {
      const { prisma, bookings } = build();
      const routine = purpose(bookings, 'APPOINTMENT_ROUTINE'), urgent = purpose(bookings, 'APPOINTMENT_URGENT');
      await expect(routine.authorize('p-1', 'a-1')).resolves.toBeUndefined();
      await expect(urgent.authorize('p-1', 'a-1')).rejects.toThrow(/diary/);
      await expect(routine.authorize('someone-else', 'a-1')).rejects.toThrow(/not found/);
      prisma.appointmentRequest.findUnique.mockResolvedValue(row({ status: 'COMPLETED' }));
      await expect(routine.authorize('p-1', 'a-1')).rejects.toThrow(/already completed/);
    });

    it('tells the doctor the category and urgency on the booking, never what the patient wrote', async () => {
      const { prisma, bookings } = build();
      prisma.appointmentRequest.findUnique.mockResolvedValue(row({ reason: 'SIDE_EFFECT', urgency: 'URGENT', details: 'Private words' }));
      const note = await purpose(bookings, 'APPOINTMENT_URGENT').describe('p-1', 'a-1');
      expect(note).toMatch(/^Reason: Side effect · URGENT\./);
      expect(note).not.toContain('Private words');
    });

    it('marks the request booked when a time is confirmed, with the host and the call link', async () => {
      const { prisma, bookings } = build();
      await purpose(bookings, 'APPOINTMENT_ROUTINE').onChange(booking());
      expect(prisma.appointmentRequest.updateMany).toHaveBeenCalledWith({
        where: { id: 'a-1', status: { in: ['REQUESTED', 'SCHEDULED'] } },
        data: { status: 'SCHEDULED', scheduledFor: new Date('2026-10-07T09:30:00Z'), meetingUrl: 'https://cal.example/v/1', handledById: 'doc-1' },
      });
    });

    it('does nothing when the provider repeats a confirmation', async () => {
      const { prisma, bookings } = build();
      prisma.appointmentRequest.findUnique.mockResolvedValue(row({ status: 'SCHEDULED', scheduledFor: new Date('2026-10-07T09:30:00Z'), meetingUrl: 'https://cal.example/v/1' }));
      await purpose(bookings, 'APPOINTMENT_ROUTINE').onChange(booking());
      expect(prisma.appointmentRequest.updateMany).not.toHaveBeenCalled();
    });

    it('puts the request back in the queue when its booked time is cancelled — but not for a time it has already moved on from', async () => {
      const { prisma, bookings } = build();
      const scheduled = row({ status: 'SCHEDULED', scheduledFor: new Date('2026-10-07T09:30:00Z') });
      prisma.appointmentRequest.findUnique.mockResolvedValue(scheduled);
      await purpose(bookings, 'APPOINTMENT_ROUTINE').onChange(booking({ status: 'CANCELLED', startsAt: new Date('2026-10-01T09:30:00Z') }));
      expect(prisma.appointmentRequest.updateMany).not.toHaveBeenCalled();
      await purpose(bookings, 'APPOINTMENT_ROUTINE').onChange(booking({ status: 'CANCELLED' }));
      expect(prisma.appointmentRequest.updateMany).toHaveBeenCalledWith({ where: { id: 'a-1', status: { in: ['SCHEDULED'] } }, data: { status: 'REQUESTED', scheduledFor: null, meetingUrl: null } });
    });

    it('frees the booked slot when the patient withdraws the request', async () => {
      const { service, bookings } = build();
      await service.cancelMine('p-1', 'a-1');
      expect(bookings.cancelFor).toHaveBeenCalledWith(['APPOINTMENT_ROUTINE', 'APPOINTMENT_URGENT'], 'a-1', expect.objectContaining({ actorId: 'p-1' }), expect.any(String), 'p-1');
    });

    it('tells the doctors again when an urgent request goes back to waiting, and keeps its alert open', async () => {
      const { prisma, bookings, notifier } = build();
      prisma.appointmentRequest.findUnique.mockResolvedValue(row({ urgency: 'URGENT', status: 'SCHEDULED', scheduledFor: new Date('2026-10-07T09:30:00Z') }));
      await purpose(bookings, 'APPOINTMENT_URGENT').onChange(booking({ status: 'CANCELLED' }));
      expect(notifier.resolve).not.toHaveBeenCalled();
      expect(notifier.toStaff).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ kind: 'URGENT_APPOINTMENT', groupKey: 'appt:a-1', email: true }));
    });

    it('does not alert anyone when a routine request goes back to waiting', async () => {
      const { prisma, bookings, notifier } = build();
      prisma.appointmentRequest.findUnique.mockResolvedValue(row({ status: 'SCHEDULED', scheduledFor: new Date('2026-10-07T09:30:00Z') }));
      await purpose(bookings, 'APPOINTMENT_ROUTINE').onChange(booking({ status: 'CANCELLED' }));
      expect(notifier.toStaff).not.toHaveBeenCalled();
    });

    it('closes the alert once the request is booked', async () => {
      const { prisma, bookings, notifier } = build();
      prisma.appointmentRequest.findUnique.mockResolvedValue(row({ urgency: 'URGENT' }));
      await purpose(bookings, 'APPOINTMENT_URGENT').onChange(booking({ status: 'CONFIRMED' }));
      expect(notifier.resolve).toHaveBeenCalledWith('appt:a-1');
    });
  });
});
