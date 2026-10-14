import { Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { UserRole } from '../common/enums';
import { ErrorCode, appError } from '../common/errors/app-error';
import { AuthService, LoginAttempt } from './auth.service';
import { EmailVerificationService } from './email-verification.service';

const normalise = (email: string) => email.trim().toLowerCase();

/**
 * A patient changes the email they sign in with. Sensitive (it is how a stolen session becomes a stolen account), so it
 * takes the current password AND a code sent to the NEW address; the old address is told afterwards and every other
 * session is ended.
 */
@Injectable()
export class EmailChangeService {
  private readonly logger = new Logger(EmailChangeService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private email: EmailService,
    private verification: EmailVerificationService,
    private auth: AuthService,
  ) {}

  private async patientWithPassword(id: string, password: string, attempt: LoginAttempt) {
    const row = await this.prisma.patient.findUnique({ where: { id } });
    if (!row || !(await bcrypt.compare(password, row.passwordHash))) {
      await this.audit.log({ actorId: id, actorRole: UserRole.PATIENT, action: 'AUTH_EMAIL_CHANGE_FAILED', resourceType: 'Patient', resourceId: id, metadata: { ...attempt } });
      // A 400, not a 401: a typo here must not sign anyone out.
      throw appError(ErrorCode.WRONG_CURRENT_PASSWORD);
    }
    return row;
  }

  private async assertFree(newEmail: string, currentEmail: string) {
    if (newEmail === currentEmail.toLowerCase()) throw appError(ErrorCode.BAD_REQUEST, 'That is already your email address.');
    // A lead (someone who filled in the quiz) counts too: when they pay, their address must still be theirs to turn into an account.
    const [patient, clinician, lead] = await Promise.all([
      this.prisma.patient.findUnique({ where: { email: newEmail }, select: { id: true } }),
      this.prisma.clinician.findUnique({ where: { email: newEmail }, select: { id: true } }),
      this.prisma.lead.findUnique({ where: { email: newEmail }, select: { id: true } }),
    ]);
    // Same wording whichever table it was found in; it does not say whose address it is.
    if (patient || clinician || lead) throw appError(ErrorCode.BAD_REQUEST, 'That email address can’t be used. Please choose another.');
  }

  /** Step 1: check the password and send a code to the new address. */
  async request(patientId: string, rawNewEmail: string, password: string, attempt: LoginAttempt = {}): Promise<boolean> {
    const row = await this.patientWithPassword(patientId, password, attempt);
    const newEmail = normalise(rawNewEmail);
    await this.assertFree(newEmail, row.email);
    await this.verification.requestCode(newEmail);
    return true;
  }

  /**
   * Step 2: the code proves the new inbox is theirs; the address changes and the other sessions end. The password is asked
   * for again here: the code alone could be fetched by anyone holding a borrowed session, who never took step 1.
   */
  async confirm(patientId: string, rawNewEmail: string, code: string, password: string, attempt: LoginAttempt = {}) {
    const newEmail = normalise(rawNewEmail);
    const row = await this.patientWithPassword(patientId, password, attempt);
    await this.assertFree(newEmail, row.email);
    await this.verification.verifyCode(newEmail, code);

    const oldEmail = row.email;
    try {
      await this.prisma.$transaction(async (tx: any) => {
        const changed = await tx.patient.updateMany({
          where: { id: patientId, email: oldEmail, tokenVersion: row.tokenVersion ?? 0 },
          data: { email: newEmail, tokenVersion: { increment: 1 } },
        });
        if (changed.count !== 1) throw appError(ErrorCode.CONFLICT, 'Something on your account changed a moment ago. Please start again and ask for a new code.');
        // A reset link already sent to the old address must not work any more: it would hand the account to whoever still reads that inbox.
        await tx.passwordReset.updateMany({ where: { accountType: 'PATIENT', accountId: patientId, usedAt: null }, data: { usedAt: new Date() } });
        await this.audit.log({ actorId: patientId, actorRole: UserRole.PATIENT, action: 'AUTH_EMAIL_CHANGED', resourceType: 'Patient', resourceId: patientId, metadata: { from: oldEmail, to: newEmail, ...attempt } }, tx);
      });
    } catch (err: any) {
      // Someone took the address between the check and the save.
      if (err?.code === 'P2002') throw appError(ErrorCode.BAD_REQUEST, 'That email address can’t be used. Please choose another.');
      throw err;
    }
    // The old inbox is told; if that could not be sent, it is recorded so the team can see it.
    let noticeSent = false;
    try {
      noticeSent = await this.email.sendEmailChangedEmail(oldEmail, row.firstName, newEmail);
    } catch (err: any) {
      this.logger.error(`Email-changed notice to ${patientId} failed: ${err.message}`);
    }
    if (!noticeSent) {
      this.logger.warn(`The email-changed notice for ${patientId} was not delivered`);
      await this.audit.log({ actorId: patientId, actorRole: UserRole.PATIENT, action: 'AUTH_EMAIL_CHANGED_NOTICE_NOT_SENT', resourceType: 'Patient', resourceId: patientId, metadata: {} }).catch(() => undefined);
    }
    return this.auth.issueTokens(patientId, UserRole.PATIENT, (row.tokenVersion ?? 0) + 1);
  }
}
