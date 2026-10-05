import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { IdentityVerificationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OnboardingStatus, OnboardingStepKey, PersonaStatus } from '../common/enums';
import { requiredReviewSteps } from '../onboarding/required-steps';
import { VerifyClient, VerifyServiceError } from './verify-client.service';

export interface VerifyWebhookPayload {
  eventId: string;
  sessionId: string;
  status: IdentityVerificationStatus;
  occurredAt: Date;
  review?: { reason?: string | null; decidedAt?: Date | null } | null;
}

export interface IdentityVerificationState {
  configured: boolean;
  status: IdentityVerificationStatus | null;
  expiresAt: Date | null;
}

type Tx = Prisma.TransactionClient;

const S = IdentityVerificationStatus;

/** Forward-only order of a session's life. APPROVED, REJECTED and EXPIRED are all terminal. */
const RANK: Record<IdentityVerificationStatus, number> = {
  [S.PENDING]: 0,
  [S.PROCESSING]: 1,
  [S.NEEDS_REVIEW]: 2,
  [S.APPROVED]: 3,
  [S.REJECTED]: 3,
  [S.EXPIRED]: 3,
};

const isDecision = (s: IdentityVerificationStatus) => s === S.APPROVED || s === S.REJECTED;

/** The photos have been submitted and are with a reviewer (or already decided). */
export const SUBMITTED_STATUSES: IdentityVerificationStatus[] = [S.PROCESSING, S.NEEDS_REVIEW, S.APPROVED];

/** Shown to the patient instead of the reviewer's reason, which stays internal. */
const NEUTRAL_REJECTION_REASON =
  'We couldn’t verify your identity from your ID. Please try again with clear photos of your ID card and yourself.';

/** Minimum gap between new sessions for one patient, so a double-tap can't burn the monthly cap. */
const MIN_SECONDS_BETWEEN_SESSIONS = 15;

/** Our onboarding's older per-patient ID check field, kept in step so existing screens still work. */
export function toPersonaStatus(status: IdentityVerificationStatus): PersonaStatus {
  switch (status) {
    case S.PROCESSING:
    case S.NEEDS_REVIEW:
      return PersonaStatus.PENDING;
    case S.APPROVED:
      return PersonaStatus.VERIFIED;
    case S.REJECTED:
      return PersonaStatus.FAILED;
    default:
      return PersonaStatus.NOT_STARTED;
  }
}

/** Unknown statuses are treated as "not approved": they map to PENDING, never to a decision. */
export function parseStatus(value: unknown): IdentityVerificationStatus {
  return Object.values(S).includes(value as IdentityVerificationStatus)
    ? (value as IdentityVerificationStatus)
    : S.PENDING;
}

/**
 * Whether an incoming status may replace the stored one. Out-of-order and replayed events must not
 * move a session backwards, and a decision is only ever replaced by a newer decision.
 * `occurredAt` is null for polled results, which carry no event time.
 */
export function canApply(
  current: { status: IdentityVerificationStatus; lastEventAt: Date | null },
  next: IdentityVerificationStatus,
  occurredAt: Date | null,
): boolean {
  if (next === current.status) return false;
  if (isDecision(current.status)) {
    return isDecision(next) && !!occurredAt && !!current.lastEventAt && occurredAt > current.lastEventAt;
  }
  if (occurredAt && current.lastEventAt && occurredAt < current.lastEventAt) return false;
  return RANK[next] > RANK[current.status];
}

@Injectable()
export class IdentityVerificationService {
  private readonly logger = new Logger(IdentityVerificationService.name);

  constructor(
    private prisma: PrismaService,
    private client: VerifyClient,
  ) {}

  /** True when verify-service is configured; otherwise onboarding keeps its in-app upload flow. */
  get isEnabled(): boolean {
    return this.client.isConfigured;
  }

  /** Whether this patient has ever started a check, which switches their onboarding to this flow. */
  async hasVerification(patientId: string): Promise<boolean> {
    return (await this.prisma.identityVerification.count({ where: { patientId } })) > 0;
  }

