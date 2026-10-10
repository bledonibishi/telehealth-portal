import { BadRequestException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { NotificationKind } from '@telehealth/shared-types';
import { NotifierService } from '../notifications/notifier.service';
import { ClinicianRole, ConsultationStatus, PrescriptionStatus, UserRole } from '../common/enums';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { LogSideEffectScoresInput, ReportSideEffectsInput, SideEffectAlertModel, SideEffectReportModel, SideEffectScoreEntryModel, SideEffectSummaryModel } from './models/side-effect.model';
import { MAX_NOTE_LENGTH, MAX_REPORTS_PER_DAY, OPEN_ALERTS_WHERE, SIDE_EFFECT_KEYS, URGENT_ADVICE, adviceFor, byUrgency } from './side-effects';
import {
  MAX_ENTRIES_PER_DAY, MAX_NOTE_LENGTH as MAX_SCORE_NOTE_LENGTH, PEAK_DAYS, REPORT_KEY, SCORE_KEYS, SCORE_LABEL, ScoreEntry, TRACKER_NOTE_PREFIX,
  HIGH_SCORE, alertSeverityFor, attentionReasons, isValidScore, summariseScores,
} from './side-effect-scores';

// One notification per patient with side effects nobody has acknowledged yet.
const sideEffectKey = (patientId: string) => `sidefx:${patientId}`;

@Injectable()
export class SideEffectsService {
  private readonly logger = new Logger(SideEffectsService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    @Optional() private notifier?: NotifierService,
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
    await this.alertDoctors(patientId, input.severity).catch((err) => this.logger.error(`Alerting doctors about side effects of patient ${patientId} failed: ${err?.message}`, err?.stack));
    return this.toModel(row, adviceFor(input.severity));
  }

  /**
   * The patient's weekly scores. A high one also raises an ordinary side-effect report, so it shows in the
   * doctors' list and on the bell and has to be acknowledged like any other.
   */
  async logScores(patientId: string, input: LogSideEffectScoresInput): Promise<SideEffectScoreEntryModel> {
    const scores = Object.fromEntries(SCORE_KEYS.map((k) => [k, input[k]])) as Record<(typeof SCORE_KEYS)[number], number>;
    for (const k of SCORE_KEYS) if (!isValidScore(scores[k])) throw new BadRequestException(`Please score ${SCORE_LABEL[k].toLowerCase()} from 1 to 10`);
    const note = input.note?.trim() || null;
    if (note && note.length > MAX_SCORE_NOTE_LENGTH) throw new BadRequestException(`Notes can be up to ${MAX_SCORE_NOTE_LENGTH} characters`);
    const clientRequestId = input.clientRequestId?.trim() || null;
    if (clientRequestId && clientRequestId.length > 100) throw new BadRequestException('Invalid request id');

    if (clientRequestId) {
      const saved = await this.prisma.sideEffectLog.findFirst({ where: { patientId, clientRequestId } });
      if (saved) return this.toEntry(saved, alertSeverityFor(saved) ? URGENT_ADVICE : null); // this submission is already saved
    }
    const recent = await this.prisma.sideEffectLog.count({ where: { patientId, recordedAt: { gte: new Date(Date.now() - 86_400_000) } } });
    if (recent >= MAX_ENTRIES_PER_DAY) throw new BadRequestException('You’ve already logged this today — please message your clinician if something has changed');

    const severity = alertSeverityFor(scores);
    const high = SCORE_KEYS.filter((k) => scores[k] >= HIGH_SCORE);
    const rx = severity
      ? await this.prisma.prescription.findFirst({ where: { patientId, status: PrescriptionStatus.ACTIVE }, orderBy: { issuedAt: 'desc' }, select: { medication: true, dosage: true } })
      : null;

    let row;
    try {
      row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.sideEffectLog.create({ data: { patientId, ...scores, note, clientRequestId } });
        if (severity) {
          const report = await tx.sideEffectReport.create({
            data: {
              patientId,
              effects: high.map((k) => REPORT_KEY[k]),
              severity,
              note: `${TRACKER_NOTE_PREFIX} ${high.map((k) => `${SCORE_LABEL[k].toLowerCase()} ${scores[k]}/10`).join(', ')}${note ? `. ${note}` : ''}`.slice(0, MAX_NOTE_LENGTH),
              medication: rx ? `${rx.medication} ${rx.dosage}`.trim() : null,
            },
          });
          await this.audit.log(
            { actorId: patientId, actorRole: UserRole.PATIENT, action: 'SIDE_EFFECT_REPORTED', resourceType: 'SideEffectReport', resourceId: report.id, patientId, metadata: { effects: report.effects, severity, via: 'weekly tracker' } },
            tx,
          );
        }
        return created;
      });
    } catch (e: any) {
      // The same submission arriving twice (double tap, retry): it's already saved, so succeed quietly.
      if (e?.code === 'P2002' && clientRequestId) {
        const saved = await this.prisma.sideEffectLog.findFirst({ where: { patientId, clientRequestId } });
        if (saved) return this.toEntry(saved, alertSeverityFor(saved) ? URGENT_ADVICE : null);
      }
      throw e;
    }
    if (severity) await this.alertDoctors(patientId, severity).catch((err) => this.logger.error(`Alerting doctors about side effects of patient ${patientId} failed: ${err?.message}`, err?.stack));
    return this.toEntry(row, severity ? URGENT_ADVICE : null);
  }

  /** The patient's own weekly entries, newest first. */
  async myScores(patientId: string): Promise<SideEffectScoreEntryModel[]> {
    const rows = await this.prisma.sideEffectLog.findMany({ where: { patientId }, orderBy: { recordedAt: 'desc' }, take: 12 });
    return rows.map((r) => this.toEntry(r));
  }

  /** What a doctor should read before approving the next supply or dose for this patient. */
  async summaryFor(patientId: string, now: Date = new Date()): Promise<SideEffectSummaryModel> {
    const since = new Date(now.getTime() - PEAK_DAYS * 86_400_000);
    const [logs, reports, roughDoses] = await Promise.all([
      this.prisma.sideEffectLog.findMany({ where: { patientId }, orderBy: { recordedAt: 'desc' }, take: 8 }),
      this.prisma.sideEffectReport.findMany({ where: { patientId, createdAt: { gte: since } }, orderBy: { createdAt: 'desc' }, take: 10 }),
      this.prisma.doseEvent.count({ where: { patientId, feelingAfter: { in: ['DIFFICULTIES', 'NOT_WELL'] }, takenAt: { gte: since } } }),
    ]);
    const entries = logs as unknown as ScoreEntry[];
    const summary = summariseScores(entries, now);
    // A report the tracker raised for a high score is the same event as that score: counting both would show one problem twice.
    // It still counts when the latest week is no longer high, because the doctor has not acknowledged it.
    const covered = summary.rows.some((r) => r.flagged);
    const unacknowledged = reports.filter((r) => !r.acknowledgedAt && !(covered && r.note?.startsWith(TRACKER_NOTE_PREFIX)));
    const reasons = attentionReasons(summary, { unacknowledgedReports: unacknowledged, roughDoses });
    return {
      lastLoggedAt: summary.lastLoggedAt,
      daysSinceLastLog: summary.daysSinceLastLog,
      stale: summary.stale,
      scores: summary.rows,
      entries: logs.map((r) => this.toEntry(r)),
      reports: reports.map((r) => this.toModel(r)),
      roughDoses,
      needsAttention: reasons.length > 0,
      reasons,
    };
  }

  private toEntry(r: { id: string; recordedAt: Date; note: string | null } & Record<(typeof SCORE_KEYS)[number], number>, advice: string | null = null): SideEffectScoreEntryModel {
    return {
      id: r.id,
      recordedAt: r.recordedAt,
      nausea: r.nausea,
      vomiting: r.vomiting,
      abdominalPain: r.abdominalPain,
      diarrhoea: r.diarrhoea,
      constipation: r.constipation,
      fatigue: r.fatigue,
      note: r.note ?? undefined,
      advice: advice ?? undefined,
    };
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
    // Once nothing from this patient is waiting, the notification about them is done.
    const open = await this.prisma.sideEffectReport.count({ where: { patientId: existing.patientId, acknowledgedAt: null } });
    if (open === 0) await this.notifier?.resolve(sideEffectKey(existing.patientId));
    return this.toModel(row);
  }

  /**
   * Severe effects go to every doctor, since they can't wait for one person to be in. Others go to the doctor who
   * approved the patient's treatment, or every doctor when there isn't one.
   */
  private async alertDoctors(patientId: string, severity: string) {
    if (!this.notifier) return;
    const severe = severity === 'SEVERE';
    const [patient, approved] = await Promise.all([
      this.prisma.patient.findUnique({ where: { id: patientId }, select: { firstName: true, lastName: true } }),
      severe ? null : this.prisma.consultation.findFirst({ where: { patientId, status: ConsultationStatus.APPROVED, clinicianId: { not: null } }, orderBy: { updatedAt: 'desc' }, select: { clinicianId: true } }),
    ]);
    if (!patient) return;
    await this.notifier.toStaff({ clinicianIds: approved?.clinicianId ? [approved.clinicianId] : undefined, roles: [ClinicianRole.ADMIN, ClinicianRole.DOCTOR] }, {
      kind: severe ? NotificationKind.SIDE_EFFECT_SEVERE : NotificationKind.SIDE_EFFECT_REPORTED,
      params: { patient: `${patient.firstName} ${patient.lastName}` },
      href: '/check-ins',
      groupKey: sideEffectKey(patientId),
      email: severe,
    });
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
