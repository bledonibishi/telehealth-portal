import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { findGlp1Dose, orderedTreatmentText } from '../catalog/ordered-dose';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ConsultationKind, OnboardingStatus, PrescriptionStatus, ProductCategory } from '../common/enums';
import { PrescriptionItemInput } from './dto/prescription-item.input';
import { RuleItem, RuleViolation, checkPrescribingRules } from './prescribing-rules';
import { OrdersService } from './orders.service';
import { DosingService } from '../dosing/dosing.service';

export const DEFAULT_VALIDITY_DAYS = 180;
const MAX_VALIDITY_DAYS = 365;
const MAX_REFILLS = 11;

type Db = PrismaService | Prisma.TransactionClient;

export interface IssueInput {
  patientId: string;
  prescriberId: string;
  kind: ConsultationKind;
  answers: Array<{ questionId: string; answer: string; value?: string | null }>;
  items: PrescriptionItemInput[];
  consultationId?: string;
  supersedesId?: string;
  notes?: string;
  validityDays?: number;
  refillsAllowed?: number;
  overrideReason?: string;
}

type ResolvedItem = RuleItem & { input: PrescriptionItemInput; product: RuleItem['product'] & { brandName: string | null } };

@Injectable()
export class PrescribingService {
  constructor(
    private prisma: PrismaService,
    private orders: OrdersService,
    private dosing: DosingService,
    private config: ConfigService,
  ) {}

  // Role alone (checked by the resolver) isn't enough to prescribe: the account
  // must hold a verified licence and, unless explicitly disabled for local dev,
  // be protected by MFA.
  async assertCanPrescribe(clinicianId: string) {
    const clinician = await this.prisma.clinician.findUnique({ where: { id: clinicianId } });
    if (!clinician?.isVerified || !clinician.licenseNumber) {
      throw new ForbiddenException('Your medical licence must be verified by an admin before you can prescribe');
    }
    const mfaRequired = this.config.get<string>('PRESCRIBER_MFA_REQUIRED', 'true') !== 'false';
    if (mfaRequired && !clinician.mfaEnabled) {
      throw new ForbiddenException('Enable two-factor authentication before prescribing');
    }
  }

  async assertIdentityVerified(patientId: string) {
    const onboarding = await this.prisma.onboardingSubmission.findUnique({ where: { patientId } });
    if (onboarding?.status !== OnboardingStatus.APPROVED) {
      throw new ForbiddenException("The patient's identity and onboarding checks must be approved before prescribing");
    }
  }



  /** Dry run: what would stop (or need justifying for) this prescription. */
  async check(input: Pick<IssueInput, 'patientId' | 'kind' | 'answers' | 'items' | 'supersedesId'>, db: Db = this.prisma) {
    const items = await this.resolveItems(input.items, db);
    return { items, violations: await this.evaluate(input, items, db) };
  }

  async issue(input: IssueInput, db: Db) {
    const { items, violations } = await this.check(input, db);

    const blocking = violations.filter((v) => !v.overridable);
    if (blocking.length) throw new BadRequestException(blocking.map((v) => v.message).join(' '));

    const overrideReason = input.overrideReason?.trim() || null;
    const needsReason = violations.filter((v) => v.overridable);
    if (needsReason.length && !overrideReason) {
      throw new BadRequestException(
        `Record a clinical reason to proceed: ${needsReason.map((v) => v.message).join(' ')}`,
      );
    }

    const validityDays = input.validityDays ?? DEFAULT_VALIDITY_DAYS;
    if (!Number.isInteger(validityDays) || validityDays < 1 || validityDays > MAX_VALIDITY_DAYS) {
      throw new BadRequestException(`Validity must be between 1 and ${MAX_VALIDITY_DAYS} days`);
    }
    const refillsAllowed = input.refillsAllowed ?? 0;
    if (!Number.isInteger(refillsAllowed) || refillsAllowed < 0 || refillsAllowed > MAX_REFILLS) {
      throw new BadRequestException(`Refills must be between 0 and ${MAX_REFILLS}`);
    }
    for (const item of input.items) {
      if (!item.directions.trim()) throw new BadRequestException('Every medicine needs directions for the patient');
    }

    const issuedAt = new Date();
    const validUntil = new Date(issuedAt.getTime() + validityDays * 86_400_000);
    const notes = input.notes?.trim();

    if (input.supersedesId) {
      await db.prescription.update({
        where: { id: input.supersedesId },
        data: { status: PrescriptionStatus.SUPERSEDED },
      });
      // Anything not yet dispatched on the old prescription is replaced by the new one's first order.
      await this.orders.cancelPendingFor(input.supersedesId, 'Superseded by a new prescription', db);
      // Its remaining scheduled doses no longer apply — the new item(s) get their own calendar below.
      await this.dosing.cancelForPrescription(input.supersedesId, db);
    }

    const created = await db.prescription.create({
      data: {
        consultationId: input.consultationId,
        patientId: input.patientId,
        prescriberId: input.prescriberId,
        supersedesId: input.supersedesId,
        issuedAt,
        validUntil,
        refillsAllowed,
        overrideReason: needsReason.length ? overrideReason : null,
        medication: items.map((i) => productLabel(i.product)).join(' + '),
        dosage: items.map((i) => `${i.strength.label} × ${i.input.quantity}`).join(' + '),
        instructions: [...items.map((i) => i.input.directions.trim()), ...(notes ? [notes] : [])].join('\n'),
        items: {
          create: items.map((i) => ({
            productId: i.product.id,
            strengthId: i.input.strengthId,
            quantity: i.input.quantity,
            directions: i.input.directions.trim(),
          })),
        },
      },
      include: PRESCRIPTION_DOCUMENT_INCLUDE,
    });

    // The first supply goes to the pharmacy queue straight away.
    await this.orders.createInitial(created, db);

    // A calendar entry per scheduled dose, for whichever items have a fixed interval.
    for (const item of created.items) {
      await this.dosing.generateForItem(item, input.patientId, issuedAt, db);
    }

    return db.prescription.update({
      where: { id: created.id },
      data: { contentHash: hashPrescription(created) },
    });
  }

