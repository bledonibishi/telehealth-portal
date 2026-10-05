import { BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { IdentityVerificationStatus as S } from '@prisma/client';
import { OnboardingStatus, OnboardingStepKey, PersonaStatus } from '../common/enums';
import {
  IdentityVerificationService,
  SUBMITTED_STATUSES,
  canApply,
  parseStatus,
  toPersonaStatus,
} from './identity-verification.service';
import { VerifyServiceError } from './verify-client.service';

const T0 = new Date('2026-10-05T10:00:00Z');
const T1 = new Date('2026-10-05T10:05:00Z');
const T2 = new Date('2026-10-05T10:10:00Z');

describe('canApply', () => {
  const cur = (status: S, lastEventAt: Date | null = null) => ({ status, lastEventAt });

  it('moves forward through the session life', () => {
    expect(canApply(cur(S.PENDING), S.PROCESSING, T1)).toBe(true);
    expect(canApply(cur(S.PROCESSING), S.NEEDS_REVIEW, T1)).toBe(true);
    expect(canApply(cur(S.NEEDS_REVIEW), S.APPROVED, T1)).toBe(true);
    expect(canApply(cur(S.NEEDS_REVIEW), S.REJECTED, T1)).toBe(true);
    expect(canApply(cur(S.PENDING), S.EXPIRED, null)).toBe(true);
  });

  it('never moves backwards', () => {
    expect(canApply(cur(S.NEEDS_REVIEW), S.PROCESSING, null)).toBe(false);
    expect(canApply(cur(S.PROCESSING), S.PENDING, null)).toBe(false);
  });

  it('never moves a decision back to a non-final status', () => {
    for (const decided of [S.APPROVED, S.REJECTED]) {
      for (const next of [S.PENDING, S.PROCESSING, S.NEEDS_REVIEW, S.EXPIRED]) {
        expect(canApply(cur(decided, T1), next, T2)).toBe(false);
      }
    }
  });

  it('ignores an event that is older than the one already applied', () => {
    expect(canApply(cur(S.PROCESSING, T1), S.NEEDS_REVIEW, T0)).toBe(false);
  });

  it('only replaces a decision with a strictly newer decision', () => {
    expect(canApply(cur(S.REJECTED, T1), S.APPROVED, T2)).toBe(true);
    expect(canApply(cur(S.REJECTED, T1), S.APPROVED, T0)).toBe(false);
    expect(canApply(cur(S.REJECTED, T1), S.APPROVED, T1)).toBe(false);
    expect(canApply(cur(S.REJECTED, T1), S.APPROVED, null)).toBe(false); // polling can't override a decision
  });

  it('does nothing when the status is unchanged', () => {
    expect(canApply(cur(S.PROCESSING), S.PROCESSING, T1)).toBe(false);
  });
});

describe('status helpers', () => {
  it('treats unknown statuses as not approved', () => {
    expect(parseStatus('SOMETHING_NEW')).toBe(S.PENDING);
    expect(parseStatus(undefined)).toBe(S.PENDING);
    expect(parseStatus('APPROVED')).toBe(S.APPROVED);
  });

  it('maps to the legacy ID-check status', () => {
    expect(toPersonaStatus(S.PENDING)).toBe(PersonaStatus.NOT_STARTED);
    expect(toPersonaStatus(S.PROCESSING)).toBe(PersonaStatus.PENDING);
    expect(toPersonaStatus(S.NEEDS_REVIEW)).toBe(PersonaStatus.PENDING);
    expect(toPersonaStatus(S.APPROVED)).toBe(PersonaStatus.VERIFIED);
    expect(toPersonaStatus(S.REJECTED)).toBe(PersonaStatus.FAILED);
    expect(toPersonaStatus(S.EXPIRED)).toBe(PersonaStatus.NOT_STARTED);
  });

  it('only counts submitted or approved sessions as a completed identity step', () => {
    expect(SUBMITTED_STATUSES).toEqual([S.PROCESSING, S.NEEDS_REVIEW, S.APPROVED]);
  });
});

describe('IdentityVerificationService', () => {
  let prisma: any;
  let client: { isConfigured: boolean; createSession: jest.Mock; getSession: jest.Mock };
  let service: IdentityVerificationService;

  const ROW = (over: Record<string, unknown> = {}) => ({
    id: 'iv-1',
    patientId: 'p1',
    sessionId: 'sess-1',
    status: S.PENDING,
    reason: null,
    decidedAt: null,
    lastEventAt: null,
    expiresAt: new Date(Date.now() + 3600_000),
    createdAt: new Date(Date.now() - 3600_000),
    ...over,
  });
  const SUBMISSION = (over: Record<string, unknown> = {}) => ({
    patientId: 'p1',
    status: OnboardingStatus.IN_PROGRESS,
    priorMedicationUse: false,
    stepFeedback: [],
    ...over,
  });

  beforeEach(() => {
    prisma = {
      patient: { findUnique: jest.fn() },
      identityVerification: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn(),
      },
      verifyWebhookEvent: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      onboardingSubmission: {
        findUnique: jest.fn().mockResolvedValue(SUBMISSION()),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    };
    client = { isConfigured: true, createSession: jest.fn(), getSession: jest.fn() };
    service = new IdentityVerificationService(prisma, client as any);
  });

  describe('start', () => {
    const PATIENT = { firstName: 'Arta', lastName: 'Krasniqi', dateOfBirth: new Date('1990-05-15T00:00:00Z') };
    const CREATED = {
      id: 'sess-new',
      hostedUrl: 'https://verify.example/verify#one-time-token',
      expiresAt: '2026-10-05T13:00:00.000Z',
      status: 'PENDING',
    };

    beforeEach(() => {
      prisma.patient.findUnique.mockResolvedValue(PATIENT);
      prisma.identityVerification.findFirst.mockResolvedValue(null);
      client.createSession.mockResolvedValue(CREATED);
    });

    it('refuses when verify-service is not configured', async () => {
      client.isConfigured = false;
      await expect(service.start('p1')).rejects.toBeInstanceOf(BadRequestException);
      expect(client.createSession).not.toHaveBeenCalled();
    });

    it('404s for an unknown patient', async () => {
      prisma.patient.findUnique.mockResolvedValue(null);
      await expect(service.start('p1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('creates a session with the patient details, stores only ids and status, and returns the link', async () => {
      const res = await service.start('p1');

      expect(client.createSession).toHaveBeenCalledWith({
        externalRef: 'p1',
        firstName: 'Arta',
        lastName: 'Krasniqi',
        birthDate: '1990-05-15',
      });
      expect(res.hostedUrl).toBe(CREATED.hostedUrl);

      const stored = prisma.identityVerification.create.mock.calls[0][0].data;
      expect(stored).toEqual({
        patientId: 'p1',
        sessionId: 'sess-new',
        status: S.PENDING,
        expiresAt: new Date(CREATED.expiresAt),
      });
      // The one-time link must not be persisted anywhere
      expect(JSON.stringify(prisma.identityVerification.create.mock.calls)).not.toContain('one-time-token');
      expect(JSON.stringify(prisma.onboardingSubmission.update.mock.calls)).not.toContain('one-time-token');
    });

    it('clears an earlier ID rejection and resets the ID-check status when starting again', async () => {
      prisma.identityVerification.findFirst.mockResolvedValueOnce(ROW({ status: S.REJECTED })); // previous attempt
      prisma.identityVerification.findFirst.mockResolvedValueOnce(ROW({ sessionId: 'sess-new' })); // latest in sync
      prisma.onboardingSubmission.findUnique.mockResolvedValue(
        SUBMISSION({
          status: OnboardingStatus.REJECTED,
          stepFeedback: [
            { step: OnboardingStepKey.ID_PHOTO, approved: false, reason: 'x' },
            { step: OnboardingStepKey.BODY_PHOTO, approved: false, reason: 'keep me' },
          ],
        }),
      );
      await service.start('p1');
      const data = prisma.onboardingSubmission.update.mock.calls[0][0].data;
      expect(data.personaStatus).toBe(PersonaStatus.NOT_STARTED);
      expect(data.stepFeedback).toEqual([{ step: OnboardingStepKey.BODY_PHOTO, approved: false, reason: 'keep me' }]);
    });

    it('does not start another check once verified, or while one is under review', async () => {
      prisma.identityVerification.findFirst.mockResolvedValue(ROW({ status: S.APPROVED }));
      await expect(service.start('p1')).rejects.toThrow('already verified');
      prisma.identityVerification.findFirst.mockResolvedValue(ROW({ status: S.NEEDS_REVIEW }));
      await expect(service.start('p1')).rejects.toThrow('already being reviewed');
      prisma.identityVerification.findFirst.mockResolvedValue(ROW({ status: S.PROCESSING }));
      await expect(service.start('p1')).rejects.toThrow('already being reviewed');
      expect(client.createSession).not.toHaveBeenCalled();
    });

    it('stops a double-tap from creating two sessions, but allows a new link later', async () => {
      prisma.identityVerification.findFirst.mockResolvedValue(ROW({ createdAt: new Date() }));
      await expect(service.start('p1')).rejects.toThrow('wait a moment');
      expect(client.createSession).not.toHaveBeenCalled();

      prisma.identityVerification.findFirst.mockResolvedValue(ROW({ createdAt: new Date(Date.now() - 60_000) }));
      await expect(service.start('p1')).resolves.toBeDefined();
    });

    it('hides verify-service failures from the patient and does not store a session', async () => {
      client.createSession.mockRejectedValue(new VerifyServiceError(429, 'monthly_cap_reached'));
      await expect(service.start('p1')).rejects.toBeInstanceOf(ServiceUnavailableException);
      client.createSession.mockRejectedValue(new VerifyServiceError(401));
      await expect(service.start('p1')).rejects.toThrow('temporarily unavailable');
      client.createSession.mockRejectedValue(new VerifyServiceError(null));
      await expect(service.start('p1')).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(prisma.identityVerification.create).not.toHaveBeenCalled();
      expect(client.createSession).toHaveBeenCalledTimes(3); // never retried within a call
    });
  });

  describe('getStatus', () => {
    it('reports not configured without touching verify-service', async () => {
      client.isConfigured = false;
      await expect(service.getStatus('p1')).resolves.toEqual({ configured: false, status: null, expiresAt: null });
      expect(client.getSession).not.toHaveBeenCalled();
    });

    it('returns no status before a check has been started', async () => {
      prisma.identityVerification.findFirst.mockResolvedValue(null);
      await expect(service.getStatus('p1')).resolves.toEqual({ configured: true, status: null, expiresAt: null });
    });

    it('does not ask verify-service about a decided session', async () => {
      prisma.identityVerification.findFirst.mockResolvedValue(ROW({ status: S.APPROVED }));
      const res = await service.getStatus('p1');
      expect(res.status).toBe(S.APPROVED);
      expect(client.getSession).not.toHaveBeenCalled();
    });

    it('polls an open session and applies a forward change', async () => {
      prisma.identityVerification.findFirst
        .mockResolvedValueOnce(ROW({ status: S.PENDING }))
        .mockResolvedValue(ROW({ status: S.NEEDS_REVIEW }));
      client.getSession.mockResolvedValue({ id: 'sess-1', status: 'NEEDS_REVIEW' });

      const res = await service.getStatus('p1');
      expect(client.getSession).toHaveBeenCalledWith('sess-1');
      // Conditional on the status we read, so a concurrent webhook isn't overwritten
      expect(prisma.identityVerification.updateMany.mock.calls[0][0].where).toEqual({ id: 'iv-1', status: S.PENDING });
      expect(res.status).toBe(S.NEEDS_REVIEW);
    });

    it('falls back to the stored status when verify-service is unreachable', async () => {
      prisma.identityVerification.findFirst.mockResolvedValue(ROW({ status: S.PROCESSING }));
      client.getSession.mockRejectedValue(new VerifyServiceError(null));
      await expect(service.getStatus('p1')).resolves.toMatchObject({ configured: true, status: S.PROCESSING });
    });

    it('marks a link that ran out before any photos were sent as expired', async () => {
      prisma.identityVerification.findFirst
        .mockResolvedValueOnce(ROW({ expiresAt: new Date(Date.now() - 1000) }))
        .mockResolvedValue(ROW({ status: S.EXPIRED, expiresAt: new Date(Date.now() - 1000) }));
      const res = await service.getStatus('p1');
      expect(prisma.identityVerification.updateMany.mock.calls[0][0]).toMatchObject({
        where: { id: 'iv-1', status: S.PENDING },
        data: { status: S.EXPIRED },
      });
      expect(res.status).toBe(S.EXPIRED);
      expect(client.getSession).not.toHaveBeenCalled();
    });
  });

  describe('handleWebhook', () => {
    const event = (over: Record<string, unknown> = {}) => ({
      eventId: 'evt-1',
      sessionId: 'sess-1',
      status: S.APPROVED,
      occurredAt: T1,
      review: { reason: null, decidedAt: T1 },
      ...over,
    });
    const latestIs = (row: ReturnType<typeof ROW>) => prisma.identityVerification.findFirst.mockResolvedValue(row);

    beforeEach(() => {
      prisma.identityVerification.findUnique.mockResolvedValue(ROW({ status: S.NEEDS_REVIEW, lastEventAt: T0 }));
    });

    it('ignores an event id it has already processed (at-least-once delivery)', async () => {
      prisma.verifyWebhookEvent.createMany.mockResolvedValue({ count: 0 });
      await expect(service.handleWebhook(event() as any)).resolves.toBe('duplicate');
      expect(prisma.identityVerification.update).not.toHaveBeenCalled();
    });

    it('records the event id in the same transaction as the change', async () => {
      latestIs(ROW({ status: S.APPROVED }));
      await service.handleWebhook(event() as any);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.verifyWebhookEvent.createMany).toHaveBeenCalledWith({
        data: [{ eventId: 'evt-1', sessionId: 'sess-1' }],
        skipDuplicates: true,
      });
    });

    it('acknowledges but ignores a session it does not know', async () => {
      prisma.identityVerification.findUnique.mockResolvedValue(null);
      await expect(service.handleWebhook(event() as any)).resolves.toBe('ignored');
      expect(prisma.identityVerification.update).not.toHaveBeenCalled();
    });

    it('applies an approval and marks the patient verified', async () => {
      latestIs(ROW({ status: S.APPROVED }));
      await expect(service.handleWebhook(event() as any)).resolves.toBe('applied');
      expect(prisma.identityVerification.update.mock.calls[0][0].data).toMatchObject({
        status: S.APPROVED,
        decidedAt: T1,
        lastEventAt: T1,
      });
      expect(prisma.onboardingSubmission.update.mock.calls[0][0].data.personaStatus).toBe(PersonaStatus.VERIFIED);
    });

    it('does not move a decided session back when a late, older event arrives', async () => {
      prisma.identityVerification.findUnique.mockResolvedValue(ROW({ status: S.APPROVED, lastEventAt: T1 }));
      await expect(service.handleWebhook(event({ status: S.NEEDS_REVIEW, occurredAt: T0 }) as any)).resolves.toBe('ignored');
      await expect(service.handleWebhook(event({ eventId: 'evt-2', status: S.PROCESSING, occurredAt: T2 }) as any)).resolves.toBe('ignored');
      expect(prisma.identityVerification.update).not.toHaveBeenCalled();
    });

    it('keeps the reviewer’s reason internal and sends a rejected submission back with a neutral message', async () => {
      latestIs(ROW({ status: S.REJECTED }));
      prisma.onboardingSubmission.findUnique.mockResolvedValue(SUBMISSION({ status: OnboardingStatus.PENDING_REVIEW }));
      await service.handleWebhook(
        event({ status: S.REJECTED, review: { reason: 'blurry, name does not match', decidedAt: T1 } }) as any,
      );

      expect(prisma.identityVerification.update.mock.calls[0][0].data.reason).toBe('blurry, name does not match');
      const data = prisma.onboardingSubmission.update.mock.calls[0][0].data;
      expect(data.status).toBe(OnboardingStatus.REJECTED);
      expect(data.personaStatus).toBe(PersonaStatus.FAILED);
      const feedback = data.stepFeedback.find((f: any) => f.step === OnboardingStepKey.ID_PHOTO);
      expect(feedback).toMatchObject({ approved: false });
      expect(feedback.reason).not.toContain('blurry');
      expect(feedback.reason).not.toContain('name does not match');
    });

    it('does not reject a submission that is not waiting for review', async () => {
      latestIs(ROW({ status: S.REJECTED }));
      prisma.onboardingSubmission.findUnique.mockResolvedValue(SUBMISSION({ status: OnboardingStatus.IN_PROGRESS }));
      await service.handleWebhook(event({ status: S.REJECTED }) as any);
      expect(prisma.onboardingSubmission.update.mock.calls[0][0].data.status).toBeUndefined();
    });

    it('approves onboarding when the clinician had already approved everything else', async () => {
      latestIs(ROW({ status: S.APPROVED }));
      prisma.onboardingSubmission.findUnique.mockResolvedValue(
        SUBMISSION({
          status: OnboardingStatus.PENDING_REVIEW,
          stepFeedback: [{ step: OnboardingStepKey.BODY_PHOTO, approved: true }],
        }),
      );
      await service.handleWebhook(event() as any);
      expect(prisma.onboardingSubmission.update.mock.calls[0][0].data.status).toBe(OnboardingStatus.APPROVED);
    });

    it('leaves onboarding for the clinician when other steps are still undecided or rejected', async () => {
      latestIs(ROW({ status: S.APPROVED }));
      prisma.onboardingSubmission.findUnique.mockResolvedValue(
        SUBMISSION({ status: OnboardingStatus.PENDING_REVIEW, stepFeedback: [] }),
      );
      await service.handleWebhook(event() as any);
      expect(prisma.onboardingSubmission.update.mock.calls[0][0].data.status).toBeUndefined();

      prisma.onboardingSubmission.update.mockClear();
      prisma.verifyWebhookEvent.createMany.mockResolvedValue({ count: 1 });
      prisma.onboardingSubmission.findUnique.mockResolvedValue(
        SUBMISSION({
          status: OnboardingStatus.PENDING_REVIEW,
          stepFeedback: [{ step: OnboardingStepKey.BODY_PHOTO, approved: false, reason: 'no' }],
        }),
      );
      await service.handleWebhook(event({ eventId: 'evt-3' }) as any);
      expect(prisma.onboardingSubmission.update.mock.calls[0][0].data.status).toBeUndefined();
    });

    it('requires proof of prescription too when the patient used the medicine before', async () => {
      latestIs(ROW({ status: S.APPROVED }));
      prisma.onboardingSubmission.findUnique.mockResolvedValue(
        SUBMISSION({
          status: OnboardingStatus.PENDING_REVIEW,
          priorMedicationUse: true,
          stepFeedback: [{ step: OnboardingStepKey.BODY_PHOTO, approved: true }],
        }),
      );
      await service.handleWebhook(event() as any);
      expect(prisma.onboardingSubmission.update.mock.calls[0][0].data.status).toBeUndefined();
    });

    it('bases the onboarding update on the patient’s latest session, not the event’s', async () => {
      // An old session gets approved, but the patient has since started a newer, still-open one
      latestIs(ROW({ sessionId: 'sess-newer', status: S.PENDING }));
      await service.handleWebhook(event() as any);
      expect(prisma.onboardingSubmission.update.mock.calls[0][0].data.personaStatus).toBe(PersonaStatus.NOT_STARTED);
    });

    it('lets the failure through so the sender retries, and leaves nothing half applied', async () => {
      prisma.identityVerification.update.mockRejectedValue(new Error('db down'));
      await expect(service.handleWebhook(event() as any)).rejects.toThrow('db down');
    });
  });
});
