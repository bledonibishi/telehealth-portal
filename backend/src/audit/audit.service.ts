import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '../common/enums';

interface AuditLogPayload {
  actorId: string;
  actorRole: UserRole;
  action: string;
  resourceType: string;
  resourceId: string;
  /** The patient the action concerns; taken from the resource when that is the patient itself. */
  patientId?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  /**
   * Pass the caller's transaction client as `tx` to make the audit row part of the same
   * transaction as the change it records: if this write fails, that change rolls back.
   */
  async log(payload: AuditLogPayload, tx?: Prisma.TransactionClient): Promise<void> {
    try {
      const patientId = payload.patientId ?? (payload.resourceType === 'Patient' ? payload.resourceId : undefined);
      await (tx ?? this.prisma).auditLogEntry.create({ data: { ...payload, patientId } as any });
    } catch (err) {
      // A silently-lost audit row is a compliance gap — fail loudly
      console.error('[AUDIT FAILURE] Could not write audit log:', payload, err);
      throw new InternalServerErrorException(
        'Audit log write failed — action cannot complete safely',
      );
    }
  }

  /** Everything recorded about one patient, oldest first. */
  findByPatient(patientId: string) {
    return this.prisma.auditLogEntry.findMany({
      where: { patientId },
      orderBy: { timestamp: 'asc' },
    });
  }

  findByResource(resourceType: string, resourceId: string) {
    return this.prisma.auditLogEntry.findMany({
      where: { resourceType, resourceId },
      orderBy: { timestamp: 'asc' },
    });
  }
}
