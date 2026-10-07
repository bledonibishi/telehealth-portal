import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { BadRequestException } from '@nestjs/common';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/access-roles';
import { ClinicianRole, UserRole } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';
import { AuditLogEntryModel, AuditLogPageModel } from './models/audit-log-entry.model';
import { AuditLogFilterInput } from './dto/audit-log-filter.input';
import { RecordDataExportInput } from './dto/record-data-export.input';

/** The tables the clinician dashboard can export; anything else is not a real export. */
export const EXPORTABLE_RESOURCES = ['patients', 'leads', 'orders', 'lab-results', 'trt-monitoring', 'audit-log', 'monthly-report'];

@Resolver()
export class AuditResolver {
  constructor(
    private audit: AuditService,
    private prisma: PrismaService,
  ) {}

  /** Every recorded medical decision and change for one patient, oldest first. Admins only. */
  @Authorized(ClinicianRole.ADMIN)
  @Query(() => [AuditLogEntryModel])
  async patientAuditTrail(@Args('patientId', { type: () => ID }) patientId: string): Promise<AuditLogEntryModel[]> {
    const rows = await this.audit.findByPatient(patientId);
    return rows.map((r) => ({ ...r, actorRole: r.actorRole as UserRole, metadata: r.metadata == null ? null : JSON.stringify(r.metadata) }));
  }

  /** Who did what and when, across every record, newest first. Admins only. */
  @Authorized(ClinicianRole.ADMIN)
  @Query(() => AuditLogPageModel)
  async auditLog(@Args('filter', { nullable: true }) filter?: AuditLogFilterInput): Promise<AuditLogPageModel> {
    const { entries, nextCursor } = await this.audit.search(filter ?? {});

    const actorIds = [...new Set(entries.map((e) => e.actorId))];
    const patientIds = [...new Set(entries.map((e) => e.patientId).filter((id): id is string => !!id))];
    // An actor is either a clinician or a patient (ids never collide, so look in both).
    const [clinicians, patients] = await Promise.all([
      actorIds.length ? this.prisma.clinician.findMany({ where: { id: { in: actorIds } }, select: { id: true, firstName: true, lastName: true } }) : [],
      actorIds.length || patientIds.length
        ? this.prisma.patient.findMany({ where: { id: { in: [...actorIds, ...patientIds] } }, select: { id: true, firstName: true, lastName: true } })
        : [],
    ]);
    const names = new Map<string, string>();
    for (const p of [...clinicians, ...patients]) names.set(p.id, `${p.firstName} ${p.lastName}`.trim());

    return {
      nextCursor,
      entries: entries.map((r) => ({
        ...r,
        actorRole: r.actorRole as UserRole,
        actorName: names.get(r.actorId) ?? null,
        patientName: r.patientId ? names.get(r.patientId) ?? null : null,
        metadata: r.metadata == null ? null : JSON.stringify(r.metadata),
      })),
    };
  }

  /**
   * The dashboard builds exports in the browser, so it reports each one here first: patient
   * data leaving the system is itself something the audit log must show. Admins only.
   */
  @Authorized(ClinicianRole.ADMIN)
  @Mutation(() => Boolean)
  async recordDataExport(@CurrentUser() user: AuthUser, @Args('input') input: RecordDataExportInput): Promise<boolean> {
    if (!EXPORTABLE_RESOURCES.includes(input.resource)) throw new BadRequestException('Unknown export');
    await this.audit.log({
      actorId: user.id,
      actorRole: user.role as UserRole,
      action: 'DATA_EXPORTED',
      resourceType: 'Export',
      resourceId: input.resource,
      metadata: { rowCount: Math.max(0, Math.trunc(input.rowCount)) },
    });
    return true;
  }
}
