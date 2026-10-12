import { Prisma } from '@prisma/client';
import { BookingService } from './booking.service';
import { signBookingToken, verifyBookingToken } from './booking-token';
import type { ProviderBookingEvent } from './calcom/calcom-webhook';

const SECRET = 'jwt-secret';
const SENT = new Date('2026-10-05T10:00:00Z');
const START = new Date('2026-10-07T09:30:00Z');
const END = new Date('2026-10-07T09:45:00Z');

const evt = (over: Partial<ProviderBookingEvent> = {}): ProviderBookingEvent => ({
  trigger: 'BOOKING_CREATED', uid: 'bk_1', status: 'CONFIRMED', rescheduledFromUid: null, startsAt: START, endsAt: END,
  title: 'Appointment', attendeeName: 'Sofia Meyer', attendeeEmail: 'sofia@example.com', hostName: 'David Chen', hostEmail: 'doctor@clinic.dev',
  meetingUrl: 'https://cal.example/v/1', location: null, cancelReason: null, eventTypeSlug: 'routine', eventLink: 'clinic/routine', bookedAt: SENT,
  token: signBookingToken({ patientId: 'p-1', purpose: 'APPOINTMENT_ROUTINE', referenceId: 'a-1' }, SECRET, SENT.getTime()), sentAt: SENT, ...over,
});
const row = (over: Record<string, unknown> = {}) => ({
  id: 'b-1', providerUid: 'bk_1', purpose: 'APPOINTMENT_ROUTINE', referenceId: 'a-1', patientId: 'p-1', clinicianId: 'doc-1', status: 'CONFIRMED',
  startsAt: new Date(Date.now() + 86_400_000), endsAt: new Date(Date.now() + 87_000_000), providerUpdatedAt: SENT, title: null, meetingUrl: null,
  location: null, hostName: null, cancelReason: null, attendeeName: null, attendeeEmail: null, eventLink: 'clinic/routine', ...over,
});

