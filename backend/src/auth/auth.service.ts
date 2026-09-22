import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UserRole } from '../common/enums';
import * as bcrypt from 'bcrypt';
import { authenticator } from 'otplib';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private audit: AuditService,
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

    const accessToken = this.jwtService.sign({ sub: clinician.id, role: UserRole.CLINICIAN });
    return { mfaRequired: false, pendingToken: null, accessToken, clinician };
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

    const accessToken = this.jwtService.sign({ sub: clinician.id, role: UserRole.CLINICIAN });
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
    return true;
  }
}
