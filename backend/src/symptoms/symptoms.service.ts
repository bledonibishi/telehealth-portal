import { BadRequestException, Injectable } from '@nestjs/common';
import { SymptomAssessment } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SymptomScale } from '../common/enums';
import { SymptomAssessmentModel, SymptomScaleModel } from './models/symptoms.model';
import { SCALES, ScaleDefinition, ScoredAnswer, domainScores, maxScore, minScore, scaleForKind, severityOf, validateAnswers } from './symptom-scales';

// A second submission this soon after the last one replaces it rather than
// adding another point — a same-day correction, not a new measurement.
const REPLACE_WITHIN_HOURS = 24;

@Injectable()
export class SymptomsService {
  constructor(private prisma: PrismaService) {}

  /** The questionnaire for the patient’s programme, or null when it has none (e.g. GLP-1). */
  async scaleFor(patientId: string): Promise<SymptomScaleModel | null> {
    const scale = await this.patientScale(patientId);
    return scale && this.toScaleModel(scale);
  }

  definition(scale: SymptomScale): SymptomScaleModel {
    return this.toScaleModel(SCALES[scale]);
  }

  /** The patient’s assessments, oldest first — all of them, or only those on one scale. */
  async history(patientId: string, scale?: SymptomScale): Promise<SymptomAssessmentModel[]> {
    const rows = await this.prisma.symptomAssessment.findMany({ where: { patientId, ...(scale && { scale }) }, orderBy: { recordedAt: 'asc' } });
    return rows.map((r) => this.toAssessmentModel(r));
  }

  /**
   * The patient’s own history on their current programme’s scale, so a chart never
   * mixes MRS (0–44) and AMS (17–85) scores after a change of programme.
   */
  async ownHistory(patientId: string): Promise<SymptomAssessmentModel[]> {
    const scale = await this.patientScale(patientId);
    return scale ? this.history(patientId, scale.id) : [];
  }

  async record(patientId: string, answers: ScoredAnswer[]): Promise<SymptomAssessmentModel> {
    const scale = await this.patientScale(patientId);
    if (!scale) throw new BadRequestException('Symptom tracking isn’t part of your programme');

    const checked = validateAnswers(scale, answers);
    if (checked.errors.length) throw new BadRequestException(checked.errors.join(' '));
    const data = {
      scale: scale.id,
      answers: checked.answers,
      totalScore: checked.answers.reduce((sum, a) => sum + a.score, 0),
    };

    const row = await this.prisma.$transaction(async (tx) => {
      // Serialise saves per patient and scale, so two at once can't both miss the
      // recent one and add two chart points; the lock ends with the transaction.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`symptoms:${patientId}:${scale.id}`}))`;
      const recent = await tx.symptomAssessment.findFirst({
        where: { patientId, scale: scale.id, recordedAt: { gte: new Date(Date.now() - REPLACE_WITHIN_HOURS * 3_600_000) } },
        orderBy: { recordedAt: 'desc' },
      });
      return recent
        ? tx.symptomAssessment.update({ where: { id: recent.id }, data })
        : tx.symptomAssessment.create({ data: { patientId, ...data } });
    });
    return this.toAssessmentModel(row);
  }

  private async patientScale(patientId: string): Promise<ScaleDefinition | null> {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      include: { lead: { select: { productKind: true } }, consultations: { orderBy: { submittedAt: 'asc' }, select: { kind: true } } },
    });
    if (!patient) return null;
    // The latest consultation says which programme they're on now; the lead only
    // says what they first signed up for, so it's the fallback.
    const kind = patient.consultations[patient.consultations.length - 1]?.kind ?? patient.lead?.productKind ?? null;
    return scaleForKind(kind);
  }

  private toScaleModel(s: ScaleDefinition): SymptomScaleModel {
    return { id: s.id, name: s.name, intro: s.intro, options: s.options, domains: s.domains, items: s.items, minScore: minScore(s), maxScore: maxScore(s) };
  }

  private toAssessmentModel(row: SymptomAssessment): SymptomAssessmentModel {
    const scale = SCALES[row.scale as SymptomScale];
    const answers = (Array.isArray(row.answers) ? row.answers : []) as ScoredAnswer[];
    return {
      id: row.id,
      scale: row.scale as SymptomScale,
      recordedAt: row.recordedAt,
      totalScore: row.totalScore,
      minScore: minScore(scale),
      maxScore: maxScore(scale),
      severity: severityOf(scale, row.totalScore),
      domainScores: domainScores(scale, answers),
      answers,
    };
  }
}
