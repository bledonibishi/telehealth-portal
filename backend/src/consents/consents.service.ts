import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConsentType } from '../common/enums';
import { CURRENT_CONSENTS } from './consent-texts';

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class ConsentsService {
  constructor(private prisma: PrismaService) {}

  current(type: ConsentType) {
    return { type, ...CURRENT_CONSENTS[type] };
  }

  /** Records acceptance, refusing anything but the current wording. */
  async record(
    patientId: string,
    type: ConsentType,
    version: string | undefined,
    meta: RequestMeta,
    db: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    const current = CURRENT_CONSENTS[type];
    if (!version) throw new BadRequestException('Please read and accept the consent statement to continue');
    if (version !== current.version) {
      throw new BadRequestException('The consent statement has been updated — please reload the page and review it again');
    }
    return db.consent.create({
      data: { patientId, type, version, ipAddress: meta.ip ?? null, userAgent: meta.userAgent ?? null },
    });
  }
}
