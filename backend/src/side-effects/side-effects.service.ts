import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrescriptionStatus, UserRole } from '../common/enums';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReportSideEffectsInput, SideEffectAlertModel, SideEffectReportModel } from './models/side-effect.model';
import { MAX_NOTE_LENGTH, MAX_REPORTS_PER_DAY, OPEN_ALERTS_WHERE, SIDE_EFFECT_KEYS, adviceFor, byUrgency } from './side-effects';

@Injectable()
export class SideEffectsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /** A patient tells their doctor about a side effect without waiting for the monthly check-in. */
  async report(patientId: string, input: ReportSideEffectsInput): Promise<SideEffectReportModel> {
    const effects = [...new Set((input.effects ?? []).map((e) => e.trim()))];
    if (effects.length === 0) throw new BadRequestException('Please choose at least one side effect');
    if (effects.some((e) => !SIDE_EFFECT_KEYS.includes(e))) throw new BadRequestException('Unknown side effect');
    const note = input.note?.trim() || null;
    if (note && note.length > MAX_NOTE_LENGTH) throw new BadRequestException(`Notes can be up to ${MAX_NOTE_LENGTH} characters`);

    const recent = await this.prisma.sideEffectReport.count({ where: { patientId, createdAt: { gte: new Date(Date.now() - 86_400_000) } } });
    if (recent >= MAX_REPORTS_PER_DAY) throw new BadRequestException('You’ve sent several reports today — please message your clinician instead');

    const rx = await this.prisma.prescription.findFirst({
      where: { patientId, status: PrescriptionStatus.ACTIVE },
      orderBy: { issuedAt: 'desc' },
      select: { medication: true, dosage: true },
    });
    const medication = rx ? `${rx.medication} ${rx.dosage}`.trim() : null;

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.sideEffectReport.create({ data: { patientId, effects, severity: input.severity, note, medication } });
      await this.audit.log(
        {
          actorId: patientId,
          actorRole: UserRole.PATIENT,
          action: 'SIDE_EFFECT_REPORTED',
          resourceType: 'SideEffectReport',
          resourceId: created.id,
          patientId,
          metadata: { effects, severity: input.severity },
        },
        tx,
      );
      return created;
    });
    return this.toModel(row, adviceFor(input.severity));
  }

  async mine(patientId: string): Promise<SideEffectReportModel[]> {
    const rows = await this.prisma.sideEffectReport.findMany({ where: { patientId }, orderBy: { createdAt: 'desc' }, take: 20 });
    return rows.map((r) => this.toModel(r));
  }

  /** Reports no doctor has looked at yet: the most severe first, then the longest waiting. */
  async alerts(): Promise<SideEffectAlertModel[]> {
    const rows = await this.prisma.sideEffectReport.findMany({
      where: OPEN_ALERTS_WHERE,
      include: { patient: { select: { id: true, firstName: true, lastName: true } } },
      // Severity first, so the limit can only ever cut off the mildest, newest ones. (The enum is
      // declared MILD, MODERATE, SEVERE, so descending puts SEVERE first.)
      orderBy: [{ severity: 'desc' }, { createdAt: 'asc' }],
      take: 200,
    });
    return rows
      .sort(byUrgency)
      .map((r) => ({ ...this.toModel(r), patientId: r.patient.id, patientName: `${r.patient.firstName} ${r.patient.lastName}` }));
  }

  /** A doctor has seen it. The first acknowledgement stands; the action is audited with the patient. */
  async acknowledge(clinicianId: string, id: string): Promise<SideEffectReportModel> {
    const existing = await this.prisma.sideEffectReport.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Report not found');

    const row = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.sideEffectReport.updateMany({ where: { id, acknowledgedAt: null }, data: { acknowledgedAt: new Date(), acknowledgedById: clinicianId } });
      if (count === 1) {
        await this.audit.log(
          {
            actorId: clinicianId,
            actorRole: UserRole.CLINICIAN,
            action: 'SIDE_EFFECT_ACKNOWLEDGED',
            resourceType: 'SideEffectReport',
            resourceId: id,
            patientId: existing.patientId,
            metadata: { severity: existing.severity, effects: existing.effects },
          },
          tx,
        );
      }
      return tx.sideEffectReport.findUniqueOrThrow({ where: { id } });
    });
    return this.toModel(row);
  }

  private toModel(r: { id: string; effects: string[]; severity: any; note: string | null; medication: string | null; createdAt: Date; acknowledgedAt: Date | null }, advice: string | null = null): SideEffectReportModel {
    return {
      id: r.id,
      effects: r.effects,
      severity: r.severity,
      note: r.note ?? undefined,
      medication: r.medication ?? undefined,
      createdAt: r.createdAt,
      acknowledgedAt: r.acknowledgedAt ?? undefined,
      advice: advice ?? undefined,
    };
  }
}