  /**
   * Creates a new session and returns the link to send the patient to. The link carries a one-time
   * token, so it is returned to the caller and never stored or logged.
   */
  async start(patientId: string): Promise<{ hostedUrl: string; expiresAt: Date }> {
    if (!this.isEnabled) throw new BadRequestException('Identity verification is not available');

    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: { firstName: true, lastName: true, dateOfBirth: true },
    });
    if (!patient) throw new NotFoundException('Patient not found');

    const latest = await this.latest(this.prisma, patientId);
    if (latest) {
      if (latest.status === S.APPROVED) throw new BadRequestException('Your identity is already verified');
      if (latest.status === S.PROCESSING || latest.status === S.NEEDS_REVIEW) {
        throw new BadRequestException('Your identity check is already being reviewed');
      }
      if (
        latest.status === S.PENDING &&
        Date.now() - latest.createdAt.getTime() < MIN_SECONDS_BETWEEN_SESSIONS * 1000
      ) {
        throw new BadRequestException('Please wait a moment before trying again');
      }
    }

    let created;
    try {
      // Not retried: a repeat after an unclear failure would create a second session.
      created = await this.client.createSession({
        externalRef: patientId,
        firstName: patient.firstName,
        lastName: patient.lastName,
        birthDate: patient.dateOfBirth.toISOString().slice(0, 10),
      });
    } catch (err) {
      if (err instanceof VerifyServiceError && err.isMonthlyCapReached) {
        this.logger.error('verify-service monthly cap reached: new identity checks are blocked');
      } else {
        this.logger.error(`Could not create an identity session: ${(err as Error).message}`);
      }
      throw new ServiceUnavailableException('Identity checks are temporarily unavailable. Please try again later.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.identityVerification.create({
        data: {
          patientId,
          sessionId: created.id,
          status: parseStatus(created.status),
          expiresAt: new Date(created.expiresAt),
        },
      });
      await this.syncOnboarding(tx, patientId, { clearIdFeedback: true });
    });

    return { hostedUrl: created.hostedUrl, expiresAt: new Date(created.expiresAt) };
  }

  /**
   * The patient's current state. While a check is still open this also asks verify-service, as a
   * fallback in case a webhook was missed or has not arrived yet.
   */
  async getStatus(patientId: string): Promise<IdentityVerificationState> {
    if (!this.isEnabled) return { configured: false, status: null, expiresAt: null };

    let row = await this.latest(this.prisma, patientId);
    if (!row) return { configured: true, status: null, expiresAt: null };

    if (row.status === S.PENDING && row.expiresAt.getTime() < Date.now()) {
      const expired = await this.prisma.identityVerification.updateMany({
        where: { id: row.id, status: S.PENDING },
        data: { status: S.EXPIRED },
      });
      if (expired.count > 0) await this.prisma.$transaction((tx) => this.syncOnboarding(tx, patientId));
      row = (await this.latest(this.prisma, patientId)) ?? row;
    } else if (!isDecision(row.status) && row.status !== S.EXPIRED) {
      row = (await this.refreshFromRemote(row)) ?? row;
    }

    return { configured: true, status: row.status, expiresAt: row.expiresAt };
  }

  private async refreshFromRemote(row: { id: string; patientId: string; sessionId: string; status: IdentityVerificationStatus; lastEventAt: Date | null }) {
    try {
      const remote = await this.client.getSession(row.sessionId);
      const next = parseStatus(remote.status);
      if (!canApply(row, next, null)) return null;
      const decidedAt = remote.review?.decidedAt ? new Date(remote.review.decidedAt) : null;
      return await this.prisma.$transaction(async (tx) => {
        // Conditional on the status we read, so a webhook that landed meanwhile is not overwritten.
        const updated = await tx.identityVerification.updateMany({
          where: { id: row.id, status: row.status },
          data: {
            status: next,
            reason: next === S.REJECTED ? (remote.review?.reason ?? null) : undefined,
            decidedAt: isDecision(next) ? (decidedAt ?? new Date()) : undefined,
          },
        });
        if (updated.count > 0) await this.syncOnboarding(tx, row.patientId);
        return this.latest(tx, row.patientId);
      });
    } catch (err) {
      this.logger.warn(`Could not refresh identity session ${row.sessionId}: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Applies one verified webhook event. Safe to call twice with the same event: the event id is
   * recorded in the same transaction as the change, so a failure rolls both back and the retry
   * is processed normally.
   */
  async handleWebhook(event: VerifyWebhookPayload): Promise<'applied' | 'duplicate' | 'ignored'> {
    return this.prisma.$transaction(async (tx) => {
      const recorded = await tx.verifyWebhookEvent.createMany({
        data: [{ eventId: event.eventId, sessionId: event.sessionId }],
        skipDuplicates: true,
      });
      if (recorded.count === 0) return 'duplicate';

      const row = await tx.identityVerification.findUnique({ where: { sessionId: event.sessionId } });
      if (!row) {
        this.logger.warn(`Webhook for an unknown identity session ${event.sessionId}`);
        return 'ignored';
      }
      if (!canApply(row, event.status, event.occurredAt)) return 'ignored';

      await tx.identityVerification.update({
        where: { id: row.id },
        data: {
          status: event.status,
          reason: event.status === S.REJECTED ? (event.review?.reason ?? null) : undefined,
          decidedAt: isDecision(event.status) ? (event.review?.decidedAt ?? event.occurredAt) : undefined,
          lastEventAt: event.occurredAt,
        },
      });
      await this.syncOnboarding(tx, row.patientId);
      return 'applied';
    });
  }

  private latest(db: Pick<Tx, 'identityVerification'>, patientId: string) {
    return db.identityVerification.findFirst({ where: { patientId }, orderBy: { createdAt: 'desc' } });
  }

  /**
   * Keeps the onboarding record in step with the patient's latest session. A rejection sends a
   * submission that was waiting for review back to the patient with a neutral message; the
   * reviewer's own reason is never shown to them.
   */
  private async syncOnboarding(tx: Tx, patientId: string, opts: { clearIdFeedback?: boolean } = {}) {
    const latest = await this.latest(tx, patientId);
    if (!latest) return;
    const personaStatus = toPersonaStatus(latest.status);

    const submission = await tx.onboardingSubmission.findUnique({ where: { patientId } });
    if (!submission) {
      await tx.onboardingSubmission.create({ data: { patientId, personaStatus } });
      return;
    }

    type Feedback = { step: string; approved: boolean; reason?: string };
    let feedback = submission.stepFeedback as unknown as Feedback[];
    const data: Prisma.OnboardingSubmissionUpdateInput = { personaStatus };

    if (opts.clearIdFeedback) {
      feedback = feedback.filter((f) => f.step !== OnboardingStepKey.ID_PHOTO);
      data.stepFeedback = feedback as unknown as Prisma.InputJsonValue;
    }
    if (latest.status === S.REJECTED && submission.status === OnboardingStatus.PENDING_REVIEW) {
      feedback = [
        ...feedback.filter((f) => f.step !== OnboardingStepKey.ID_PHOTO),
        { step: OnboardingStepKey.ID_PHOTO, approved: false, reason: NEUTRAL_REJECTION_REASON },
      ];
      data.stepFeedback = feedback as unknown as Prisma.InputJsonValue;
      data.status = OnboardingStatus.REJECTED;
      data.reviewedAt = new Date();
      data.reviewedByClinician = { disconnect: true };
    }
    // The clinician already approved everything else and was only waiting on the identity check.
    if (latest.status === S.APPROVED && submission.status === OnboardingStatus.PENDING_REVIEW) {
      const required = requiredReviewSteps(submission, true);
      if (required.every((step) => feedback.some((f) => f.step === step && f.approved))) {
        data.status = OnboardingStatus.APPROVED;
        data.reviewedAt = new Date();
        data.reviewedByClinician = { disconnect: true };
      }
    }
    await tx.onboardingSubmission.update({ where: { patientId }, data });
  }
}
