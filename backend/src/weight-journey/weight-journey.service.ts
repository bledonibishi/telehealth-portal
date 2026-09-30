import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CheckInsService } from '../check-ins/check-ins.service';
import { CheckInFeeling, CheckInStatus, ConsultationKind, UserRole } from '../common/enums';
import { CorrectCheckInWeightInput, CorrectWeightGoalInput } from './dto/weight-journey.input';
import { MonthlyCheckInState, WeightEntryModel, WeightJourneyModel } from './models/weight-journey.model';
import { computeProgress, motivationMessage, round1 } from './weight-math';
import { latestOf } from './weight-timeline';

// Same bounds as the `weight_kg` question in the questionnaires, so a weight
// that's valid there is valid here.
export const MIN_WEIGHT_KG = 30;
export const MAX_WEIGHT_KG = 300;

// How long after finishing a check-in the dashboard keeps saying it's done,
// before switching to the countdown to the next one.
const COMPLETED_BANNER_DAYS = 14;

const JOURNEY_INCLUDE = {
  lead: { select: { productKind: true } },
  weightGoal: true,
  consultations: { orderBy: { submittedAt: 'asc' }, select: { kind: true, quizAnswers: true, submittedAt: true } },
  checkIns: { orderBy: { createdAt: 'asc' } },
  // Only the newest is needed for "current weight"; the full series is read through the timeline query.
  weightEntries: { where: { voidedAt: null }, orderBy: { measuredAt: 'desc' }, take: 1 },
} satisfies Prisma.PatientInclude;

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export function assertValidWeight(kg: number, label: string) {
  if (!Number.isFinite(kg) || kg < MIN_WEIGHT_KG || kg > MAX_WEIGHT_KG) {
    throw new BadRequestException(`${label} must be between ${MIN_WEIGHT_KG} and ${MAX_WEIGHT_KG} kg`);
  }
}

