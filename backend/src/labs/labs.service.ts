import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { LabResultKind, UserRole } from '../common/enums';
import { RecordLabResultInput } from './dto/record-lab-result.input';
import { ReviewLabResultInput } from './dto/review-lab-result.input';

const INCLUDE = { enteredBy: true, reviewedBy: true } as const;

/**
 * Analyte results (estradiol, testosterone, PSA, A1C, ...), kept kind-agnostic
 * like CheckIn so both the HRT and GLP-1 programmes share one review queue.
 * No lab-partner integration yet — staff enter values by hand.
 */
@Injectable()
export class LabsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async record(enteredById: string, input: RecordLabResultInput) {
    if (input.kind === LabResultKind.OTHER && !input.analyteName?.trim()) {
      throw new BadRequestException('analyteName is required when kind is OTHER');
    }
    if (input.referenceRangeLow != null && input.referenceRangeHigh != null && input.referenceRangeLow > input.referenceRangeHigh) {
      throw new BadRequestException('referenceRangeLow cannot be greater than referenceRangeHigh');
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
