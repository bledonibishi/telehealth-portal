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
    patient: { findUniqueOrThrow: jest.fn().mockResolvedValue({ email: 'arta@example.com', firstName: 'Arta' }) },
  };
  prisma.$transaction = (fn: any) => fn(prisma);
  const audit = { log: jest.fn() };
  const email = { sendConsultationUpdateEmail: jest.fn() };
  const bookings: any = { register: jest.fn(), available: jest.fn().mockReturnValue(false), cancelFor: jest.fn() };
  const service = new AppointmentsService(prisma, audit as any, email as any, { get: jest.fn() } as any, bookings);
  service.onModuleInit();
  return { service, prisma, audit, email, bookings };
}

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
  });
});