function build(env: Record<string, string> = {}) {
  const settings: Record<string, string> = { JWT_SECRET: SECRET, CALCOM_EVENT_APPOINTMENT_ROUTINE: 'clinic/routine', ...env };
  const prisma: any = {
    booking: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(({ data }) => Promise.resolve({ id: 'b-new', ...data })),
      update: jest.fn(({ data }) => Promise.resolve({ ...row(), ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    patient: { findUnique: jest.fn().mockResolvedValue({ id: 'p-1', email: 'Sofia@example.com' }), findUniqueOrThrow: jest.fn().mockResolvedValue({ firstName: 'Sofia', lastName: 'Meyer', email: 'sofia@example.com' }) },
    clinician: { findFirst: jest.fn().mockResolvedValue({ id: 'doc-1' }) },
  };
  prisma.$transaction = (fn: any) => fn(prisma);
  const audit = { log: jest.fn() };
  const calcom = { configured: true, cancel: jest.fn().mockResolvedValue({}), listForAttendee: jest.fn().mockResolvedValue([]), get: jest.fn() };
  const service = new BookingService(prisma, audit as any, { get: (k: string) => settings[k] } as any, calcom as any);
  const onChange = jest.fn();
  const authorize = jest.fn();
  service.register({ key: 'APPOINTMENT_ROUTINE', label: 'An appointment', requiresReference: true, authorize, onChange });
  return { service, prisma, audit, calcom, onChange, authorize };
}

describe('BookingService', () => {
  describe('session', () => {
    it('gives the scheduler the event, the patient’s details and a token that proves who is booking what', async () => {
      const { service, authorize } = build({ CALCOM_ORIGIN: 'https://app.cal.eu/' });
      const s = await service.session('p-1', 'APPOINTMENT_ROUTINE', 'a-1');
      expect(authorize).toHaveBeenCalledWith('p-1', 'a-1');
      expect(s).toMatchObject({ calLink: 'clinic/routine', calOrigin: 'https://app.cal.eu', name: 'Sofia Meyer', email: 'sofia@example.com', label: 'An appointment', current: null });
      expect(verifyBookingToken(s!.token, SECRET)).toEqual({ patientId: 'p-1', purpose: 'APPOINTMENT_ROUTINE', referenceId: 'a-1' });
    });

    it('passes on the owner’s short line for the host, trimmed to a label’s length', async () => {
      const withNote = build({ CALCOM_EVENT_LAB_REVIEW: 'clinic/lab' });
      withNote.service.register({ key: 'LAB_REVIEW', label: 'A call', describe: async () => `  Reason: Bloods ${'x'.repeat(400)}` });
      const session = await withNote.service.session('p-1', 'LAB_REVIEW');
      expect(session!.notes).toHaveLength(200);
      expect(session!.notes!.startsWith('Reason: Bloods')).toBe(true);
    });

    it('is null while the purpose has no event configured, and falls back to the default event', async () => {
      expect(await build({ CALCOM_EVENT_APPOINTMENT_ROUTINE: '' }).service.session('p-1', 'APPOINTMENT_ROUTINE', 'a-1')).toBeNull();
      expect((await build({ CALCOM_EVENT_DEFAULT: 'clinic/call' }).service.session('p-1', 'GENERAL'))?.calLink).toBe('clinic/call');
    });

    it('refuses an unknown purpose, a missing reference, and whatever the owner refuses', async () => {
      const { service, authorize } = build();
      await expect(service.session('p-1', 'NOPE')).rejects.toThrow(/Unknown/);
      await expect(service.session('p-1', 'APPOINTMENT_ROUTINE')).rejects.toThrow(/needs to be made/);
      authorize.mockRejectedValue(new Error('not yours'));
      await expect(service.session('p-1', 'APPOINTMENT_ROUTINE', 'a-9')).rejects.toThrow('not yours');
    });

    it('will not accept a purpose key that could collide with a setting name', () => {
      expect(() => build().service.register({ key: 'bad key', label: 'x' })).toThrow(/UPPER_SNAKE_CASE/);
    });
  });

  describe('applyProviderEvent', () => {
    it('records a booking made from the portal against the patient, purpose and reference in its token, and tells the owner', async () => {
      const { service, prisma, audit, onChange } = build();
      await service.applyProviderEvent(evt());
      expect(prisma.booking.create.mock.calls[0][0].data).toMatchObject({ providerUid: 'bk_1', purpose: 'APPOINTMENT_ROUTINE', referenceId: 'a-1', patientId: 'p-1', clinicianId: 'doc-1', status: 'CONFIRMED', startsAt: START, meetingUrl: 'https://cal.example/v/1' });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'BOOKING_CONFIRMED', patientId: 'p-1' }), prisma);
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ providerUid: 'bk_1' }));
    });

    it('never attaches a booking to a patient without a valid token, however it is labelled', async () => {
      const { service, prisma, onChange } = build();
      const forged = signBookingToken({ patientId: 'p-victim', purpose: 'APPOINTMENT_ROUTINE', referenceId: 'a-1' }, 'attacker', SENT.getTime());
      for (const token of [null, forged, 'garbage']) await service.applyProviderEvent(evt({ token }));
      expect(prisma.booking.create).toHaveBeenCalledTimes(3);
      for (const [call] of prisma.booking.create.mock.calls) expect(call.data).toMatchObject({ patientId: null, referenceId: null, purpose: 'UNLINKED' });
      expect(onChange).not.toHaveBeenCalled();
    });

    it('drops a message older than the last one applied', async () => {
      const { service, prisma } = build();
      prisma.booking.findUnique.mockResolvedValue(row({ status: 'CANCELLED', providerUpdatedAt: new Date('2026-10-05T11:00:00Z') }));
      await service.applyProviderEvent(evt());
      expect(prisma.booking.update).not.toHaveBeenCalled();
      expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    it('on a reschedule retires the old booking and gives the new one the same patient, purpose and reference', async () => {
      const { service, prisma } = build();
      prisma.booking.findUnique.mockImplementation(({ where }: any) => Promise.resolve(where.providerUid === 'bk_1' ? row() : null));
      await service.applyProviderEvent(evt({ trigger: 'BOOKING_RESCHEDULED', uid: 'bk_2', rescheduledFromUid: 'bk_1', token: null }));
      expect(prisma.booking.update).toHaveBeenCalledWith({ where: { id: 'b-1' }, data: expect.objectContaining({ status: 'RESCHEDULED' }) });
      expect(prisma.booking.create.mock.calls[0][0].data).toMatchObject({ providerUid: 'bk_2', patientId: 'p-1', purpose: 'APPOINTMENT_ROUTINE', referenceId: 'a-1', rescheduledFromUid: 'bk_1' });
    });

    it('updates the status of a booking it has, without re-auditing an unchanged one', async () => {
      const { service, prisma, audit } = build();
      prisma.booking.findUnique.mockResolvedValue(row({ providerUpdatedAt: new Date('2026-10-05T09:00:00Z') }));
      await service.applyProviderEvent(evt({ trigger: 'BOOKING_CANCELLED', status: 'CANCELLED', cancelReason: 'Feeling better', startsAt: null, endsAt: null }));
      // A cancellation carries no times: it must update the row it has, never try to create one.
      expect(prisma.booking.update).toHaveBeenCalledWith({ where: { id: 'b-1' }, data: expect.objectContaining({ status: 'CANCELLED', cancelReason: 'Feeling better' }) });
      expect(prisma.booking.update.mock.calls[0][0].data).not.toHaveProperty('startsAt');
      expect(prisma.booking.create).not.toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledTimes(1);
      audit.log.mockClear();
      prisma.booking.findUnique.mockResolvedValue(row({ status: 'CANCELLED', providerUpdatedAt: new Date('2026-10-05T09:00:00Z') }));
      await service.applyProviderEvent(evt({ trigger: 'BOOKING_CANCELLED', status: 'CANCELLED' }));
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('ignores a cancellation for a booking it never saw, and a token naming a patient who does not exist', async () => {
      const { service, prisma } = build();
      await service.applyProviderEvent(evt({ trigger: 'BOOKING_CANCELLED', status: 'CANCELLED', startsAt: null, endsAt: null }));
      prisma.patient.findUnique.mockResolvedValue(null);
      await service.applyProviderEvent(evt());
      expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    it('applies a message on top when another one created the same booking first', async () => {
      const { service, prisma } = build();
      prisma.booking.create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
      prisma.booking.findUnique.mockResolvedValueOnce(null).mockResolvedValue(row({ providerUpdatedAt: new Date('2026-10-05T09:00:00Z') }));
      await expect(service.applyProviderEvent(evt())).resolves.toMatchObject({ status: 'CONFIRMED' });
      expect(prisma.booking.update).toHaveBeenCalled();
    });

    it('keeps the booking when the owner’s handler fails', async () => {
      const { service, onChange } = build();
      onChange.mockRejectedValue(new Error('handler down'));
      await expect(service.applyProviderEvent(evt())).resolves.toMatchObject({ providerUid: 'bk_1' });
    });
  });

  describe('cancel', () => {
    it('frees the slot at the provider, marks it cancelled here, audits it and tells the owner', async () => {
      const { service, prisma, calcom, audit, onChange } = build();
      prisma.booking.findUnique.mockResolvedValue(row());
      prisma.booking.findUniqueOrThrow.mockResolvedValue(row({ status: 'CANCELLED' }));
      expect(await service.cancelMine('p-1', 'bk_1', 'Feeling better')).toMatchObject({ status: 'CANCELLED', canReschedule: false });
      expect(calcom.cancel).toHaveBeenCalledWith('bk_1', 'Feeling better');
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'BOOKING_CANCELLED', actorId: 'p-1' }));
      expect(onChange).toHaveBeenCalled();
    });

    it('is "not found" for someone else’s booking, and leaves ours untouched when the provider refuses', async () => {
      const { service, prisma, calcom } = build();
      prisma.booking.findUnique.mockResolvedValue(row({ patientId: 'someone-else' }));
      await expect(service.cancelMine('p-1', 'bk_1')).rejects.toThrow(/not found/);
      prisma.booking.findUnique.mockResolvedValue(row());
      calcom.cancel.mockRejectedValue(new Error('provider down'));
      await expect(service.cancelMine('p-1', 'bk_1')).rejects.toThrow('provider down');
      expect(prisma.booking.updateMany).not.toHaveBeenCalled();
    });

    it('cancels for a reference without telling the owner that asked, and does nothing when nothing is booked', async () => {
      const { service, prisma, calcom, onChange } = build();
      await service.cancelFor(['APPOINTMENT_ROUTINE'], 'a-1', { actorId: 'doc-1', actorRole: 'CLINICIAN' as any });
      expect(calcom.cancel).not.toHaveBeenCalled();
      prisma.booking.findFirst.mockResolvedValue(row());
      prisma.booking.findUniqueOrThrow.mockResolvedValue(row({ status: 'CANCELLED' }));
      await service.cancelFor(['APPOINTMENT_ROUTINE'], 'a-1', { actorId: 'doc-1', actorRole: 'CLINICIAN' as any });
      expect(calcom.cancel).toHaveBeenCalledWith('bk_1', undefined);
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  it('asks the provider before cancelling for a reference, so a booking we never heard about is not left behind', async () => {
    const { service, prisma, calcom } = build();
    const token = signBookingToken({ patientId: 'p-1', purpose: 'APPOINTMENT_ROUTINE', referenceId: 'a-1' }, SECRET);
    calcom.listForAttendee.mockResolvedValue([{ uid: 'bk_9', status: 'accepted', start: new Date(Date.now() + 86_400_000).toISOString(), end: new Date(Date.now() + 87_000_000).toISOString(), attendees: [{ email: 'sofia@example.com' }], metadata: { bookingToken: token }, createdAt: new Date().toISOString() }]);
    prisma.booking.findFirst.mockImplementation(() => Promise.resolve(prisma.booking.create.mock.calls.length ? row({ providerUid: 'bk_9' }) : null));
    prisma.booking.findUniqueOrThrow.mockResolvedValue(row({ providerUid: 'bk_9', status: 'CANCELLED' }));
    await service.cancelFor(['APPOINTMENT_ROUTINE'], 'a-1', { actorId: 'p-1', actorRole: 'PATIENT' as any }, 'Withdrawn', 'p-1');
    expect(prisma.booking.create).toHaveBeenCalled();
    expect(calcom.cancel).toHaveBeenCalledWith('bk_9', 'Withdrawn');
  });

  describe('syncForPatient', () => {
    const api = (over: Record<string, unknown> = {}) => ({
      uid: 'bk_9', status: 'accepted', start: new Date(Date.now() + 86_400_000).toISOString(), end: new Date(Date.now() + 87_000_000).toISOString(),
      title: 'Routine', hosts: [{ name: 'David Chen', email: 'doctor@clinic.dev', username: 'clinic' }], attendees: [{ name: 'Sofia Meyer', email: 'sofia@example.com' }],
      meetingUrl: 'https://cal.example/v/9', eventType: { slug: 'routine' }, metadata: {}, createdAt: new Date().toISOString(), ...over,
    });

    it('records a booking the webhook never told us about, and tells the owner', async () => {
      const { service, prisma, calcom, onChange } = build();
      const token = signBookingToken({ patientId: 'p-1', purpose: 'APPOINTMENT_ROUTINE', referenceId: 'a-1' }, SECRET);
      calcom.listForAttendee.mockResolvedValue([api({ metadata: { bookingToken: token } })]);
      await service.syncForPatient('p-1');
      expect(calcom.listForAttendee).toHaveBeenCalledWith('Sofia@example.com', expect.any(Date));
      expect(prisma.booking.create.mock.calls[0][0].data).toMatchObject({ providerUid: 'bk_9', patientId: 'p-1', purpose: 'APPOINTMENT_ROUTINE', referenceId: 'a-1', status: 'CONFIRMED', eventLink: 'clinic/routine' });
      expect(onChange).toHaveBeenCalled();
    });

    it('still believes a token when the booking is found long after it was made', async () => {
      const { service, prisma, calcom } = build();
      const booked = Date.now() - 5 * 86_400_000;
      const token = signBookingToken({ patientId: 'p-1', purpose: 'APPOINTMENT_ROUTINE', referenceId: 'a-1' }, SECRET, booked);
      calcom.listForAttendee.mockResolvedValue([api({ metadata: { bookingToken: token }, createdAt: new Date(booked + 60_000).toISOString() })]);
      await service.syncForPatient('p-1');
      expect(prisma.booking.create.mock.calls[0][0].data).toMatchObject({ referenceId: 'a-1', purpose: 'APPOINTMENT_ROUTINE' });
    });

    it('gives a booking made outside the portal to the patient whose email it is under, by event, with no reference', async () => {
      const { service, prisma, calcom } = build();
      calcom.listForAttendee.mockResolvedValue([api(), api({ uid: 'bk_other', eventType: { slug: 'something-else' } })]);
      await service.syncForPatient('p-1');
      expect(prisma.booking.create.mock.calls[0][0].data).toMatchObject({ patientId: 'p-1', purpose: 'APPOINTMENT_ROUTINE', referenceId: null });
      expect(prisma.booking.create.mock.calls[1][0].data).toMatchObject({ patientId: 'p-1', purpose: 'GENERAL', referenceId: null });
    });

    it('takes ownership of a booking a webhook recorded unowned, once it is found under the patient’s email', async () => {
      const { service, prisma, calcom } = build();
      const held = row({ patientId: null, purpose: 'UNLINKED', referenceId: null, providerUpdatedAt: new Date(Date.now() - 60_000) });
      prisma.booking.findUnique.mockResolvedValue(held);
      calcom.listForAttendee.mockResolvedValue([api({ uid: 'bk_1', start: held.startsAt.toISOString(), end: held.endsAt.toISOString() })]);
      await service.syncForPatient('p-1');
      expect(prisma.booking.update).toHaveBeenCalledWith({ where: { id: 'b-1' }, data: expect.objectContaining({ patientId: 'p-1', purpose: 'APPOINTMENT_ROUTINE' }) });
    });

    it('ignores a listed booking that is under a different email', async () => {
      const { service, prisma, calcom } = build();
      calcom.listForAttendee.mockResolvedValue([api({ attendees: [{ email: 'sofia+other@example.com' }] })]);
      await service.syncForPatient('p-1');
      expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    it('learns that a booking we hold was cancelled at the provider', async () => {
      const { service, prisma, calcom } = build();
      prisma.booking.findUnique.mockResolvedValue(row({ providerUpdatedAt: new Date(Date.now() - 60_000) }));
      calcom.listForAttendee.mockResolvedValue([api({ uid: 'bk_1', status: 'cancelled', cancellationReason: 'Host away' })]);
      await service.syncForPatient('p-1');
      expect(prisma.booking.update).toHaveBeenCalledWith({ where: { id: 'b-1' }, data: expect.objectContaining({ status: 'CANCELLED', cancelReason: 'Host away' }) });
    });

    it('writes nothing and tells nobody when the provider agrees with what we hold', async () => {
      const { service, prisma, calcom, onChange, audit } = build();
      const held = row({ providerUpdatedAt: new Date(Date.now() - 60_000), meetingUrl: 'https://cal.example/v/9' });
      prisma.booking.findUnique.mockResolvedValue(held);
      calcom.listForAttendee.mockResolvedValue([api({ uid: 'bk_1', start: held.startsAt.toISOString(), end: held.endsAt.toISOString() })]);
      await service.syncForPatient('p-1');
      expect(prisma.booking.update).not.toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('looks up a live booking the list no longer shows', async () => {
      const { service, prisma, calcom } = build();
      prisma.booking.findMany.mockResolvedValue([{ providerUid: 'bk_1' }]);
      prisma.booking.findUnique.mockResolvedValue(row({ providerUpdatedAt: new Date(Date.now() - 60_000) }));
      calcom.get.mockResolvedValue(api({ uid: 'bk_1', status: 'cancelled' }));
      await service.syncForPatient('p-1');
      expect(calcom.get).toHaveBeenCalledWith('bk_1');
      expect(prisma.booking.update).toHaveBeenCalledWith({ where: { id: 'b-1' }, data: expect.objectContaining({ status: 'CANCELLED' }) });
    });

    it('asks the provider at most once every few seconds per patient, and never throws', async () => {
      const { service, calcom } = build();
      calcom.listForAttendee.mockRejectedValue(new Error('provider down'));
      await expect(service.syncForPatient('p-1')).resolves.toBeUndefined();
      await service.syncForPatient('p-1');
      expect(calcom.listForAttendee).toHaveBeenCalledTimes(1);
      await service.syncForPatient('p-2');
      expect(calcom.listForAttendee).toHaveBeenCalledTimes(2);
    });

    it('does nothing while no API key is set', async () => {
      const { service, calcom } = build();
      calcom.configured = false;
      await service.syncForPatient('p-1');
      expect(calcom.listForAttendee).not.toHaveBeenCalled();
    });
  });

  describe('rescheduleSession', () => {
    it('opens the booking’s own event on that booking, for its owner only', async () => {
      const { service, prisma } = build();
      prisma.booking.findUnique.mockResolvedValue(row({ eventLink: 'clinic/urgent' }));
      expect(await service.rescheduleSession('p-1', 'bk_1')).toMatchObject({ calLink: 'clinic/urgent', rescheduleUid: 'bk_1', name: 'Sofia Meyer', email: 'sofia@example.com' });
      await expect(service.rescheduleSession('someone-else', 'bk_1')).rejects.toThrow(/not found/);
    });

    it('is null once the booking has started or is no longer live', async () => {
      const { service, prisma } = build();
      prisma.booking.findUnique.mockResolvedValue(row({ startsAt: new Date(Date.now() - 1000) }));
      expect(await service.rescheduleSession('p-1', 'bk_1')).toBeNull();
      prisma.booking.findUnique.mockResolvedValue(row({ status: 'CANCELLED' }));
      expect(await service.rescheduleSession('p-1', 'bk_1')).toBeNull();
    });
  });

  it('says a booking can be moved only while it is live, in the future and its event is known', () => {
    const { service } = build();
    expect(service.toModel(row() as any).canReschedule).toBe(true);
    expect(service.toModel(row({ status: 'CANCELLED' }) as any).canReschedule).toBe(false);
    expect(service.toModel(row({ startsAt: new Date(Date.now() - 1000) }) as any).canReschedule).toBe(false);
    expect(service.toModel(row({ eventLink: null, purpose: 'UNLINKED' }) as any).canReschedule).toBe(false);
  });
});
