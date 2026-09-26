import { MessagingService } from './messaging.service';
import { UserRole } from '../common/enums';

describe('MessagingService', () => {
  let prisma: { message: { create: jest.Mock; findMany: jest.Mock } };
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
});
