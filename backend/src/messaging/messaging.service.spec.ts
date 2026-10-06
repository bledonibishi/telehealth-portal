import { MessagingService } from './messaging.service';
import { UserRole } from '../common/enums';

describe('MessagingService', () => {
  let prisma: { message: { create: jest.Mock; findMany: jest.Mock; updateMany: jest.Mock }; consultation: { findUniqueOrThrow: jest.Mock; findUnique: jest.Mock; findFirst: jest.Mock } };
  let audit: { log: jest.Mock };
  let posthog: { capture: jest.Mock };
  let service: MessagingService;

  const MESSAGE = {
    id: 'msg-1',
    consultationId: 'consult-1',
    senderId: 'patient-1',
    senderRole: UserRole.PATIENT,
    content: 'Hello',
    sentAt: new Date(),
  };

  beforeEach(() => {
    prisma = {
      message: {
        create: jest.fn().mockResolvedValue(MESSAGE),
        findMany: jest.fn().mockResolvedValue([MESSAGE]),
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      consultation: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ patientId: 'patient-1' }),
        findUnique: jest.fn().mockResolvedValue({ patientId: 'patient-1' }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    posthog = { capture: jest.fn() };
    service = new MessagingService(prisma as any, audit as any, posthog as any);
  });

  describe('send', () => {
    it('creates the message with the given sender and content', async () => {
      await service.send('patient-1', UserRole.PATIENT, {
        consultationId: 'consult-1',
        content: 'Hello',
      });

      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          patientId: 'patient-1',
          consultationId: 'consult-1',
          senderId: 'patient-1',
          senderRole: UserRole.PATIENT,
          content: 'Hello',
        },
      });
    });

    it('writes an audit log referencing the created message', async () => {
      await service.send('patient-1', UserRole.PATIENT, {
        consultationId: 'consult-1',
        content: 'Hello',
      });

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'patient-1',
          actorRole: UserRole.PATIENT,
          action: 'MESSAGE_SENT',
          resourceId: MESSAGE.id,
        }),
      );
    });

    it('captures a posthog event for the sender', async () => {
      await service.send('patient-1', UserRole.PATIENT, {
        consultationId: 'consult-1',
        content: 'Hello',
      });

      expect(posthog.capture).toHaveBeenCalledWith(
        'patient-1',
        'message_sent',
        expect.objectContaining({ consultation_id: 'consult-1', message_id: MESSAGE.id }),
      );
    });

    it('returns the created message', async () => {
      const result = await service.send('patient-1', UserRole.PATIENT, {
        consultationId: 'consult-1',
        content: 'Hello',
      });

      expect(result).toBe(MESSAGE);
    });
  });

  describe('findByConsultation', () => {
    it('queries messages for the given consultation, oldest first', () => {
      service.findByConsultation('consult-1');

      expect(prisma.message.findMany).toHaveBeenCalledWith({
        where: { consultationId: 'consult-1' },
        orderBy: { sentAt: 'asc' },
      });
    });
  });

  describe('markRead', () => {
    it('lets the care team read what the patient wrote — never their own messages', async () => {
      expect(await service.markRead({ id: 'doc-1', role: UserRole.CLINICIAN } as any, 'consult-1')).toBe(2);
      expect(prisma.message.updateMany).toHaveBeenCalledWith({
        where: { consultationId: 'consult-1', readAt: null, senderRole: UserRole.PATIENT },
        data: { readAt: expect.any(Date) },
      });
    });

    it('lets the patient read what the care team wrote — never their own messages', async () => {
      await service.markRead({ id: 'patient-1', role: UserRole.PATIENT } as any, 'consult-1');
      expect(prisma.message.updateMany.mock.calls[0][0].where).toEqual({ consultationId: 'consult-1', readAt: null, senderRole: { not: UserRole.PATIENT } });
    });

    it('tells the other side at once, and only when something was actually read', async () => {
      const seen: any[] = [];
      const iterator = service.subscribeToMessagesRead('consult-1') as AsyncIterator<any>;
      const next = iterator.next().then((r) => seen.push(r.value));
      await service.markRead({ id: 'doc-1', role: UserRole.CLINICIAN } as any, 'consult-1');
      await next;
      expect(seen[0].messagesRead).toMatchObject({ consultationId: 'consult-1', byPatient: false, readAt: expect.any(Date) });

      prisma.message.updateMany.mockResolvedValue({ count: 0 });
      const quiet = service.subscribeToMessagesRead('consult-2') as AsyncIterator<any>;
      let fired = false;
      quiet.next().then(() => { fired = true; });
      await service.markRead({ id: 'doc-1', role: UserRole.CLINICIAN } as any, 'consult-2');
      await new Promise((r) => setTimeout(r, 20));
      expect(fired).toBe(false);
      await quiet.return?.();
    });
  });

  describe('pre-consultation thread', () => {
    const patient = { id: 'patient-1', role: 'PATIENT' } as any;
    const doctor = { id: 'doc-1', role: 'CLINICIAN' } as any;

    it('a patient with no consultation writes to their own pre-consultation thread', async () => {
      await service.sendAs(patient, { content: 'I need help with my proof' });
      expect(prisma.message.create).toHaveBeenCalledWith({
        data: { patientId: 'patient-1', consultationId: null, senderId: 'patient-1', senderRole: 'PATIENT', content: 'I need help with my proof' },
      });
    });

    it('goes to the newest consultation once there is one', async () => {
      prisma.consultation.findFirst.mockResolvedValue({ id: 'consult-9' });
      await service.sendAs(patient, { content: 'Hi' });
      expect(prisma.message.create.mock.calls[0][0].data.consultationId).toBe('consult-9');
    });

    it('a patient cannot write into someone else’s thread', async () => {
      await service.sendAs(patient, { patientId: 'patient-2', content: 'x' });
      expect(prisma.message.create.mock.calls[0][0].data.patientId).toBe('patient-1');

      prisma.consultation.findUnique.mockResolvedValue({ patientId: 'patient-2' });
      await expect(service.sendAs(patient, { consultationId: 'theirs', content: 'x' })).rejects.toThrow();
    });

    it('staff reply to a patient without a consultation by patient id', async () => {
      await service.sendAs(doctor, { patientId: 'patient-1', content: 'Happy to help' });
      expect(prisma.message.create.mock.calls[0][0].data).toMatchObject({ patientId: 'patient-1', consultationId: null, senderRole: 'CLINICIAN' });
      await expect(service.sendAs(doctor, { content: 'to whom?' })).rejects.toThrow(/which patient/);
    });
  });
});
