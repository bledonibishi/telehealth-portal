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

    if (clinicianRoles.includes(payload.role)) {
      const clinician = await this.prisma.clinician.findUnique({ where: { id: payload.sub } });
      if (!clinician) throw authFailure(AuthFailureReason.ACCOUNT_NOT_FOUND);
      // role=CLINICIAN for DB writes (Role enum); clinicianRole for access control
      return { id: clinician.id, email: clinician.email, role: UserRole.CLINICIAN, clinicianRole: clinician.role };
    }

    if (payload.role === UserRole.PATIENT) {
      const patient = await this.prisma.patient.findUnique({ where: { id: payload.sub } });
      if (!patient) throw authFailure(AuthFailureReason.ACCOUNT_NOT_FOUND);
      return { id: patient.id, email: patient.email, role: UserRole.PATIENT };
    }

    throw authFailure(AuthFailureReason.UNKNOWN_ROLE);
  }
}