  private async resolveItems(inputs: PrescriptionItemInput[], db: Db): Promise<ResolvedItem[]> {
    const strengths = await db.productStrength.findMany({
      where: { id: { in: inputs.map((i) => i.strengthId) } },
      include: { product: true },
    });
    return inputs.map((input) => {
      const strength = strengths.find((s) => s.id === input.strengthId);
      if (!strength) throw new BadRequestException(`Unknown strength ${input.strengthId}`);
      if (strength.productId !== input.productId) {
        throw new BadRequestException(`${strength.label} is not a strength of the selected product`);
      }
      return { input, product: strength.product, strength, quantity: input.quantity };
    });
  }

  private async evaluate(
    input: Pick<IssueInput, 'patientId' | 'kind' | 'answers' | 'supersedesId'>,
    items: ResolvedItem[],
    db: Db,
  ): Promise<RuleViolation[]> {
    const [onboarding, current, patient] = await Promise.all([
      db.onboardingSubmission.findUnique({ where: { patientId: input.patientId } }),
      this.currentGlp1Step(input.patientId, db),
      db.patient.findUnique({ where: { id: input.patientId }, select: { lead: { select: { quizAnswers: true } } } }),
    ]);
    const ordered = await findGlp1Dose(db, orderedTreatmentText(patient?.lead?.quizAnswers));
    const proof = onboarding?.prescriptionProofReview as
      | { fileId?: string; assessment?: { safeMaxStep: number | null; safeMaxDoseLabel?: string | null } }
      | null
      | undefined;
    // A patient who said they have no proof isn't verified, whatever an earlier upload showed.
    const noProof = onboarding?.prescriptionProofUnavailable === true;
    const proofCurrent = !noProof && !!proof && proof.fileId === onboarding?.prescriptionProofFileId;
    return checkPrescribingRules({
      kind: input.kind,
      items,
      answers: input.answers,
      verifiedPriorGlp1Use: onboarding?.priorMedicationUse === true && onboarding.status === 'APPROVED' && !noProof,
      currentGlp1Step: current,
      priorDoseSafeMaxStep: proofCurrent ? proof!.assessment?.safeMaxStep ?? null : null,
      priorDoseSafeMaxLabel: proofCurrent ? proof!.assessment?.safeMaxDoseLabel ?? null : null,
      orderedGlp1: ordered && { productId: ordered.productId, productName: ordered.productName, label: ordered.label, step: ordered.step },
    });
  }

  private async currentGlp1Step(patientId: string, db: Db): Promise<number | null> {
    const item = await db.prescriptionItem.findFirst({
      where: {
        prescription: { patientId, status: PrescriptionStatus.ACTIVE },
        product: { category: ProductCategory.GLP1 },
      },
      orderBy: { prescription: { issuedAt: 'desc' } },
      include: { strength: true },
    });
    return item?.strength.titrationStep ?? null;
  }
}

export const PRESCRIPTION_DOCUMENT_INCLUDE = {
  patient: true,
  prescriber: true,
  items: { include: { product: true, strength: true } },
} satisfies Prisma.PrescriptionInclude;

type DocumentPrescription = Prisma.PrescriptionGetPayload<{ include: typeof PRESCRIPTION_DOCUMENT_INCLUDE }>;

export function productLabel(product: { name: string; brandName: string | null }) {
  return product.brandName ? `${product.name} (${product.brandName})` : product.name;
}

// Canonical content a pharmacy relies on. Any change to these fields after
// issue changes the hash printed on the document.
export function canonicalContent(rx: DocumentPrescription) {
  return {
    id: rx.id,
    issuedAt: rx.issuedAt.toISOString(),
    validUntil: rx.validUntil?.toISOString() ?? null,
    refillsAllowed: rx.refillsAllowed,
    patient: {
      id: rx.patient.id,
      name: `${rx.patient.firstName} ${rx.patient.lastName}`,
      dateOfBirth: rx.patient.dateOfBirth.toISOString().slice(0, 10),
    },
    prescriber: rx.prescriber && {
      id: rx.prescriber.id,
      name: `${rx.prescriber.firstName} ${rx.prescriber.lastName}`,
      licenseNumber: rx.prescriber.licenseNumber,
      licensingBody: rx.prescriber.licensingBody,
    },
    items: rx.items.map((i) => ({
      product: productLabel(i.product),
      strength: i.strength.label,
      quantity: i.quantity,
      directions: i.directions,
    })),
    instructions: rx.instructions,
  };
}

export function hashPrescription(rx: DocumentPrescription) {
  return createHash('sha256').update(JSON.stringify(canonicalContent(rx))).digest('hex');
}
