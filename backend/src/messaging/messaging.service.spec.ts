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
          isAi: false,
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
        data: { patientId: 'patient-1', consultationId: null, senderId: 'patient-1', senderRole: 'PATIENT', content: 'I need help with my proof', isAi: false },
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

  describe('notifications', () => {
    const sentAt = new Date('2026-10-10T10:00:00Z');
    let notifier: { toPatient: jest.Mock; toStaff: jest.Mock; resolve: jest.Mock };
    let notifying: MessagingService;

    beforeEach(() => {
      notifier = { toPatient: jest.fn().mockResolvedValue(undefined), toStaff: jest.fn().mockResolvedValue(undefined), resolve: jest.fn().mockResolvedValue(undefined) };
      (prisma as any).patient = { findUnique: jest.fn().mockResolvedValue({ firstName: 'Emma', lastName: 'H' }) };
      (prisma.message as any).findUnique = jest.fn().mockResolvedValue({ readAt: null });
      (prisma.message as any).count = jest.fn().mockResolvedValue(0);
      notifying = new MessagingService(prisma as any, audit as any, posthog as any, notifier as any);
    });

    const patientSays = () => {
      prisma.message.create.mockResolvedValue({ ...MESSAGE, patientId: 'patient-1', senderRole: UserRole.PATIENT, sentAt });
      return notifying.send('patient-1', UserRole.PATIENT, { consultationId: 'consult-1', content: 'Hello' });
    };
    const careTeamSays = () => {
      prisma.message.create.mockResolvedValue({ ...MESSAGE, patientId: 'patient-1', senderId: 'doc-1', senderRole: UserRole.CLINICIAN, sentAt });
      return notifying.send('doc-1', UserRole.CLINICIAN, { consultationId: 'consult-1', content: 'Hi' });
    };

    it('has recorded the notification by the time send returns', async () => {
      let recorded = false;
      notifier.toStaff.mockImplementation(async () => { await new Promise((r) => setTimeout(r, 5)); recorded = true; });
      await patientSays();
      expect(recorded).toBe(true);
    });

    it('tells the assigned clinician, with the whole clinical team as the fallback when they can no longer be reached', async () => {
      prisma.consultation.findUnique.mockResolvedValue({ patientId: 'patient-1', clinicianId: 'doc-9' });
      await patientSays();
      expect(notifier.toStaff).toHaveBeenCalledWith({ clinicianIds: ['doc-9'], roles: ['ADMIN', 'DOCTOR', 'CX_TEAM'] }, expect.objectContaining({ kind: 'PATIENT_MESSAGE', groupKey: 'patient-msg:patient-1:consult-1' }));
    });

    it('closes the staff alert at once when a reply landed while it was being written', async () => {
      (prisma.message as any).count.mockResolvedValue(1);
      await patientSays();
      expect(notifier.resolve).toHaveBeenCalledWith('patient-msg:patient-1:consult-1');
    });

    it('closes the patient notification at once when the chat was opened while it was being written', async () => {
      (prisma.message as any).findUnique.mockResolvedValue({ readAt: new Date() });
      await careTeamSays();
      expect(notifier.toPatient).toHaveBeenCalledTimes(1);
      expect(notifier.resolve).toHaveBeenLastCalledWith('team-msg:patient-1:consult-1');
    });

    describe('one notification per thread', () => {
      const keysResolved = () => notifier.resolve.mock.calls.map((c) => c[0]);

      it('a care-team reply closes the staff alert for that thread only, and the old per-patient one', async () => {
        await careTeamSays(); // thread consult-1
        expect(keysResolved()).toEqual(expect.arrayContaining(['patient-msg:patient-1:consult-1', 'patient-msg:patient-1']));
        expect(keysResolved()).not.toContain('patient-msg:patient-1:consult-2');
      });

      it('a care-team message notifies the patient under that thread’s own key', async () => {
        await careTeamSays();
        expect(notifier.toPatient).toHaveBeenCalledWith('patient-1', expect.objectContaining({ groupKey: 'team-msg:patient-1:consult-1' }));
      });

      it('only a reply in the same thread closes a new staff alert at once', async () => {
        (prisma.message as any).count.mockResolvedValue(1);
        await patientSays();
        expect((prisma.message as any).count).toHaveBeenCalledWith({ where: expect.objectContaining({ patientId: 'patient-1', consultationId: 'consult-1' }) });
      });

      it('reading one consultation closes that thread’s notification, never another’s', async () => {
        await notifying.markRead({ id: 'patient-1', role: UserRole.PATIENT } as any, 'consult-1');
        expect(keysResolved()).toEqual(['team-msg:patient-1:consult-1', 'team-msg:patient-1']);
      });

      it('reading the pre-consultation thread closes only its own notification', async () => {
        await notifying.markPreConsultationRead({ id: 'patient-1', role: UserRole.PATIENT } as any, 'patient-1');
        expect(keysResolved()).toEqual(['team-msg:patient-1:pre', 'team-msg:patient-1']);
      });

      it('the care team reading a thread resolves nothing: their alert closes when they reply', async () => {
        await notifying.markRead({ id: 'doc-1', role: UserRole.CLINICIAN } as any, 'consult-1');
        expect(notifier.resolve).not.toHaveBeenCalled();
      });
    });

    it('still saves and returns the message when notifying fails', async () => {
      notifier.toStaff.mockRejectedValue(new Error('boom'));
      await expect(patientSays()).resolves.toMatchObject({ id: 'msg-1' });
    });
  });

  describe('urgency check', () => {
    it('checks a patient’s message in the background, and leaves a care-team message alone', async () => {
      const urgency = { check: jest.fn().mockResolvedValue(true) };
      const withCheck = new MessagingService(prisma as any, audit as any, posthog as any, undefined, urgency as any);

      await withCheck.send('patient-1', UserRole.PATIENT, { consultationId: 'consult-1', content: 'Hello' });
      expect(urgency.check).toHaveBeenCalledWith('msg-1');

      urgency.check.mockClear();
      prisma.message.create.mockResolvedValue({ ...MESSAGE, senderRole: UserRole.CLINICIAN });
      await withCheck.send('doc-1', UserRole.CLINICIAN, { consultationId: 'consult-1', content: 'Hi' });
      expect(urgency.check).not.toHaveBeenCalled();
    });

    it('does not make sending wait for the check, or fail because of it', async () => {
      const urgency = { check: jest.fn().mockReturnValue(new Promise(() => undefined)) }; // never finishes
      const withCheck = new MessagingService(prisma as any, audit as any, posthog as any, undefined, urgency as any);
      await expect(withCheck.send('patient-1', UserRole.PATIENT, { consultationId: 'consult-1', content: 'Hello' })).resolves.toMatchObject({ id: 'msg-1' });
    });
  });
});