@Injectable()
export class WeightJourneyService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private checkIns: CheckInsService,
  ) {}

  /** The patient’s journey, or null when their programme doesn’t have one. */
  async forPatient(patientId: string): Promise<WeightJourneyModel | null> {
    const patient = await this.load(patientId);
    if (!patient) throw new NotFoundException('Patient not found');
    if (this.kindOf(patient) !== ConsultationKind.GLP1) return null;
    return this.build(patient);
  }

  async setTarget(patientId: string, targetWeightKg: number) {
    const patient = await this.requireGlp1(patientId);
    const target = round1(targetWeightKg);
    assertValidWeight(target, 'Target weight');

    const starting = num(patient.weightGoal?.startingWeightKg) ?? this.intakeWeight(patient);
    if (starting === null) {
      throw new BadRequestException('Please complete your medical questionnaire first, so we know your starting weight');
    }
    if (target >= starting) throw new BadRequestException(`Target weight must be below your starting weight of ${starting} kg`);

    await this.prisma.weightGoal.upsert({
      where: { patientId },
      create: { patientId, startingWeightKg: starting, targetWeightKg: target },
      update: { targetWeightKg: target },
    });
    return this.forPatient(patientId) as Promise<WeightJourneyModel>;
  }

  async correctGoal(staffId: string, input: CorrectWeightGoalInput) {
    const patient = await this.requireGlp1(input.patientId);
    const before = {
      startingWeightKg: num(patient.weightGoal?.startingWeightKg) ?? this.intakeWeight(patient),
      targetWeightKg: num(patient.weightGoal?.targetWeightKg),
    };
    const starting = input.startingWeightKg !== undefined && input.startingWeightKg !== null ? round1(input.startingWeightKg) : before.startingWeightKg;
    const target = input.targetWeightKg !== undefined && input.targetWeightKg !== null ? round1(input.targetWeightKg) : before.targetWeightKg;

    if (starting === null || target === null) throw new BadRequestException('Both a starting and a target weight are needed');
    assertValidWeight(starting, 'Starting weight');
    assertValidWeight(target, 'Target weight');
    if (target >= starting) throw new BadRequestException('Target weight must be below the starting weight');

    // The change and its audit row commit together, or not at all.
    await this.prisma.$transaction(async (tx) => {
      await tx.weightGoal.upsert({
        where: { patientId: input.patientId },
        create: { patientId: input.patientId, startingWeightKg: starting, targetWeightKg: target },
        update: { startingWeightKg: starting, targetWeightKg: target },
      });
      await this.audit.log(
        {
          actorId: staffId,
          actorRole: UserRole.CLINICIAN,
          action: 'WEIGHT_GOAL_CORRECTED',
          resourceType: 'WeightJourney',
          resourceId: input.patientId,
          metadata: { before, after: { startingWeightKg: starting, targetWeightKg: target }, reason: input.reason ?? null },
        },
        tx,
      );
    });
    return this.forPatient(input.patientId) as Promise<WeightJourneyModel>;
  }

  async correctCheckInWeight(staffId: string, input: CorrectCheckInWeightInput) {
    const checkIn = await this.prisma.checkIn.findUnique({ where: { id: input.checkInId } });
    if (!checkIn) throw new NotFoundException('Check-in not found');
    if (checkIn.status !== CheckInStatus.COMPLETED) throw new BadRequestException('Only a completed check-in has a weight to correct');

    // Weight Journey corrections apply to weight-management patients only (same guard as every other journey action).
    await this.requireGlp1(checkIn.patientId);

    const weight = round1(input.weightKg);
    assertValidWeight(weight, 'Weight');

    // The change and its audit row commit together, or not at all.
    await this.prisma.$transaction(async (tx) => {
      await tx.checkIn.update({ where: { id: checkIn.id }, data: { weightKg: weight } });
      await this.audit.log(
        {
          actorId: staffId,
          actorRole: UserRole.CLINICIAN,
          action: 'CHECK_IN_WEIGHT_CORRECTED',
          resourceType: 'CheckIn',
          resourceId: checkIn.id,
          metadata: { before: num(checkIn.weightKg), after: weight, reason: input.reason ?? null },
        },
        tx,
      );
    });
    return this.forPatient(checkIn.patientId) as Promise<WeightJourneyModel>;
  }

  // ── internals ─────────────────────────────────────────────────────────────

  /**
   * Journeys for many patients at once (the patients list), built by the same code as the
   * patient's own dashboard so the two always agree. Patients without a journey are skipped.
   */
  async summariesFor(patientIds: string[]): Promise<Map<string, WeightJourneyModel>> {
    if (patientIds.length === 0) return new Map();
    const patients = await this.prisma.patient.findMany({ where: { id: { in: patientIds } }, include: JOURNEY_INCLUDE });
    return new Map(patients.filter((p) => this.kindOf(p) === ConsultationKind.GLP1).map((p) => [p.id, this.build(p)]));
  }

  private load(patientId: string) {
    return this.prisma.patient.findUnique({ where: { id: patientId }, include: JOURNEY_INCLUDE });
  }

  /** The loaded patient, or an error if they aren't on the weight-management programme. */
  async requireGlp1(patientId: string) {
    const patient = await this.load(patientId);
    if (!patient) throw new NotFoundException('Patient not found');
    if (this.kindOf(patient) !== ConsultationKind.GLP1) throw new BadRequestException('Weight Journey is only available on weight-management programmes');
    return patient;
  }

  private kindOf(patient: NonNullable<Awaited<ReturnType<WeightJourneyService['load']>>>) {
    return patient.lead?.productKind ?? patient.consultations[patient.consultations.length - 1]?.kind ?? null;
  }

  /** The weight given on the medical questionnaire, from the earliest consultation that has one. */
  private intakeWeight(patient: NonNullable<Awaited<ReturnType<WeightJourneyService['load']>>>): number | null {
    return this.intakeMeasurement(patient)?.kg ?? null;
  }

  private intakeMeasurement(patient: NonNullable<Awaited<ReturnType<WeightJourneyService['load']>>>): { kg: number; at: Date } | null {
    for (const c of patient.consultations) {
      const answers = Array.isArray(c.quizAnswers) ? (c.quizAnswers as any[]) : [];
      const a = answers.find((x) => x?.questionId === 'weight_kg');
      const kg = Number(a?.value ?? a?.answer);
      if (Number.isFinite(kg) && kg > 0) return { kg: round1(kg), at: c.submittedAt };
    }
    return null;
  }

  /** Where the series starts: the snapshotted starting weight, dated by the intake it came from. */
  startingPoint(patient: NonNullable<Awaited<ReturnType<WeightJourneyService['load']>>>): { kg: number; at: Date } | null {
    const intake = this.intakeMeasurement(patient);
    const kg = num(patient.weightGoal?.startingWeightKg) ?? intake?.kg ?? null;
    if (kg === null) return null;
    return { kg, at: intake?.at ?? patient.weightGoal?.createdAt ?? patient.createdAt };
  }

  private build(patient: NonNullable<Awaited<ReturnType<WeightJourneyService['load']>>>): WeightJourneyModel {
    const starting = num(patient.weightGoal?.startingWeightKg) ?? this.intakeWeight(patient);
    const target = num(patient.weightGoal?.targetWeightKg);

    const completed = patient.checkIns
      .filter((c) => c.status === CheckInStatus.COMPLETED && c.weightKg !== null && c.completedAt)
      .sort((a, b) => a.completedAt!.getTime() - b.completedAt!.getTime());

    let previous = starting;
    const entries: WeightEntryModel[] = completed.map((c, i) => {
      const weightKg = num(c.weightKg)!;
      const prev = previous ?? weightKg;
      previous = weightKg;
      return {
        checkInId: c.id,
        month: i + 1,
        date: c.completedAt!,
        weightKg,
        previousWeightKg: prev,
        changeKg: round1(weightKg - prev),
        feeling: (c.feeling as CheckInFeeling | null) ?? undefined,
        note: noteOf(c.answers),
      };
    });

    // Current weight = the most recent weighing of either kind (a daily entry or a monthly check-in).
    const lastCheckIn = entries.length ? { measuredAt: entries[entries.length - 1].date, kind: 'CHECK_IN' as const, weightKg: entries[entries.length - 1].weightKg } : null;
    const lastDaily = patient.weightEntries[0]
      ? { measuredAt: patient.weightEntries[0].measuredAt, kind: 'DAILY' as const, weightKg: num(patient.weightEntries[0].weightKg)! }
      : null;
    const latest = latestOf(lastCheckIn, lastDaily);
    const current = latest ? latest.weightKg : starting;
    const progress = starting !== null && target !== null && current !== null ? computeProgress(starting, target, current) : null;

    return {
      patientId: patient.id,
      startingWeightKg: starting ?? undefined,
      currentWeightKg: current ?? undefined,
      latestMeasurementAt: latest?.measuredAt,
      targetWeightKg: target ?? undefined,
      weightLostKg: progress?.weightLostKg,
      remainingKg: progress?.remainingKg,
      progressPercentage: progress?.progressPercentage,
      motivationMessage: motivationMessage(progress),
      entries,
      ...this.checkInStatus(patient.checkIns),
    };
  }

  private checkInStatus(checkIns: any[]) {
    const now = new Date();
    const ready = checkIns.find((c) => c.status === CheckInStatus.SENT && c.tokenExpiresAt && c.tokenExpiresAt > now);
    const lastDone = checkIns
      .filter((c) => c.status === CheckInStatus.COMPLETED && c.completedAt)
      .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime())[0];
    const upcoming = checkIns.find((c) => c.status === CheckInStatus.SCHEDULED);
    const lastCheckInCompletedAt = lastDone?.completedAt;

    if (ready) {
      return {
        checkInState: MonthlyCheckInState.READY,
        checkInUrl: this.checkIns.buildUrl(ready.token) ?? undefined,
        nextCheckInDueAt: ready.dueAt,
        lastCheckInCompletedAt,
      };
    }
    const justDone = lastDone && now.getTime() - lastDone.completedAt.getTime() < COMPLETED_BANNER_DAYS * 86_400_000;
    return {
      checkInState: justDone ? MonthlyCheckInState.COMPLETED : MonthlyCheckInState.UPCOMING,
      nextCheckInDueAt: upcoming?.dueAt,
      lastCheckInCompletedAt,
    };
  }
}

/** The optional free-text note the patient left on their check-in. */
function noteOf(answers: unknown): string | undefined {
  if (!Array.isArray(answers)) return undefined;
  const text = (answers as any[]).find((a) => a?.questionId === 'notes')?.answer;
  return typeof text === 'string' && text.trim() ? text.trim() : undefined;
}
