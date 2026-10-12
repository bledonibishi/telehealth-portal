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

export interface AuditSearch {
  action?: string;
  resourceType?: string;
  patientId?: string;
  actorId?: string;
  from?: Date;
  /** Exclusive upper bound. */
  to?: Date;
  cursor?: string;
  limit?: number;
}

const DEFAULT_PAGE = 50;
const MAX_PAGE = 200;

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

  /** Newest first, one page at a time. Pass the previous page's `nextCursor` as `cursor` for the next. */
  async search(filter: AuditSearch) {
    const limit = Math.min(Math.max(Math.trunc(filter.limit ?? DEFAULT_PAGE), 1), MAX_PAGE);
    const rows = await this.prisma.auditLogEntry.findMany({
      where: {
        ...(filter.action ? { action: { contains: filter.action.trim(), mode: 'insensitive' as const } } : {}),
        ...(filter.resourceType ? { resourceType: filter.resourceType } : {}),
        ...(filter.patientId ? { patientId: filter.patientId } : {}),
        ...(filter.actorId ? { actorId: filter.actorId } : {}),
        ...(filter.from || filter.to ? { timestamp: { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lt: filter.to } : {}) } } : {}),
      },
      orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const entries = hasMore ? rows.slice(0, limit) : rows;
    return { entries, nextCursor: hasMore ? entries[entries.length - 1].id : null };
  }

  findByResource(resourceType: string, resourceId: string) {
    return this.prisma.auditLogEntry.findMany({
      where: { resourceType, resourceId },
      orderBy: { timestamp: 'asc' },
    });
  }
}
