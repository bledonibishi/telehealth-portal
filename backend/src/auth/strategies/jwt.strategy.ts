import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole } from '../../common/enums';
import { AuthFailureReason, authFailure } from '../auth-failure';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    if (payload.type === 'refresh') {
      throw authFailure(AuthFailureReason.WRONG_TOKEN_TYPE);
    }

    if (payload.mfaPending) {
      throw authFailure(AuthFailureReason.MFA_REQUIRED);
    }

    const clinicianRoles = ['ADMIN', 'DOCTOR', 'CX_TEAM', 'PROVIDER'];

    if (payload.role === UserRole.CLINICIAN || clinicianRoles.includes(payload.role)) {
      const clinician = await this.prisma.clinician.findUnique({ where: { id: payload.sub } });
      if (!clinician) throw authFailure(AuthFailureReason.ACCOUNT_NOT_FOUND);
      // Read from the database on every request, so turning an account off stops a session that is already open.
      if (clinician.deactivatedAt) throw authFailure(AuthFailureReason.ACCOUNT_DEACTIVATED);
      // role=CLINICIAN for DB writes (Role enum); clinicianRole for access control
      // A password change or "sign out everywhere" ends sessions that are already open.
      if ((payload.tv ?? 0) !== (clinician.tokenVersion ?? 0)) throw authFailure(AuthFailureReason.SESSION_REVOKED);
      return { id: clinician.id, email: clinician.email, role: UserRole.CLINICIAN, clinicianRole: clinician.role };
    }

    if (payload.role === UserRole.PATIENT) {
      const patient = await this.prisma.patient.findUnique({ where: { id: payload.sub } });
      if (!patient) throw authFailure(AuthFailureReason.ACCOUNT_NOT_FOUND);
      if ((payload.tv ?? 0) !== (patient.tokenVersion ?? 0)) throw authFailure(AuthFailureReason.SESSION_REVOKED);
      return { id: patient.id, email: patient.email, role: UserRole.PATIENT };
    }

    throw authFailure(AuthFailureReason.UNKNOWN_ROLE);
  }
}
