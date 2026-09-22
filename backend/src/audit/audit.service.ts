import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '../common/enums';

interface AuditLogPayload {
  actorId: string;
  actorRole: UserRole;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(payload: AuditLogPayload): Promise<void> {
    try {
      await this.prisma.auditLogEntry.create({ data: payload as any });
    } catch (err) {
      // A silently-lost audit row is a compliance gap — fail loudly
      console.error('[AUDIT FAILURE] Could not write audit log:', payload, err);
      throw new InternalServerErrorException(
        'Audit log write failed — action cannot complete safely',
      );
    }
  }

  findByResource(resourceType: string, resourceId: string) {
    return this.prisma.auditLogEntry.findMany({
      where: { resourceType, resourceId },
      orderBy: { timestamp: 'asc' },
    });
  }
}