describe('MessagingService and the support assistant', () => {
  const build = () => {
    const prisma: any = {
      message: { create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'm-1', sentAt: new Date(), ...data })), findUnique: jest.fn().mockResolvedValue(null), count: jest.fn().mockResolvedValue(0) },
      consultation: { findUniqueOrThrow: jest.fn().mockResolvedValue({ patientId: 'patient-1' }) },
      patient: { findUnique: jest.fn().mockResolvedValue({ firstName: 'A', lastName: 'B' }) },
    };
    const bot = { onPatientMessage: jest.fn().mockResolvedValue(undefined), onStaffMessage: jest.fn().mockResolvedValue(undefined), useSender: jest.fn() };
    const notifier = { toPatient: jest.fn().mockResolvedValue(undefined), toStaff: jest.fn().mockResolvedValue(undefined), resolve: jest.fn().mockResolvedValue(undefined) };
    const service = new MessagingService(prisma, { log: jest.fn() } as any, { capture: jest.fn() } as any, notifier as any, undefined, bot as any);
    return { service, bot, notifier, prisma };
  };

  it('starts the assistant’s quiet timer when a patient writes', async () => {
    const { service, bot } = build();
    await service.send('patient-1', UserRole.PATIENT, { consultationId: 'c-1', content: 'hi' });
    expect(bot.onPatientMessage).toHaveBeenCalledWith({ patientId: 'patient-1', consultationId: 'c-1' });
  });

  it('makes the assistant step back when a person writes, but not when it wrote itself', async () => {
    const { service, bot } = build();
    await service.send('doc-1', UserRole.CLINICIAN, { consultationId: 'c-1', content: 'Hello' });
    expect(bot.onStaffMessage).toHaveBeenCalledTimes(1);
    await service.sendAssistant('patient-1', 'c-1', 'I can help with that');
    expect(bot.onStaffMessage).toHaveBeenCalledTimes(1);
  });

  it('labels the assistant’s message and keeps the team’s "waiting for a reply" alert open', async () => {
    const { service, prisma, notifier } = build();
    await service.sendAssistant('patient-1', null, 'Here is how');
    expect(prisma.message.create.mock.calls[0][0].data).toMatchObject({ isAi: true, senderId: 'ai-assistant', senderRole: UserRole.CLINICIAN });
    expect(notifier.resolve).not.toHaveBeenCalled();
    expect(notifier.toPatient).toHaveBeenCalled();
  });

  it('gives the assistant a way to post when the module starts', () => {
    const { service, bot } = build();
    service.onModuleInit();
    expect(bot.useSender).toHaveBeenCalledTimes(1);
  });
});

