import { Args, ID, Query, Resolver } from '@nestjs/graphql';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { ClinicianRole, UserRole } from '../common/enums';
import { AuditService } from './audit.service';
import { AuditLogEntryModel } from './models/audit-log-entry.model';

@Resolver()
export class AuditResolver {
  constructor(private audit: AuditService) {}

  /** Every recorded medical decision and change for one patient, oldest first. Admins only. */
  @Authorized(ClinicianRole.ADMIN)
  @Query(() => [AuditLogEntryModel])
  async patientAuditTrail(@Args('patientId', { type: () => ID }) patientId: string): Promise<AuditLogEntryModel[]> {
    const rows = await this.audit.findByPatient(patientId);
    return rows.map((r) => ({ ...r, actorRole: r.actorRole as UserRole, metadata: r.metadata == null ? null : JSON.stringify(r.metadata) }));
  }
}
