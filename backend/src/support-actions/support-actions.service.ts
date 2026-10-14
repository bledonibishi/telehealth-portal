import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { BillingService } from '../stripe/billing.service';
import { AuthUser } from '../auth/access-roles';
import { UserRole } from '../common/enums';
import { appError, ErrorCode, warning } from '../common/errors/app-error';

/**
 * Things support does by hand when an automatic step has not worked. Each is something a patient could trigger
 * themselves, run on their behalf: nothing here approves, prescribes, refunds or changes a dose.
 */
export enum SupportAction {
  RESEND_ACTIVATION_LINK = 'RESEND_ACTIVATION_LINK',
  SEND_PASSWORD_RESET = 'SEND_PASSWORD_RESET',
  RETRY_FAILED_PAYMENT = 'RETRY_FAILED_PAYMENT',
}

export interface SupportActionResult {
  ok: boolean;
  message: string;
}

/** The same action on the same patient is refused for this long, so a double click or an impatient retry can't repeat it. */
export const COOLDOWN_MINUTES = 10;
export const MIN_REASON_LENGTH = 5;

export interface ActionState {
  action: SupportAction;
  /** False when it makes no sense for this patient right now; `unavailableReason` says why, in words for the team. */
  available: boolean;
  unavailableReason?: string;
  /** Set while the same action was done a moment ago and cannot be repeated yet. */
  cooldownUntil?: Date;
}

export interface ActionHistoryEntry {
  id: string;
  action: SupportAction;
  at: Date;
  byName: string;
  ok: boolean;
  outcome: string;
  reason: string;
}

export interface SupportActionContext {
  patientName: string;
  email: string;
  activated: boolean;
  hasPaymentProfile: boolean;
  actions: ActionState[];
  history: ActionHistoryEntry[];
}

