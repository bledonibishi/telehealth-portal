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

    const token = newActivationToken();
    await this.prisma.patient.update({ where: { id: patient.id }, data: token });

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
    // Matching on the token again makes this single-use even if two requests race.
    const claimed = await this.prisma.patient.updateMany({
      where: { id: patient.id, activationToken: token },
      data: { passwordHash, activatedAt, activationToken: null, activationTokenExpiresAt: null },
    });
    if (claimed.count !== 1) throw invalidLink();

    await this.audit.log({
      actorId: patient.id,
      actorRole: UserRole.PATIENT,
      action: 'AUTH_ACCOUNT_ACTIVATED',
      resourceType: 'Patient',
      resourceId: patient.id,
      metadata: { ...attempt },
    });
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
