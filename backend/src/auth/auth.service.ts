import { BadRequestException, ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UserRole, ClinicianRole } from '../common/enums';
import * as bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import { PostHogService } from '../posthog/posthog.service';
import { EmailService } from '../email/email.service';
import { newActivationToken } from './activation-token';
import { BCRYPT_ROUNDS, assertAcceptablePassword } from './password-policy';
import { PASSWORD_RESET_TTL_MINUTES, hashResetToken, newPasswordResetToken } from './password-reset-token';
import { AuthFailureReason, authFailure, reasonFromJwtError } from './auth-failure';

// Compared against when the address matches no account, so a wrong address takes as long as a wrong password.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

export interface LoginAttempt {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private audit: AuditService,
    private posthog: PostHogService,
    private config: ConfigService,
    private email: EmailService,
  ) {}

  async loginClinician(email: string, password: string, attempt: LoginAttempt = {}) {
    // Team management keeps addresses lower-case, while people type their own with capitals. The address exactly as
    // typed is tried first, so an older account saved with capitals is still found; then any spelling of it.
    const typed = (email ?? '').trim();
    const clinician =
      (await this.prisma.clinician.findUnique({ where: { email: typed } })) ??
      (typed ? await this.prisma.clinician.findFirst({ where: { email: { equals: typed, mode: 'insensitive' } }, orderBy: { createdAt: 'asc' } }) : null);
    if (!(await this.passwordMatches(password, clinician?.passwordHash))) {
      await this.audit.log({
        actorId: clinician?.id ?? 'anonymous',
        actorRole: UserRole.CLINICIAN,
        action: 'AUTH_LOGIN_FAILED',
        resourceType: 'Clinician',
        resourceId: clinician?.id ?? 'unknown',
        metadata: { email, reason: clinician ? 'BAD_PASSWORD' : 'UNKNOWN_EMAIL', ...attempt },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    // Said only after the password was right, so it cannot be used to find out who has an account.
    if (clinician.deactivatedAt) {
      await this.audit.log({
        actorId: clinician.id,
        actorRole: UserRole.CLINICIAN,
        action: 'AUTH_LOGIN_FAILED',
        resourceType: 'Clinician',
        resourceId: clinician.id,
        metadata: { email, reason: 'DEACTIVATED', ...attempt },
      });
      throw new UnauthorizedException('This account has been deactivated. Ask an admin to turn it back on.');
    }

    await this.audit.log({
      actorId: clinician.id,
      actorRole: UserRole.CLINICIAN,
      action: 'AUTH_LOGIN_PASSWORD',
      resourceType: 'Clinician',
      resourceId: clinician.id,
    });

    if (clinician.mfaEnabled) {
      const pendingToken = this.jwtService.sign(
        { sub: clinician.id, role: UserRole.CLINICIAN, mfaPending: true, tv: clinician.tokenVersion ?? 0 },
        { expiresIn: '5m' },
      );
      return { mfaRequired: true, pendingToken, accessToken: null, clinician: null };
    }

    this.posthog.identify(clinician.id, {
      email: clinician.email,
      first_name: clinician.firstName,
      last_name: clinician.lastName,
      role: clinician.role,
    });
    this.posthog.capture(clinician.id, 'clinician_logged_in', {
      login_method: 'password',
      mfa_enabled: false,
    });
    return { mfaRequired: false, pendingToken: null, ...this.issueTokens(clinician.id, clinician.role, clinician.tokenVersion), clinician };
  }

  /**
   * Spends a clinician's invitation (or password) link to set their password. It does not sign them in: they sign in the
   * normal way next, with MFA if they have it, so a link in an inbox never gives access on its own.
   */
  async acceptClinicianInvite(token: string, password: string, attempt: LoginAttempt = {}): Promise<boolean> {
    const invalidLink = () => new UnauthorizedException('This link is invalid or has expired. Ask an admin to send a new one.');
    assertAcceptablePassword(password);

    const clinician = token ? await this.prisma.clinician.findUnique({ where: { inviteToken: token } }) : null;
    if (!clinician?.inviteTokenExpiresAt || clinician.inviteTokenExpiresAt < new Date() || clinician.deactivatedAt) {
      await this.audit.log({
        actorId: clinician?.id ?? 'anonymous',
        actorRole: UserRole.CLINICIAN,
        action: 'AUTH_INVITE_FAILED',
        resourceType: 'Clinician',
        resourceId: clinician?.id ?? 'unknown',
        metadata: { reason: !clinician ? 'UNKNOWN_TOKEN' : clinician.deactivatedAt ? 'DEACTIVATED' : 'EXPIRED', ...attempt },
      });
      throw invalidLink();
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    // The password, the spent link and the audit row commit together; matching the token again makes it single-use even if two requests race.
    const claimed = await this.prisma.$transaction(async (tx) => {
      const result = await tx.clinician.updateMany({
        // Checked again as the link is spent: it may have expired, or the account been turned off, while the password was being hashed.
        where: { id: clinician.id, inviteToken: token, inviteTokenExpiresAt: { gt: new Date() }, deactivatedAt: null },
        data: { passwordHash, passwordSetAt: new Date(), inviteToken: null, inviteTokenExpiresAt: null, tokenVersion: { increment: 1 } },
      });
      if (result.count !== 1) return false;
      await this.audit.log(
        { actorId: clinician.id, actorRole: UserRole.CLINICIAN, action: 'AUTH_INVITE_ACCEPTED', resourceType: 'Clinician', resourceId: clinician.id, metadata: { firstTime: !clinician.passwordSetAt, ...attempt } },
        tx,
      );
      return true;
    });
    if (!claimed) throw invalidLink();
    return true;
  }

  async loginPatient(email: string, password: string, attempt: LoginAttempt = {}) {
    const patient = await this.prisma.patient.findUnique({ where: { email } });
    if (!(await this.passwordMatches(password, patient?.passwordHash))) {
      await this.auditPatientLoginFailed(email, patient?.id, patient ? 'BAD_PASSWORD' : 'UNKNOWN_EMAIL', attempt);
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!patient.activatedAt) {
      await this.auditPatientLoginFailed(email, patient.id, 'NOT_ACTIVATED', attempt);
      throw new UnauthorizedException('Account not activated — check your email for the activation link');
    }

    await this.audit.log({
      actorId: patient.id,
      actorRole: UserRole.PATIENT,
      action: 'AUTH_LOGIN_PASSWORD',
      resourceType: 'Patient',
      resourceId: patient.id,
    });

    this.posthog.identify(patient.id, {
      email: patient.email,
      first_name: patient.firstName,
      last_name: patient.lastName,
      role: UserRole.PATIENT,
    });
    this.posthog.capture(patient.id, 'patient_logged_in', {
      login_method: 'password',
    });
    return { mfaRequired: false, pendingToken: null, ...this.issueTokens(patient.id, UserRole.PATIENT, patient.tokenVersion), patient };
  }

  /**
   * Emails a fresh activation link to a paid-but-not-yet-activated patient.
   * Resolves true for an address with no account, so a typo is not told apart from a patient. The owner chose to tell
   * someone whose account already has a password, so they are sent to sign in or reset it instead of waiting for an email.
   */
  async requestActivationLink(email: string): Promise<boolean> {
    const patient = await this.prisma.patient.findFirst({
      where: { email: { equals: email.trim(), mode: 'insensitive' } },
    });
    if (!patient) return true;
    if (patient.activatedAt) throw new ConflictException('A password is already set for this account. Sign in, or reset your password if you have forgotten it.');

    // Reuse a link that is still valid instead of replacing it: repeated requests
    // can't invalidate the one the patient already holds (e.g. the one emailed
    // right after payment). Volume is capped by the per-account throttle.
    const stillValid = patient.activationToken && patient.activationTokenExpiresAt && patient.activationTokenExpiresAt > new Date();
    const token = stillValid
      ? { activationToken: patient.activationToken!, activationTokenExpiresAt: patient.activationTokenExpiresAt! }
      : newActivationToken();
    if (!stillValid) await this.prisma.patient.update({ where: { id: patient.id }, data: token });

    const appUrl = this.config.get<string>('PATIENT_APP_URL') ?? 'http://localhost:3000';
    try {
      await this.email.sendActivationEmail(patient.email, patient.firstName, `${appUrl}/activate?token=${token.activationToken}`);
    } catch (err: any) {
      // Don't let a mail outage reveal that the account exists.
      this.logger.error(`Activation email to patient ${patient.id} failed: ${err.message}`);
    }
    return true;
  }

  /** Spends a single-use activation token to set the patient's password, and signs them in. */
  async activateAccount(token: string, password: string, attempt: LoginAttempt = {}) {
    const invalidLink = () => new UnauthorizedException('This activation link is invalid or has expired');

    assertAcceptablePassword(password);

    const patient = await this.prisma.patient.findUnique({ where: { activationToken: token } });
    if (!patient?.activationTokenExpiresAt || patient.activationTokenExpiresAt < new Date()) {
      await this.audit.log({
        actorId: patient?.id ?? 'anonymous',
        actorRole: UserRole.PATIENT,
        action: 'AUTH_ACTIVATION_FAILED',
        resourceType: 'Patient',
        resourceId: patient?.id ?? 'unknown',
        metadata: { reason: patient ? 'EXPIRED' : 'UNKNOWN_TOKEN', ...attempt },
      });
      throw invalidLink();
    }

    assertAcceptablePassword(password, patient.email);
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const activatedAt = patient.activatedAt ?? new Date();
    // One transaction: the password change, the spent token and the audit row
    // commit together, so a failed audit write can't leave a patient with a
    // changed password, a cleared link and no way in. Matching on the token again
    // makes this single-use even if two requests race.
    const claimed = await this.prisma.$transaction(async (tx) => {
      const result = await tx.patient.updateMany({
        where: { id: patient.id, activationToken: token },
        data: { passwordHash, activatedAt, activationToken: null, activationTokenExpiresAt: null, tokenVersion: { increment: 1 } },
      });
      if (result.count !== 1) return false;
      await this.audit.log(
        {
          actorId: patient.id,
          actorRole: UserRole.PATIENT,
          action: 'AUTH_ACCOUNT_ACTIVATED',
          resourceType: 'Patient',
          resourceId: patient.id,
          metadata: { ...attempt },
        },
        tx,
      );
      return true;
    });
    if (!claimed) throw invalidLink();

    this.posthog.identify(patient.id, {
      email: patient.email,
      first_name: patient.firstName,
      last_name: patient.lastName,
      role: UserRole.PATIENT,
    });
    this.posthog.capture(patient.id, 'patient_activated', { login_method: 'activation_link' });

    return {
      mfaRequired: false,
      pendingToken: null,
      ...this.issueTokens(patient.id, UserRole.PATIENT, patient.tokenVersion + 1),
      patient: { ...patient, activatedAt },
    };
  }

  private auditPatientLoginFailed(email: string, patientId: string | undefined, reason: string, attempt: LoginAttempt) {
    return this.audit.log({
      actorId: patientId ?? 'anonymous',
      actorRole: UserRole.PATIENT,
      action: 'AUTH_LOGIN_FAILED',
      resourceType: 'Patient',
      resourceId: patientId ?? 'unknown',
      metadata: { email, reason, ...attempt },
    });
  }

  /**
   * A signed-in patient or clinician changes their own password. The current one is required, so a borrowed or stolen
   * session can't lock the owner out. Every other session is ended and the caller gets fresh tokens so this one carries on.
   */
  async changeOwnPassword(account: { id: string; role: string }, currentPassword: string, newPassword: string, attempt: LoginAttempt = {}) {
    const isPatient = account.role === UserRole.PATIENT;
    const actorRole = isPatient ? UserRole.PATIENT : UserRole.CLINICIAN;
    const resourceType = isPatient ? 'Patient' : 'Clinician';
    const row: any = isPatient
      ? await this.prisma.patient.findUnique({ where: { id: account.id } })
      : await this.prisma.clinician.findUnique({ where: { id: account.id } });
    if (!row || !(await bcrypt.compare(currentPassword, row.passwordHash))) {
      await this.audit.log({ actorId: account.id, actorRole, action: 'AUTH_PASSWORD_CHANGE_FAILED', resourceType, resourceId: account.id, metadata: { ...attempt } });
      throw new UnauthorizedException('Your current password is not right');
    }
    assertAcceptablePassword(newPassword, row.email);
    if (newPassword === currentPassword) throw new BadRequestException('Choose a password you are not already using');

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    const data = { passwordHash, tokenVersion: { increment: 1 }, ...(isPatient ? {} : { passwordSetAt: new Date() }) };
    await this.prisma.$transaction(async (tx: any) => {
      // Only if nothing changed the password since it was checked: two overlapping changes must not both succeed, or the
      // second would end the session the first one just handed back.
      const changed = await (isPatient ? tx.patient : tx.clinician).updateMany({ where: { id: account.id, passwordHash: row.passwordHash, tokenVersion: row.tokenVersion ?? 0 }, data });
      if (changed.count !== 1) throw new ConflictException('Your password was changed somewhere else a moment ago. Please try again.');
      await this.audit.log({ actorId: account.id, actorRole, action: 'AUTH_PASSWORD_CHANGED', resourceType, resourceId: account.id, metadata: { ...attempt } }, tx);
    });
    await this.notifyPasswordChanged(row, isPatient);
    return this.issueTokens(account.id, isPatient ? UserRole.PATIENT : row.role, (row.tokenVersion ?? 0) + 1);
  }

  /** Ends every session of the signed-in account, this one included. */
  async signOutEverywhere(account: { id: string; role: string }, attempt: LoginAttempt = {}): Promise<boolean> {
    const isPatient = account.role === UserRole.PATIENT;
    const model: any = isPatient ? this.prisma.patient : this.prisma.clinician;
    await model.update({ where: { id: account.id }, data: { tokenVersion: { increment: 1 } } });
    await this.audit.log({ actorId: account.id, actorRole: isPatient ? UserRole.PATIENT : UserRole.CLINICIAN, action: 'AUTH_SIGNED_OUT_EVERYWHERE', resourceType: isPatient ? 'Patient' : 'Clinician', resourceId: account.id, metadata: { ...attempt } });
    return true;
  }

  /**
   * "Forgot password". Always resolves true, whether or not the address matches an account, so it can't be used to find
   * out who has one. A patient who never activated is sent an activation link instead, since they have no password to reset.
   */
  async requestPasswordReset(email: string, audience: 'patient' | 'staff', attempt: LoginAttempt = {}): Promise<boolean> {
    const typed = (email ?? '').trim();
    if (!typed) return true;
    const isPatient = audience === 'patient';
    const account: any = isPatient
      ? await this.prisma.patient.findFirst({ where: { email: { equals: typed, mode: 'insensitive' } } })
      : await this.prisma.clinician.findFirst({ where: { email: { equals: typed, mode: 'insensitive' } }, orderBy: { createdAt: 'asc' } });
    if (!account) return true;
    if (isPatient && !account.activatedAt) return this.requestActivationLink(typed);
    // Someone invited who has not chosen a password yet, or whose account is off, has no use for a reset link.
    if (!isPatient && (account.deactivatedAt || !account.passwordSetAt)) return true;

    const accountType = isPatient ? 'PATIENT' : 'CLINICIAN';
    const { token, tokenHash, expiresAt } = newPasswordResetToken();
    const created = await this.prisma.$transaction(async (tx: any) => {
      // The newest link is added first and older ones are removed only once it has been sent (below), so a refused
      // email does not leave the owner with no working link.
      const row = await tx.passwordReset.create({ data: { accountType, accountId: account.id, tokenHash, expiresAt } });
      await this.audit.log({ actorId: account.id, actorRole: isPatient ? UserRole.PATIENT : UserRole.CLINICIAN, action: 'AUTH_PASSWORD_RESET_REQUESTED', resourceType: accountType === 'PATIENT' ? 'Patient' : 'Clinician', resourceId: account.id, metadata: { ...attempt } }, tx);
      return row;
    });

    const base = isPatient
      ? this.config.get<string>('PATIENT_APP_URL')?.trim() || 'http://localhost:3000'
      : this.config.get<string>('CLINICIAN_APP_URL')?.trim() || 'http://localhost:3002';
    // Not awaited: the answer must not wait on the mail provider, or its speed would tell a real account from an unknown one.
    void this.email
      .sendPasswordResetEmail(account.email, account.firstName, `${base.replace(/\/$/, '')}/reset-password?token=${token}`, audience, PASSWORD_RESET_TTL_MINUTES)
      .then(async (sent) => {
        if (sent) await this.prisma.passwordReset.deleteMany({ where: { accountType, accountId: account.id, usedAt: null, id: { not: created.id } } });
      })
      .catch((err: any) => this.logger.error(`Password reset email to ${accountType.toLowerCase()} ${account.id} failed: ${err.message}`));
    return true;
  }

  /** Spends a reset link to set a new password and ends every open session. It does not sign anyone in. */
  async resetPassword(token: string, newPassword: string, attempt: LoginAttempt = {}): Promise<boolean> {
    const invalidLink = () => new UnauthorizedException('This link is invalid or has expired. Request a new one.');
    const tokenHash = token ? hashResetToken(token) : '';
    const reset = tokenHash ? await this.prisma.passwordReset.findUnique({ where: { tokenHash } }) : null;
    const isPatient = reset?.accountType === 'PATIENT';
    const failed = (reason: string) =>
      this.audit.log({ actorId: reset?.accountId ?? 'anonymous', actorRole: isPatient ? UserRole.PATIENT : UserRole.CLINICIAN, action: 'AUTH_PASSWORD_RESET_FAILED', resourceType: isPatient ? 'Patient' : 'Clinician', resourceId: reset?.accountId ?? 'unknown', metadata: { reason, ...attempt } });

    if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
      await failed(!reset ? 'UNKNOWN_TOKEN' : reset.usedAt ? 'USED' : 'EXPIRED');
      throw invalidLink();
    }
    const account: any = isPatient
      ? await this.prisma.patient.findUnique({ where: { id: reset.accountId } })
      : await this.prisma.clinician.findUnique({ where: { id: reset.accountId } });
    if (!account || account.deactivatedAt) {
      await failed(!account ? 'NO_ACCOUNT' : 'DEACTIVATED');
      throw invalidLink();
    }
    assertAcceptablePassword(newPassword, account.email);

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    const claimed = await this.prisma.$transaction(async (tx: any) => {
      // Matching on usedAt: null makes the link single-use even if two requests race.
      const spent = await tx.passwordReset.updateMany({ where: { id: reset.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
      if (spent.count !== 1) return false;
      const changed = await (isPatient ? tx.patient : tx.clinician).updateMany({
        // Checked again here: the account may have been turned off while the password was being hashed.
        where: { id: account.id, ...(isPatient ? {} : { deactivatedAt: null }) },
        data: { passwordHash, tokenVersion: { increment: 1 }, ...(isPatient ? {} : { passwordSetAt: new Date(), inviteToken: null, inviteTokenExpiresAt: null }) },
      });
      // Thrown, not returned, so the spent link rolls back with everything else.
      if (changed.count !== 1) throw invalidLink();
      await tx.passwordReset.deleteMany({ where: { accountType: reset.accountType, accountId: account.id, usedAt: null } });
      await this.audit.log({ actorId: account.id, actorRole: isPatient ? UserRole.PATIENT : UserRole.CLINICIAN, action: 'AUTH_PASSWORD_RESET', resourceType: isPatient ? 'Patient' : 'Clinician', resourceId: account.id, metadata: { ...attempt } }, tx);
      return true;
    });
    if (!claimed) throw invalidLink();
    await this.notifyPasswordChanged(account, isPatient);
    return true;
  }

  private async notifyPasswordChanged(account: { id: string; email: string; firstName: string }, isPatient: boolean) {
    try {
      await this.email.sendPasswordChangedEmail(account.email, account.firstName, isPatient ? 'patient' : 'staff');
    } catch (err: any) {
      this.logger.error(`Password-changed email to ${account.id} failed: ${err.message}`);
    }
  }

  private async passwordMatches(password: string, hash?: string | null) {
    // Always spends the same time on a bcrypt compare, so a wrong address can't be told apart from a wrong password by timing.
    const ok = await bcrypt.compare(password ?? '', hash ?? DUMMY_HASH);
    return !!hash && ok;
  }

  async verifyMfa(pendingToken: string, totpCode: string, attempt: LoginAttempt = {}) {
    let payload: any;
    try {
      payload = this.jwtService.verify(pendingToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired MFA session');
    }
    if (!payload.mfaPending) throw new UnauthorizedException('Not a pending MFA token');

    const clinician = await this.prisma.clinician.findUnique({ where: { id: payload.sub } });
    if (!clinician?.mfaSecret) throw new UnauthorizedException('MFA not configured');
    if (clinician.deactivatedAt) throw new UnauthorizedException('This account has been deactivated. Ask an admin to turn it back on.');
    // A password change or "sign out everywhere" after the password step cancels the sign-in that was waiting for a code.
    this.assertSessionCurrent(payload, clinician.tokenVersion);

    if (!authenticator.verify({ token: totpCode, secret: clinician.mfaSecret })) {
      await this.audit.log({
        actorId: clinician.id,
        actorRole: UserRole.CLINICIAN,
        action: 'AUTH_MFA_FAILED',
        resourceType: 'Clinician',
        resourceId: clinician.id,
        metadata: { ...attempt },
      });
      throw new UnauthorizedException('Invalid TOTP code');
    }

    await this.audit.log({
      actorId: clinician.id,
      actorRole: UserRole.CLINICIAN,
      action: 'AUTH_MFA_VERIFIED',
      resourceType: 'Clinician',
      resourceId: clinician.id,
    });

    this.posthog.identify(clinician.id, {
      email: clinician.email,
      first_name: clinician.firstName,
      last_name: clinician.lastName,
      role: clinician.role,
    });
    this.posthog.capture(clinician.id, 'clinician_logged_in', {
      login_method: 'password_and_mfa',
      mfa_enabled: true,
    });
    return { mfaRequired: false, pendingToken: null, ...this.issueTokens(clinician.id, clinician.role, clinician.tokenVersion), clinician };
  }

  async refreshAccessToken(refreshToken: string) {
    let payload: any;
    try {
      payload = this.jwtService.verify(refreshToken);
    } catch (err) {
      throw authFailure(reasonFromJwtError(err));
    }
    if (payload.type !== 'refresh') throw authFailure(AuthFailureReason.WRONG_TOKEN_TYPE);

    if (payload.role === UserRole.PATIENT) {
      const patient = await this.prisma.patient.findUnique({ where: { id: payload.sub } });
      if (!patient) throw authFailure(AuthFailureReason.ACCOUNT_NOT_FOUND);
      this.assertSessionCurrent(payload, patient.tokenVersion);
      return this.issueTokens(patient.id, UserRole.PATIENT, patient.tokenVersion);
    }

    // Accept both the specific ClinicianRole values and the old generic UserRole.CLINICIAN
    // shape, so refresh tokens issued before this rollout keep working.
    const clinicianRoles = Object.values(ClinicianRole) as string[];
    const clinician =
      payload.role === UserRole.CLINICIAN || clinicianRoles.includes(payload.role)
        ? await this.prisma.clinician.findUnique({ where: { id: payload.sub } })
        : null;
    if (!clinician) throw authFailure(AuthFailureReason.ACCOUNT_NOT_FOUND);
    if (clinician.deactivatedAt) throw authFailure(AuthFailureReason.ACCOUNT_DEACTIVATED);

    this.assertSessionCurrent(payload, clinician.tokenVersion);
    return this.issueTokens(clinician.id, clinician.role, clinician.tokenVersion);
  }

  /** Tokens issued before a password change or "sign out everywhere" carry an older number and stop working. */
  private assertSessionCurrent(payload: any, current: number | undefined) {
    if ((payload.tv ?? 0) !== (current ?? 0)) throw authFailure(AuthFailureReason.SESSION_REVOKED);
  }

  private issueTokens(sub: string, role: string, tokenVersion = 0) {
    return {
      accessToken: this.jwtService.sign({ sub, role, tv: tokenVersion }),
      refreshToken: this.jwtService.sign(
        { sub, role, tv: tokenVersion, type: 'refresh' },
        { expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRY', '7d') },
      ),
    };
  }

  async setupMfa(clinicianId: string) {
    const secret = authenticator.generateSecret();
    await this.prisma.clinician.update({
      where: { id: clinicianId },
      data: { mfaSecret: secret, mfaEnabled: false },
    });
    const otpauthUrl = authenticator.keyuri(clinicianId, 'TelehealthPortal', secret);
    return { secret, otpauthUrl };
  }

  async enableMfa(clinicianId: string, totpCode: string) {
    const clinician = await this.prisma.clinician.findUnique({ where: { id: clinicianId } });
    if (!clinician?.mfaSecret) throw new UnauthorizedException('Run setupMfa first');
    if (!authenticator.verify({ token: totpCode, secret: clinician.mfaSecret })) {
      throw new UnauthorizedException('Invalid TOTP code');
    }
    await this.prisma.clinician.update({
      where: { id: clinicianId },
      data: { mfaEnabled: true },
    });
    this.posthog.capture(clinicianId, 'mfa_enabled', {
      role: UserRole.CLINICIAN,
    });
    return true;
  }
}