describe('MessagingService attachments', () => {
  const build = (own: number) => {
    const tx: any = { message: { create: jest.fn().mockResolvedValue({ id: 'm-1', patientId: 'patient-1', consultationId: 'c-1', senderRole: 'PATIENT', sentAt: new Date() }) }, uploadedFile: { updateMany: jest.fn().mockResolvedValue({ count: own }) } };
    const prisma: any = {
      uploadedFile: { count: jest.fn().mockResolvedValue(own) },
      consultation: { findUnique: jest.fn().mockResolvedValue({ patientId: 'patient-1' }), findFirst: jest.fn().mockResolvedValue({ id: 'c-1' }) },
      message: { create: jest.fn(), findUnique: jest.fn().mockResolvedValue(null), count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn((fn: any) => fn(tx)),
    };
    return { tx, prisma, service: new MessagingService(prisma, { log: jest.fn() } as any, { capture: jest.fn() } as any) };
  };
  const patient = { id: 'patient-1', email: 'p@x.com', role: 'PATIENT' } as any;

  it('sends a patient’s own files with the message, saved together', async () => {
    const { service, tx, prisma } = build(1);
    await service.sendAs(patient, { consultationId: 'c-1', content: 'screenshot', attachmentIds: ['f-1'] } as any);
    expect(prisma.uploadedFile.count).toHaveBeenCalledWith({ where: { id: { in: ['f-1'] }, patientId: 'patient-1', kind: 'SUPPORT_ATTACHMENT', ticketId: null, messageId: null } });
    expect(tx.uploadedFile.updateMany.mock.calls[0][0].data).toEqual({ messageId: 'm-1' });
  });

  it('allows a message that is only a file', async () => {
    const { service } = build(1);
    await expect(service.sendAs(patient, { consultationId: 'c-1', content: '', attachmentIds: ['f-1'] } as any)).resolves.toBeDefined();
  });

  it('refuses an empty message with nothing attached', async () => {
    const { service } = build(0);
    await expect(service.sendAs(patient, { consultationId: 'c-1', content: '   ' } as any)).rejects.toThrow(/write a message/i);
  });

  it('refuses a file that is not theirs or was already used', async () => {
    const { service, tx } = build(0);
    await expect(service.sendAs(patient, { consultationId: 'c-1', content: 'x', attachmentIds: ['someone-elses'] } as any)).rejects.toThrow(/could not be attached/i);
    expect(tx.message.create).not.toHaveBeenCalled();
  });

  it('allows at most three files, and only a patient can attach any', async () => {
    const { service } = build(4);
    await expect(service.sendAs(patient, { consultationId: 'c-1', content: 'x', attachmentIds: ['a', 'b', 'c', 'd'] } as any)).rejects.toThrow(/up to 3/i);
    await expect(service.sendAs({ id: 'dr', role: 'CLINICIAN', clinicianRole: 'DOCTOR' } as any, { consultationId: 'c-1', content: 'x', attachmentIds: ['a'] } as any)).rejects.toThrow(/only patients/i);
  });
});

describe('MessagingResolver: what the team thinks of the assistant is not for patients', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { MessagingResolver } = require('./messaging.resolver');
  const resolver = new MessagingResolver({} as any);
  const message = { aiFeedback: 'BAD', aiArticleId: 'reset-password' };

  it('shows the rating and the article to staff', () => {
    const staff = { id: 'cx', role: 'CLINICIAN', clinicianRole: 'CX_TEAM' };
    expect(resolver.aiFeedback(message, staff)).toBe('BAD');
    expect(resolver.aiArticleId(message, staff)).toBe('reset-password');
  });

  it('shows a patient neither', () => {
    const patient = { id: 'p', role: 'PATIENT' };
    expect(resolver.aiFeedback(message, patient)).toBeNull();
    expect(resolver.aiArticleId(message, patient)).toBeNull();
    expect(resolver.aiFeedback(message, undefined)).toBeNull();
  });
});