@Injectable()
export class SupportActionsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private auth: AuthService,
    private billing: BillingService,
  ) {}

  async perform(user: AuthUser, input: { patientId: string; action: SupportAction; reason: string; ticketId?: string | null }): Promise<SupportActionResult> {
    const reason = input.reason.trim();
    if (reason.length < MIN_REASON_LENGTH) throw appError(ErrorCode.BAD_REQUEST, 'Say why you are doing this, so the team can see it later.');
    if (reason.length > 500) throw appError(ErrorCode.BAD_REQUEST, 'The reason is too long (500 characters at most).');

    const patient = await this.prisma.patient.findUnique({
      where: { id: input.patientId },
      select: { id: true, email: true, firstName: true, activatedAt: true, stripeCustomerId: true, stripeSubscriptionId: true },
    });
    if (!patient) throw appError(ErrorCode.NOT_FOUND, 'That patient doesn’t exist.');
    // The same rules the screen shows: a fix that does not apply to this patient is refused here too, not only greyed out.
    const blocked = actionBlockedReason(input.action, patient);
    if (blocked) throw appError(ErrorCode.BAD_REQUEST, blocked);
    // A note goes only onto a ticket of this same patient.
    if (input.ticketId) {
      const own = await this.prisma.ticket.findFirst({ where: { id: input.ticketId, patientId: patient.id }, select: { id: true } });
      if (!own) throw appError(ErrorCode.BAD_REQUEST, 'That ticket belongs to a different patient.');
    }

    const auditAction = `SUPPORT_${input.action}`;
    const since = new Date(Date.now() - COOLDOWN_MINUTES * 60_000);
    const recent = await this.prisma.auditLogEntry.findFirst({ where: { action: auditAction, patientId: patient.id, timestamp: { gte: since } }, select: { id: true } });
    if (recent) throw warning(`This was already done a moment ago. Wait ${COOLDOWN_MINUTES} minutes before doing it again.`, ErrorCode.RATE_LIMITED);

    const result = await this.run(input.action, patient);

    await this.audit.log({
      actorId: user.id, actorRole: UserRole.CLINICIAN, action: auditAction, resourceType: 'Patient', resourceId: patient.id, patientId: patient.id,
      metadata: { reason, ok: result.ok, outcome: result.message, ...(input.ticketId ? { ticketId: input.ticketId } : {}) },
    });

    // On a ticket, leave a note so whoever opens it next can see what was tried.
    if (input.ticketId) {
      await this.prisma.ticketNote.create({
        data: { ticketId: input.ticketId, authorId: user.id, body: `${ACTION_LABEL[input.action]} — ${result.ok ? 'done' : 'did not work'}: ${result.message}\nReason: ${reason}` },
      }).catch(() => undefined);
    }
    return result;
  }

  /** What the team needs to see before using a quick fix: the patient's state, what applies, and what was already done. */
  async context(patientId: string): Promise<SupportActionContext> {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true, email: true, firstName: true, lastName: true, activatedAt: true, stripeCustomerId: true, stripeSubscriptionId: true },
    });
    if (!patient) throw appError(ErrorCode.NOT_FOUND, 'That patient doesn’t exist.');

    const entries = await this.prisma.auditLogEntry.findMany({ where: { patientId, action: { startsWith: 'SUPPORT_' } }, orderBy: { timestamp: 'desc' }, take: 10 });
    const actorIds = [...new Set(entries.map((e) => e.actorId))];
    const people = actorIds.length ? await this.prisma.clinician.findMany({ where: { id: { in: actorIds } }, select: { id: true, firstName: true, lastName: true } }) : [];
    const names = new Map(people.map((p) => [p.id, `${p.firstName} ${p.lastName}`]));
    const history: ActionHistoryEntry[] = entries.map((e) => {
      const meta = (e.metadata ?? {}) as { ok?: boolean; outcome?: string; reason?: string };
      return { id: e.id, action: e.action.replace('SUPPORT_', '') as SupportAction, at: e.timestamp, byName: names.get(e.actorId) ?? 'A former team member', ok: meta.ok === true, outcome: meta.outcome ?? '', reason: meta.reason ?? '' };
    });

    const since = Date.now() - COOLDOWN_MINUTES * 60_000;
    const hasPaymentProfile = !!(patient.stripeCustomerId || patient.stripeSubscriptionId);
    const actions: ActionState[] = (Object.values(SupportAction) as SupportAction[]).map((action) => {
      const last = history.find((h) => h.action === action && h.at.getTime() >= since);
      const blocked = actionBlockedReason(action, patient);
      return { action, available: !blocked && !last, unavailableReason: blocked ?? (last ? `Already done ${Math.max(1, Math.round((Date.now() - last.at.getTime()) / 60_000))} minute(s) ago by ${last.byName}.` : undefined), cooldownUntil: last ? new Date(last.at.getTime() + COOLDOWN_MINUTES * 60_000) : undefined };
    });
    return { patientName: `${patient.firstName} ${patient.lastName}`.trim(), email: patient.email, activated: !!patient.activatedAt, hasPaymentProfile, actions, history };
  }

  private async run(action: SupportAction, patient: { email: string; firstName: string; activatedAt: Date | null; stripeCustomerId: string | null; stripeSubscriptionId: string | null }): Promise<SupportActionResult> {
    switch (action) {
      case SupportAction.RESEND_ACTIVATION_LINK:
        if (patient.activatedAt) return { ok: false, message: 'This account is already activated. Send a password reset link instead.' };
        await this.auth.requestActivationLink(patient.email);
        return { ok: true, message: `An activation link was emailed to ${patient.email}.` };
      case SupportAction.SEND_PASSWORD_RESET:
        if (!patient.activatedAt) return { ok: false, message: 'This account isn’t activated yet. Send the activation link instead.' };
        await this.auth.requestPasswordReset(patient.email, 'patient');
        return { ok: true, message: `A password reset link was emailed to ${patient.email}.` };
      case SupportAction.RETRY_FAILED_PAYMENT: {
        const outcome = await this.billing.retryUnpaidInvoice(patient);
        return { ok: outcome.ok, message: outcome.note };
      }
    }
  }
}

export const ACTION_LABEL: Record<SupportAction, string> = {
  [SupportAction.RESEND_ACTIVATION_LINK]: 'Resent the activation link',
  [SupportAction.SEND_PASSWORD_RESET]: 'Sent a password reset link',
  [SupportAction.RETRY_FAILED_PAYMENT]: 'Retried the failed payment',
};

/** Why a quick fix does not apply to this patient, or null when it does. Used by the screen and again when the fix is run. */
export function actionBlockedReason(action: SupportAction, patient: { activatedAt: Date | null; stripeCustomerId: string | null; stripeSubscriptionId: string | null }): string | null {
  switch (action) {
    case SupportAction.RESEND_ACTIVATION_LINK:
      return patient.activatedAt ? 'This patient has already set up their account. Send a password reset link instead.' : null;
    case SupportAction.SEND_PASSWORD_RESET:
      return patient.activatedAt ? null : 'This patient hasn’t set up their account yet. Resend the activation link instead.';
    case SupportAction.RETRY_FAILED_PAYMENT:
      return patient.stripeCustomerId || patient.stripeSubscriptionId ? null : 'There is no payment profile on file for this patient, so there is nothing to retry.';
    default:
      return null;
  }
}
