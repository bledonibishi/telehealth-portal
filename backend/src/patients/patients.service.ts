import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { UpdateBasicInfoInput } from './dto/update-basic-info.input';
import { UpdatePatientInput } from './dto/update-patient.input';
import { CreatePatientInput } from './dto/create-patient.input';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PostHogService } from '../posthog/posthog.service';
import { ConsentsService } from '../consents/consents.service';
import { PrescribingService } from '../prescriptions/prescribing.service';
import { WeightJourneyService } from '../weight-journey/weight-journey.service';
import { ConsultationsService } from '../consultations/consultations.service';
import { PatientTreatmentStatus } from './models/patient-list-item.model';
import { findQuestionnaire, versionTag } from '../questionnaires/definitions';
import { evaluateAnswers } from '../questionnaires/evaluate';
import {
  ConsultationKind,
  ConsultationStatus,
  ConsentType,
  OnboardingStatus,
  PersonaStatus,
  PhotoReviewStatus,
  PrescriptionStatus,
  UserRole,
} from '../common/enums';

const MIN_AGE = 18;

// Default starter item(s) for a fast-tracked plan, keyed by the seeded
// product slug(s) in backend/prisma/catalog.ts. HRT bundles an estrogen and
// a progestogen together so the prescribing rules don't flag
// ESTROGEN_WITHOUT_PROGESTOGEN and need an override reason.
const STARTER_ITEMS: Record<ConsultationKind, Array<{ slug: string; label: string }>> = {
  [ConsultationKind.GLP1]: [{ slug: 'semaglutide-wegovy', label: '0.25 mg' }],
  [ConsultationKind.HRT]: [
    { slug: 'estradiol-gel-oestrogel', label: '0.75 mg per pump' },
    { slug: 'progesterone-utrogestan', label: '100 mg' },
  ],
  [ConsultationKind.TRT]: [{ slug: 'testosterone-gel-tostran', label: '20 mg (2 pumps)' }],
};

