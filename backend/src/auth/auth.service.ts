import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
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
import { AuthFailureReason, authFailure, reasonFromJwtError } from './auth-failure';

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
    const clinician = await this.prisma.clinician.findUnique({ where: { email } });
    if (!clinician || !(await bcrypt.compare(password, clinician.passwordHash))) {
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
        { sub: clinician.id, role: UserRole.CLINICIAN, mfaPending: true },
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
    return { mfaRequired: false, pendingToken: null, ...this.issueTokens(clinician.id, clinician.role), clinician };
  }

  /**
   * Spends a clinician's invitation (or password) link to set their password. It does not sign them in: they sign in the
   * normal way next, with MFA if they have it, so a link in an inbox never gives access on its own.
   */
  async acceptClinicianInvite(token: string, password: string, attempt: LoginAttempt = {}): Promise<boolean> {
    const invalidLink = () => new UnauthorizedException('This link is invalid or has expired. Ask an admin to send a new one.');
    if (password.length < 10 || password.length > 72) throw new BadRequestException('Password must be between 10 and 72 characters');

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

    const passwordHash = await bcrypt.hash(password, 10);
    // The password, the spent link and the audit row commit together; matching the token again makes it single-use even if two requests race.
    const claimed = await this.prisma.$transaction(async (tx) => {
      const result = await tx.clinician.updateMany({
        where: { id: clinician.id, inviteToken: token },
        data: { passwordHash, passwordSetAt: new Date(), inviteToken: null, inviteTokenExpiresAt: null },
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
    if (!patient || !(await bcrypt.compare(password, patient.passwordHash))) {
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
    return { mfaRequired: false, pendingToken: null, ...this.issueTokens(patient.id, UserRole.PATIENT), patient };
  }

  /**
   * Emails a fresh activation link to a paid-but-not-yet-activated patient.
   * Always resolves true, whether or not the address matches an account, so
   * this can't be used to find out who is a patient.
   */
  async requestActivationLink(email: string): Promise<boolean> {
    const patient = await this.prisma.patient.findFirst({
      where: { email: { equals: email.trim(), mode: 'insensitive' } },
    });
    if (!patient || patient.activatedAt) return true;

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

    if (password.length < 10 || password.length > 72) {
      throw new BadRequestException('Password must be between 10 and 72 characters');
    }

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

    const passwordHash = await bcrypt.hash(password, 10);
    const activatedAt = patient.activatedAt ?? new Date();
    // One transaction: the password change, the spent token and the audit row
    // commit together, so a failed audit write can't leave a patient with a
    // changed password, a cleared link and no way in. Matching on the token again
    // makes this single-use even if two requests race.
    const claimed = await this.prisma.$transaction(async (tx) => {
      const result = await tx.patient.updateMany({
        where: { id: patient.id, activationToken: token },
        data: { passwordHash, activatedAt, activationToken: null, activationTokenExpiresAt: null },
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
      ...this.issueTokens(patient.id, UserRole.PATIENT),
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
   * A signed-in patient changes their own password. They must give the current one, so a borrowed or stolen
   * session can't lock the owner out. Sessions already open elsewhere stay signed in until their token expires.
   */
  async changePatientPassword(patientId: string, currentPassword: string, newPassword: string, attempt: LoginAttempt = {}): Promise<boolean> {
    if (newPassword.length < 10 || newPassword.length > 72) throw new BadRequestException('Password must be between 10 and 72 characters');
    if (newPassword === currentPassword) throw new BadRequestException('Choose a password you are not already using');
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId }, select: { id: true, passwordHash: true } });
    if (!patient || !(await bcrypt.compare(currentPassword, patient.passwordHash))) {
      await this.audit.log({ actorId: patientId, actorRole: UserRole.PATIENT, action: 'AUTH_PASSWORD_CHANGE_FAILED', resourceType: 'Patient', resourceId: patientId, metadata: { ...attempt } });
      throw new UnauthorizedException('Your current password is not right');
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.$transaction(async (tx) => {
      await tx.patient.update({ where: { id: patientId }, data: { passwordHash } });
      await this.audit.log({ actorId: patientId, actorRole: UserRole.PATIENT, action: 'AUTH_PASSWORD_CHANGED', resourceType: 'Patient', resourceId: patientId, metadata: { ...attempt } }, tx);
    });
    return true;
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
    return { mfaRequired: false, pendingToken: null, ...this.issueTokens(clinician.id, clinician.role), clinician };
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
      return this.issueTokens(patient.id, UserRole.PATIENT);
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

    return this.issueTokens(clinician.id, clinician.role);
  }

  private issueTokens(sub: string, role: string) {
    return {
      accessToken: this.jwtService.sign({ sub, role }),
      refreshToken: this.jwtService.sign(
        { sub, role, type: 'refresh' },
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
