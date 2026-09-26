import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UserRole } from '../common/enums';
import * as bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import { PostHogService } from '../posthog/posthog.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private audit: AuditService,
    private posthog: PostHogService,
  ) {}

  async loginClinician(email: string, password: string) {
    const clinician = await this.prisma.clinician.findUnique({ where: { email } });
    if (!clinician || !(await bcrypt.compare(password, clinician.passwordHash))) {
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

    const accessToken = this.jwtService.sign({ sub: clinician.id, role: clinician.role });
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
    return { mfaRequired: false, pendingToken: null, accessToken, clinician };
  }

  async loginPatient(email: string, password: string) {
    const patient = await this.prisma.patient.findUnique({ where: { email } });
    if (!patient || !(await bcrypt.compare(password, patient.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!patient.activatedAt) {
      throw new UnauthorizedException('Account not activated — check your email for the activation link');
    }

    await this.audit.log({
      actorId: patient.id,
      actorRole: UserRole.PATIENT,
      action: 'AUTH_LOGIN_PASSWORD',
      resourceType: 'Patient',
      resourceId: patient.id,
    });

    const accessToken = this.jwtService.sign({ sub: patient.id, role: UserRole.PATIENT });
    this.posthog.identify(patient.id, {
      email: patient.email,
      first_name: patient.firstName,
      last_name: patient.lastName,
      role: UserRole.PATIENT,
    });
    this.posthog.capture(patient.id, 'patient_logged_in', {
      login_method: 'password',
    });
    return { mfaRequired: false, pendingToken: null, accessToken, patient };
  }

  async verifyMfa(pendingToken: string, totpCode: string) {
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
      throw new UnauthorizedException('Invalid TOTP code');
    }

    await this.audit.log({
      actorId: clinician.id,
      actorRole: UserRole.CLINICIAN,
      action: 'AUTH_MFA_VERIFIED',
      resourceType: 'Clinician',
      resourceId: clinician.id,
    });

    const accessToken = this.jwtService.sign({ sub: clinician.id, role: clinician.role });
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
    return { mfaRequired: false, pendingToken: null, accessToken, clinician };
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
