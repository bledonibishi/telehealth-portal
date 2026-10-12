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

  /** Like record, but not again for a version they have already accepted. */
  async recordOnce(patientId: string, type: ConsentType, version: string | undefined, meta: RequestMeta) {
    if (version && (await this.prisma.consent.count({ where: { patientId, type, version } })) > 0) return;
    await this.record(patientId, type, version, meta);
  }

  /** Whether the patient has accepted this consent (any version): the wording they agreed to is on the record. */
  async hasAccepted(patientId: string, type: ConsentType): Promise<boolean> {
    return (await this.prisma.consent.count({ where: { patientId, type } })) > 0;
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
