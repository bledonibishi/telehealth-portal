import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole } from '../../common/enums';

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
    if (payload.mfaPending) {
      throw new UnauthorizedException('MFA verification required');
    }

    if (payload.role === UserRole.CLINICIAN) {
      const clinician = await this.prisma.clinician.findUnique({ where: { id: payload.sub } });
      if (!clinician) throw new UnauthorizedException();
      return { id: clinician.id, email: clinician.email, role: UserRole.CLINICIAN };
    }

    if (payload.role === UserRole.PATIENT) {
      const patient = await this.prisma.patient.findUnique({ where: { id: payload.sub } });
      if (!patient) throw new UnauthorizedException();
      return { id: patient.id, email: patient.email, role: UserRole.PATIENT };
    }

    throw new UnauthorizedException();
  }
}