function ageInYears(dob: Date, now = new Date()): number {
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

// Excludes visually-ambiguous characters (0/O, 1/l/I) since an admin has to
// read and type this one.
const TEMP_PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
function generateTempPassword(length = 12): string {
  let password = '';
  for (let i = 0; i < length; i++) password += TEMP_PASSWORD_CHARS[crypto.randomInt(TEMP_PASSWORD_CHARS.length)];
  return password;
}

@Injectable()
export class PatientsService {
  private readonly logger = new Logger(PatientsService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private posthog: PostHogService,
    private consents: ConsentsService,
    private prescribing: PrescribingService,
    private weightJourney: WeightJourneyService,
    // Looked up when needed: ConsultationsModule is not a dependency of this module.
    private moduleRef: ModuleRef,
  ) {}

  // One query per relation (batched across all patients, not per row) so the
  // list can filter/sort by programme, review status and treatment status
  // without pulling every patient's full consultation/message history.
  async findAll() {
    const rows = await this.prisma.patient.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        lead: { select: { productKind: true } },
        consultations: {
          orderBy: { submittedAt: 'desc' },
          select: {
            status: true,
            kind: true,
            // Only the newest message of each thread, to tell whether a reply is owed.
            messages: { orderBy: { sentAt: 'desc' }, take: 1, select: { senderRole: true, sentAt: true } },
          },
        },
        prescriptions: {
          where: { status: PrescriptionStatus.ACTIVE },
          orderBy: { issuedAt: 'desc' },
          take: 1,
          select: {
            id: true,
            medication: true,
            dosage: true,
            items: { select: { product: { select: { name: true, brandName: true } }, strength: { select: { label: true } } } },
          },
        },
        checkIns: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true, dueAt: true } },
        // Messages from before the patient had a consultation.
        messages: { where: { consultationId: null }, orderBy: { sentAt: 'desc' }, take: 1, select: { senderRole: true, sentAt: true } },
      },
    });

    // Same numbers the patient sees on their own dashboard.
    const glp1Ids = rows
      .filter((r) => (r.lead?.productKind ?? r.consultations[0]?.kind) === ConsultationKind.GLP1)
      .map((r) => r.id);
    const journeys = await this.weightJourney.summariesFor(glp1Ids);

    return rows.map(({ lead, consultations, prescriptions, checkIns, messages: preConsultation = [], ...patient }) => {
      const journey = journeys.get(patient.id);
      const prescription = prescriptions[0];
      const newest = [...consultations.flatMap((c) => c.messages), ...preConsultation]
        .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())[0];
      const lastFromPatient = [...consultations.flatMap((c) => c.messages), ...preConsultation]
        .filter((m) => m.senderRole === UserRole.PATIENT)
        .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())[0];

      return {
        ...patient,
        productKind: lead?.productKind ?? null,
        latestConsultationStatus: consultations[0]?.status ?? null,
        hasActivePrescription: prescriptions.length > 0,
        lastCheckInStatus: checkIns[0]?.status ?? null,
        lastCheckInDueAt: checkIns[0]?.dueAt ?? null,
        treatmentStatus: !patient.activatedAt
          ? PatientTreatmentStatus.PENDING
          : prescription
            ? PatientTreatmentStatus.ACTIVE
            : consultations.length > 0 && consultations.every((c) => c.status === ConsultationStatus.DECLINED)
              ? PatientTreatmentStatus.DECLINED
              : PatientTreatmentStatus.INACTIVE,
        medications: prescription
          ? prescription.items.length > 0
            ? prescription.items.map((i) => ({ label: i.product.brandName ?? i.product.name, dose: i.strength.label }))
            : [{ label: prescription.medication, dose: prescription.dosage }]
          : [],
        startingWeightKg: journey?.startingWeightKg ?? null,
        currentWeightKg: journey?.currentWeightKg ?? null,
        targetWeightKg: journey?.targetWeightKg ?? null,
        weightLostKg: journey?.weightLostKg ?? null,
        progressPercentage: journey?.progressPercentage ?? null,
        lastWeighedAt: journey?.latestMeasurementAt ?? null,
        awaitingReply: newest?.senderRole === UserRole.PATIENT,
        lastMessageAt: lastFromPatient?.sentAt ?? null,
      };
    });
  }

  findById(id: string) {
    return this.prisma.patient.findUnique({
      where: { id },
      include: {
        consultations: {
          orderBy: { submittedAt: 'desc' },
          include: {
            redFlags: true,
            prescription: true,
            messages: { orderBy: { sentAt: 'asc' } },
            clinician: true,
          },
        },
        checkIns: { orderBy: { createdAt: 'desc' } },
      },
    });
  }

  // Covers what the marketing checkout doesn't collect (or sets a placeholder
  // for): a confirmed date of birth, and where the pharmacy delivers to.
  // Name/email already come from the lead created at checkout.
  async updateMyBasicInfo(id: string, input: UpdateBasicInfoInput) {
    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    if (!firstName || !lastName) throw new BadRequestException('Please enter your first and last name');

    const dateOfBirth = new Date(input.dateOfBirth);
    if (Number.isNaN(dateOfBirth.getTime()) || dateOfBirth > new Date()) {
      throw new BadRequestException('Please enter a valid date of birth');
    }
    if (ageInYears(dateOfBirth) < MIN_AGE) {
      throw new BadRequestException(`You must be at least ${MIN_AGE} to use this service`);
    }

    const address = Object.fromEntries(
      (['phone', 'addressLine1', 'addressLine2', 'city', 'postcode', 'country'] as const).map((k) => [
        k,
        input[k]?.trim() || null,
      ]),
    ) as Record<'phone' | 'addressLine1' | 'addressLine2' | 'city' | 'postcode' | 'country', string | null>;
    for (const key of ['phone', 'addressLine1', 'city', 'postcode', 'country'] as const) {
      if (!address[key]) throw new BadRequestException('Please fill in your phone number and full delivery address');
    }

    return this.prisma.patient.update({ where: { id }, data: { firstName, lastName, dateOfBirth, ...address } });
  }

  update(id: string, data: Omit<UpdatePatientInput, 'id'>) {
    return this.prisma.patient.update({ where: { id }, data });
  }

  async productKindOf(id: string) {
    const patient = await this.prisma.patient.findUnique({ where: { id }, include: { lead: true } });
    return patient?.lead?.productKind ?? null;
  }

  findByEmail(email: string) {
    return this.prisma.patient.findUnique({ where: { email } });
  }

  // Admin fast-track: creates a patient with personal info, a programme
  // (Lead.productKind — the list/detail views read the programme from the
  // lead, not the consultation), and optionally a fully-approved onboarding
  // plus an issued starter prescription. Bypasses the normal
  // licence/MFA/identity-verification gates deliberately — this is a
  // shortcut for setting up test/demo patients, not a clinical decision.
  async createByStaff(actorId: string, input: CreatePatientInput) {
    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    if (!firstName || !lastName) throw new BadRequestException('Please enter a first and last name');

    const email = input.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Please enter a valid email address');

    if (input.password !== undefined && input.password.trim().length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    const dateOfBirth = new Date(input.dateOfBirth);
    if (Number.isNaN(dateOfBirth.getTime()) || dateOfBirth > new Date()) {
      throw new BadRequestException('Please enter a valid date of birth');
    }
    if (ageInYears(dateOfBirth) < MIN_AGE) {
      throw new BadRequestException(`The patient must be at least ${MIN_AGE}`);
    }

    const [existingPatient, existingLead] = await Promise.all([
      this.prisma.patient.findUnique({ where: { email } }),
      this.prisma.lead.findUnique({ where: { email } }),
    ]);
    if (existingPatient || existingLead) throw new ConflictException('A patient with this email already exists');

    // Onboarding "completed" means a real, approved consultation — so its
    // intake questionnaire answers are validated the same way a patient's own
    // submission would be (see ConsultationsService.submitIntakeQuiz).
    let quizAnswers: ReturnType<typeof evaluateAnswers>['answers'] = [];
    let quizFlags: ReturnType<typeof evaluateAnswers>['flags'] = [];
    let questionnaireVersion: string | undefined;
    if (input.onboardingCompleted) {
      const intake = findQuestionnaire(input.plan, 'INTAKE');
      const evaluation = evaluateAnswers(intake, input.quizAnswers ?? [], true);
      if (evaluation.errors.length) throw new BadRequestException(evaluation.errors.join(' '));
      quizAnswers = evaluation.answers;
      quizFlags = evaluation.flags;
      questionnaireVersion = versionTag(intake);
    }
    // Onboarding left for the patient: any medical answers entered here still become their consultation, as
    // answers given on the website do, so onboarding doesn't ask for them again. Checked now, before anything
    // is created. With none entered, the patient answers them in the portal as before.
    const intakeForPatient = !input.onboardingCompleted && (input.quizAnswers?.length ?? 0) > 0;
    if (intakeForPatient) {
      const evaluation = evaluateAnswers(findQuestionnaire(input.plan, 'INTAKE'), input.quizAnswers!, true);
      if (evaluation.errors.length) throw new BadRequestException(evaluation.errors.join(' '));
    }

    // An admin can set the password directly; otherwise generate a readable
    // one (not a 32-char hex blob) since they need to actually type it to log
    // in as this test patient. Either way it's returned once, below, and
    // never stored anywhere but its bcrypt hash.
    const password = input.password?.trim() || generateTempPassword();
    const passwordHash = await bcrypt.hash(password, 10);
    const now = new Date();

    const patient = await this.prisma.$transaction(async (tx) => {
      // Staff-created patients count as having paid: record the treatment the way checkout does, so the
      // prescribing form shows "Paid for" and pre-selects it.
      const treatment = input.treatment?.trim().slice(0, 120) || (await this.starterTreatmentText(input.plan, tx));
      const lead = await tx.lead.create({
        data: {
          email, firstName, lastName, productKind: input.plan, convertedAt: now,
          quizAnswers: treatment ? [{ questionId: 'preferred_treatment', question: 'Preferred treatment (chosen at checkout)', answer: treatment }] : [],
        },
      });

      const created = await tx.patient.create({
        data: {
          email,
          passwordHash,
          firstName,
          lastName,
          dateOfBirth,
          leadId: lead.id,
          activatedAt: now,
          phone: input.phone?.trim() || null,
          addressLine1: input.addressLine1?.trim() || null,
          addressLine2: input.addressLine2?.trim() || null,
          city: input.city?.trim() || null,
          postcode: input.postcode?.trim() || null,
          country: input.country?.trim() || null,
        },
      });

      if (input.onboardingCompleted) {
        await tx.onboardingSubmission.create({
          data: {
            patientId: created.id,
            status: OnboardingStatus.APPROVED,
            personaStatus: PersonaStatus.VERIFIED,
            photoReviewStatus: PhotoReviewStatus.APPROVED,
            priorMedicationUse: input.priorMedicationUse ?? false,
            submittedAt: now,
            reviewedAt: now,
            reviewedByClinicianId: actorId,
          },
        });

        await this.consents.record(
          created.id,
          ConsentType.TELEHEALTH,
          this.consents.current(ConsentType.TELEHEALTH).version,
          {},
          tx,
        );

        const consultation = await tx.consultation.create({
          data: {
            patientId: created.id,
            clinicianId: actorId,
            kind: input.plan,
            status: ConsultationStatus.APPROVED,
            quizAnswers: quizAnswers as any,
            questionnaireVersion,
            redFlags: { create: quizFlags as any },
          },
        });

        const items = await this.resolveStarterItems(input.plan, tx);
        await this.prescribing.issue(
          {
            consultationId: consultation.id,
            patientId: created.id,
            prescriberId: actorId,
            kind: input.plan,
            answers: quizAnswers,
            items,
            notes: 'Created via admin fast-track',
          },
          tx,
        );
      }

      return created;
    });

    let intakeSubmitted = false;
    if (intakeForPatient) {
      // The patient already exists: a failure here must not look like the creation failed (a retry would hit the
      // duplicate email). They answer the questionnaire in the portal instead.
      try {
        await this.moduleRef.get(ConsultationsService, { strict: false }).submitIntakeQuiz(
          patient.id,
          { kind: input.plan, answers: input.quizAnswers!, telehealthConsentVersion: this.consents.current(ConsentType.TELEHEALTH).version },
          {},
        );
        intakeSubmitted = true;
      } catch (err: any) {
        this.logger.error(`Creating the consultation for staff-created patient ${patient.id} failed: ${err?.message}`);
      }
    }

    await this.audit.log({
      actorId,
      actorRole: UserRole.CLINICIAN,
      action: 'PATIENT_CREATED_BY_STAFF',
      resourceType: 'Patient',
      resourceId: patient.id,
      metadata: { plan: input.plan, onboardingCompleted: input.onboardingCompleted, intakeSubmitted },
    });
    this.posthog.capture(actorId, 'patient_created_by_staff', {
      plan: input.plan,
      onboarding_completed: input.onboardingCompleted,
    });

    const record = await this.findById(patient.id);
    return { ...record, temporaryPassword: password };
  }

  /** The plan's starter medicine as checkout text, e.g. "Wegovy 0.25 mg" (GLP-1 only; the other programmes aren't dose-matched). */
  private async starterTreatmentText(kind: ConsultationKind, tx: Prisma.TransactionClient): Promise<string | null> {
    if (kind !== ConsultationKind.GLP1) return null;
    const [spec] = STARTER_ITEMS[kind];
    const product = await tx.product.findUnique({ where: { slug: spec.slug } });
    const name = product?.brandName ?? product?.name;
    return name ? `${name} ${spec.label}` : null;
  }

  private async resolveStarterItems(kind: ConsultationKind, tx: Prisma.TransactionClient) {
    const specs = STARTER_ITEMS[kind];
    const items: Array<{ productId: string; strengthId: string; quantity: number; directions: string }> = [];
    for (const spec of specs) {
      const product = await tx.product.findUnique({ where: { slug: spec.slug }, include: { strengths: true } });
      const strength = product?.strengths.find((s) => s.label === spec.label);
      if (!product || !strength) throw new BadRequestException(`Starter product ${spec.slug} (${spec.label}) is not in the catalog`);
      items.push({
        productId: product.id,
        strengthId: strength.id,
        quantity: strength.defaultQuantity,
        directions: product.defaultDirections ?? 'Follow the instructions provided with your medicine.',
      });
    }
    return items;
  }
}
