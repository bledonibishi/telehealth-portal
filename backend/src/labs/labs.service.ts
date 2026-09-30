import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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
  constructor(private prisma: PrismaService) {}

  record(enteredById: string, input: RecordLabResultInput) {
    const flagged = isOutOfRange(input.value, input.referenceRangeLow, input.referenceRangeHigh);
    return this.prisma.labResult.create({
      data: {
        patientId: input.patientId,
        kind: input.kind,
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
  }

  async review(reviewedById: string, input: ReviewLabResultInput) {
    const existing = await this.prisma.labResult.findUnique({ where: { id: input.labResultId } });
    if (!existing) throw new NotFoundException('Lab result not found');
    return this.prisma.labResult.update({
      where: { id: input.labResultId },
      data: { reviewedAt: new Date(), reviewedById, reviewNote: input.reviewNote },
      include: INCLUDE,
    });
  }

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
