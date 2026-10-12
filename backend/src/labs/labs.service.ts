import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { UploadKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { LabReportSource, LabReportStatus, LabResultKind, UserRole } from '../common/enums';
import { UploadsService } from '../uploads/uploads.service';
import { LabReaderService, nameMatches } from './lab-reader.service';
import { RecordLabResultInput, RecordLabResultsInput } from './dto/record-lab-result.input';
import { RejectLabReportInput, SubmitLabReportInput } from './dto/lab-report.input';
import { ReviewLabResultInput } from './dto/review-lab-result.input';

const INCLUDE = { enteredBy: true, reviewedBy: true, report: true } as const;
const REPORT_INCLUDE = { file: true, _count: { select: { results: true } } } as const;
const MAX_ROWS_PER_SAVE = 60;

type ReportRow = { id: string; patientId: string; fileId: string; source: string; status: string; note: string | null; handledAt: Date | null; createdAt: Date; file: { filename: string; mimeType: string }; _count: { results: number } };
/** What the apps are shown for a report: the row, with where to fetch the file and how many results came from it. */
const reportView = (r: ReportRow) => ({ id: r.id, patientId: r.patientId, source: r.source, status: r.status, note: r.note ?? undefined, filename: r.file.filename, mimeType: r.file.mimeType, fileUrl: `/uploads/${r.fileId}/file`, createdAt: r.createdAt, handledAt: r.handledAt ?? undefined, resultCount: r._count.results });

/**
 * Analyte results (estradiol, testosterone, PSA, A1C, ...), kept kind-agnostic
 * like CheckIn so both the HRT and GLP-1 programmes share one review queue.
 * No lab-partner integration yet: results come from a doctor typing them in, optionally from an attached lab report
 * (which a patient can also send in), with an AI reader that proposes the rows for the doctor to check.
 */
@Injectable()
export class LabsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    @Optional() private uploads?: UploadsService,
    @Optional() private reader?: LabReaderService,
  ) {}

  async record(enteredById: string, input: RecordLabResultInput) {
    if (input.kind === LabResultKind.OTHER && !input.analyteName?.trim()) {
      throw new BadRequestException('analyteName is required when kind is OTHER');
    }
    if (input.referenceRangeLow != null && input.referenceRangeHigh != null && input.referenceRangeLow > input.referenceRangeHigh) {
      throw new BadRequestException('referenceRangeLow cannot be greater than referenceRangeHigh');
    }

    if (input.reportId) {
      const [saved] = await this.recordMany(enteredById, { patientId: input.patientId, reportId: input.reportId, results: [{ ...input }] }, input.note);
      return saved;
    }

    const flagged = isOutOfRange(input.value, input.referenceRangeLow, input.referenceRangeHigh);
    const created = await this.prisma.labResult.create({
      data: {
        patientId: input.patientId,
        kind: input.kind,
        analyteName: input.analyteName?.trim() || null,
        value: input.value,
        unit: input.unit,
        referenceRangeLow: input.referenceRangeLow,
        referenceRangeHigh: input.referenceRangeHigh,
        collectedAt: input.collectedAt,
        note: input.note,
        enteredById,
        flagged,
      },
      include: INCLUDE,
    });

    await this.audit.log({
      actorId: enteredById,
      actorRole: UserRole.CLINICIAN,
      action: 'LAB_RESULT_RECORDED',
      resourceType: 'LabResult',
      resourceId: created.id,
      patientId: input.patientId,
      metadata: { kind: input.kind, flagged },
    });

    return created;
  }

  /**
   * Saves several results at once, all or none, typically what was read off one lab report. When a report is named,
   * it must be this patient's and still open; it is then marked as entered, and each result points back at it.
   */
  async recordMany(enteredById: string, input: RecordLabResultsInput, note?: string) {
    if (!input.results.length) throw new BadRequestException('There are no results to save');
    if (input.results.length > MAX_ROWS_PER_SAVE) throw new BadRequestException(`Save at most ${MAX_ROWS_PER_SAVE} results at a time`);
    for (const r of input.results) {
      if (!Number.isFinite(r.value)) throw new BadRequestException('Every result needs a number');
      if (!r.unit?.trim()) throw new BadRequestException('Every result needs a unit');
      if (r.kind === LabResultKind.OTHER && !r.analyteName?.trim()) throw new BadRequestException('analyteName is required when kind is OTHER');
      if (r.referenceRangeLow != null && r.referenceRangeHigh != null && r.referenceRangeLow > r.referenceRangeHigh) {
        throw new BadRequestException('referenceRangeLow cannot be greater than referenceRangeHigh');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      if (input.reportId) {
        const report = await tx.labReport.findUnique({ where: { id: input.reportId } });
        if (!report || report.patientId !== input.patientId) throw new BadRequestException('That lab report belongs to a different patient');
        if (report.status === LabReportStatus.REJECTED) throw new BadRequestException('That lab report was rejected, so results can’t be saved from it');
        // Claimed before anything is written, so a stale dialog, a retry or a second doctor saving the same report
        // can't add its results a second time: whoever gets here first enters them, the rest are turned away.
        const { count } = await tx.labReport.updateMany({
          where: { id: input.reportId, status: LabReportStatus.PENDING },
          data: { status: LabReportStatus.ENTERED, handledById: enteredById, handledAt: new Date() },
        });
        if (count === 0) throw new ConflictException('The results from this report have already been entered');
      }
      const saved = [];
      for (const r of input.results) {
        const created = await tx.labResult.create({
          data: {
            patientId: input.patientId,
            kind: r.kind,
            analyteName: r.analyteName?.trim() || null,
            value: r.value,
            unit: r.unit.trim(),
            referenceRangeLow: r.referenceRangeLow,
            referenceRangeHigh: r.referenceRangeHigh,
            collectedAt: r.collectedAt,
            note,
            reportId: input.reportId ?? null,
            enteredById,
            flagged: isOutOfRange(r.value, r.referenceRangeLow, r.referenceRangeHigh),
          },
          include: INCLUDE,
        });
        await this.audit.log(
          { actorId: enteredById, actorRole: UserRole.CLINICIAN, action: 'LAB_RESULT_RECORDED', resourceType: 'LabResult', resourceId: created.id, patientId: input.patientId, metadata: { kind: r.kind, flagged: created.flagged, reportId: input.reportId ?? null } },
          tx,
        );
        saved.push(created);
      }
      return saved;
    });
  }

  /** A doctor attaches a lab report to a patient's record (it waits there until its results are typed in). */
  async attachReport(actorId: string, patientId: string, file: Express.Multer.File, note?: string) {
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId }, select: { id: true } });
    if (!patient) throw new NotFoundException('Patient not found');
    const saved = await this.uploads!.save(patientId, UploadKind.LAB_REPORT, file);
    const report = await this.prisma.labReport.create({
      data: { patientId, fileId: saved.id, source: LabReportSource.STAFF, uploadedById: actorId, note: note?.trim() || null },
      include: REPORT_INCLUDE,
    });
    await this.audit.log({ actorId, actorRole: UserRole.CLINICIAN, action: 'LAB_REPORT_UPLOADED', resourceType: 'LabReport', resourceId: report.id, patientId, metadata: { source: 'STAFF' } });
    return reportView(report);
  }

  /** A patient sends in their own lab report, for their care team to read and enter. */
  async submitOwnReport(patientId: string, input: SubmitLabReportInput) {
    const file = await this.uploads!.findOwned(patientId, input.fileId, [UploadKind.LAB_REPORT]);
    if (await this.prisma.labReport.findUnique({ where: { fileId: file.id } })) throw new ConflictException('That file was already sent');
    const report = await this.prisma.labReport.create({
      data: { patientId, fileId: file.id, source: LabReportSource.PATIENT, note: input.note?.trim().slice(0, 1000) || null },
      include: REPORT_INCLUDE,
    });
    await this.audit.log({ actorId: patientId, actorRole: UserRole.PATIENT, action: 'LAB_REPORT_UPLOADED', resourceType: 'LabReport', resourceId: report.id, patientId, metadata: { source: 'PATIENT' } });
    return reportView(report);
  }

  /** Every report on a patient's record, newest first, those still waiting for their results at the top. */
  async listReports(patientId: string) {
    const rows = await this.prisma.labReport.findMany({ where: { patientId }, include: REPORT_INCLUDE, orderBy: { createdAt: 'desc' } });
    const waiting = (r: { status: string }) => (r.status === LabReportStatus.PENDING ? 0 : 1);
    return rows.sort((a, b) => waiting(a) - waiting(b)).map(reportView);
  }

  /** What the patient sees of their own uploads: that it arrived, and whether it was used. */
  async listOwnReports(patientId: string) {
    const rows = await this.prisma.labReport.findMany({ where: { patientId }, include: REPORT_INCLUDE, orderBy: { createdAt: 'desc' } });
    // A note a doctor wrote when attaching a report is for the care team. The patient sees their own note, and the reason a report was rejected.
    return rows.map((r) => reportView({ ...r, note: r.source === LabReportSource.PATIENT || r.status === LabReportStatus.REJECTED ? r.note : null }));
  }

  /** The report can't be used (unreadable, not a lab report): closed, with a reason the patient can see. */
  async rejectReport(actorId: string, input: RejectLabReportInput) {
    const { count } = await this.prisma.labReport.updateMany({
      where: { id: input.reportId, status: LabReportStatus.PENDING },
      data: { status: LabReportStatus.REJECTED, handledById: actorId, handledAt: new Date(), ...(input.reason?.trim() ? { note: input.reason.trim().slice(0, 500) } : {}) },
    });
    const report = await this.prisma.labReport.findUnique({ where: { id: input.reportId }, include: REPORT_INCLUDE });
    if (!report) throw new NotFoundException('Lab report not found');
    if (count === 0) throw new ConflictException('This report has already been handled');
    await this.audit.log({ actorId, actorRole: UserRole.CLINICIAN, action: 'LAB_REPORT_REJECTED', resourceType: 'LabReport', resourceId: report.id, patientId: report.patientId });
    return reportView(report);
  }

  /**
   * Has the AI reader list the results on a report, for the doctor to check, correct and save. Nothing is saved here.
   * Rows already on the record are marked, and the name on the report is compared with the patient's, because a report
   * for someone else is the mistake that matters most.
   */
  async readReport(actorId: string, reportId: string) {
    const report = await this.prisma.labReport.findUnique({ where: { id: reportId }, include: { file: true, patient: { select: { firstName: true, lastName: true } } } });
    if (!report) throw new NotFoundException('Lab report not found');
    if (!this.reader || !this.uploads) throw new BadRequestException('Reading reports isn’t available');

    const outcome = await this.reader.read(await this.uploads.readContents(report.file), report.file.mimeType, report.patientId);
    await this.audit.log({ actorId, actorRole: UserRole.CLINICIAN, action: 'LAB_REPORT_AI_READ', resourceType: 'LabReport', resourceId: report.id, patientId: report.patientId, metadata: { status: outcome.status } });
    if (outcome.status !== 'COMPLETED') return { status: outcome.status, reason: outcome.reason, notes: '', warnings: [] as string[], results: [] };

    const r = outcome.reading;
    const matches = nameMatches(r.patientName, report.patient.firstName, report.patient.lastName);
    const existing = await this.prisma.labResult.findMany({ where: { patientId: report.patientId }, select: { kind: true, analyteName: true, value: true, collectedAt: true } });
    const day = (d: Date) => d.toISOString().slice(0, 10);
    const seen = new Set(existing.map((e) => `${e.kind}|${(e.analyteName ?? '').toLowerCase()}|${e.value}|${day(e.collectedAt)}`));
    const results = r.results.map((row) => ({
      kind: row.kind as LabResultKind,
      analyteName: row.analyteName ?? undefined,
      value: row.value,
      unit: row.unit,
      referenceLow: row.referenceLow ?? undefined,
      referenceHigh: row.referenceHigh ?? undefined,
      collectedOn: row.collectedOn ?? undefined,
      flaggedByLab: row.flaggedByLab ?? undefined,
      alreadyRecorded: !!row.collectedOn && seen.has(`${row.kind}|${(row.analyteName ?? '').toLowerCase()}|${row.value}|${row.collectedOn}`),
    }));

    const warnings: string[] = [];
    if (!r.readable) warnings.push('This doesn’t read as a lab report. Check the file.');
    if (matches === false) warnings.push(`The name on the report (“${r.patientName}”) is not this patient’s. Check it is the right report before saving anything.`);
    if (matches === null) warnings.push('The report shows no name, so there is nothing to confirm it belongs to this patient.');
    if (r.readable && !results.length) warnings.push('No results could be read from it. Enter them by hand.');
    if (results.some((x) => !x.collectedOn)) warnings.push('Some results have no collection date: fill it in before saving.');
    if (results.some((x) => x.alreadyRecorded)) warnings.push('Some results are already on the patient’s record (marked). Leave them out to avoid duplicates.');
    warnings.push('The reader can make mistakes. Compare every value with the report.');

    return { status: 'COMPLETED', patientNameOnReport: r.patientName ?? undefined, nameMatches: matches ?? undefined, labName: r.labName ?? undefined, reportDate: r.reportDate ?? undefined, notes: r.notes, warnings, results };
  }

  async review(reviewedById: string, input: ReviewLabResultInput) {
    // Atomic conditional write: only succeeds if nobody has reviewed it yet,
    // so two clinicians reviewing concurrently can't silently overwrite
    // each other's note/outcome.
    const { count } = await this.prisma.labResult.updateMany({
      where: { id: input.labResultId, reviewedAt: null },
      data: { reviewedAt: new Date(), reviewedById, reviewNote: input.reviewNote },
    });
    if (count === 0) {
      const existing = await this.prisma.labResult.findUnique({ where: { id: input.labResultId } });
      if (!existing) throw new NotFoundException('Lab result not found');
      throw new ConflictException('This lab result has already been reviewed');
    }

    const reviewed = await this.prisma.labResult.findUniqueOrThrow({ where: { id: input.labResultId }, include: INCLUDE });
    await this.audit.log({
      actorId: reviewedById,
      actorRole: UserRole.CLINICIAN,
      action: 'LAB_RESULT_REVIEWED',
      resourceType: 'LabResult',
      resourceId: input.labResultId,
      patientId: reviewed.patientId,
    });

    return reviewed;
  }

  /** The patient's own view — never attaches who entered or reviewed it. */
  listForPatientSelf(patientId: string) {
    return this.prisma.labResult.findMany({
      where: { patientId },
      orderBy: { collectedAt: 'desc' },
    });
  }

  /** Staff view — includes who entered and reviewed each result. */
  listForPatient(patientId: string) {
    return this.prisma.labResult.findMany({
      where: { patientId },
      include: INCLUDE,
      orderBy: { collectedAt: 'desc' },
    });
  }

  /** Flagged results nobody has reviewed yet — oldest first, like the check-in queue. */
  flaggedQueue() {
    return this.prisma.labResult.findMany({
      where: { flagged: true, reviewedAt: null },
      include: { ...INCLUDE, patient: true },
      orderBy: { collectedAt: 'asc' },
    });
  }
}

function isOutOfRange(value: number, low?: number, high?: number): boolean {
  if (low != null && value < low) return true;
  if (high != null && value > high) return true;
  return false;
}
