import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ConsultationStatus, UserRole } from '../common/enums';
import { ApproveConsultationInput } from './dto/approve-consultation.input';
import { DeclineConsultationInput } from './dto/decline-consultation.input';
import { SubmitIntakeQuizInput } from './dto/submit-intake-quiz.input';

const REVIEWABLE = [
  ConsultationStatus.SUBMITTED,
  ConsultationStatus.IN_REVIEW,
  ConsultationStatus.MORE_INFO_REQUESTED,
] as const;

// Red flag detection runs before any clinician sees the submission.
// Only CRITICAL flags auto-reject; WARNING flags are surfaced to the clinician.
function detectRedFlags(answers: SubmitIntakeQuizInput['answers']) {
  const flags: Array<{ description: string; severity: 'CRITICAL' | 'WARNING' }> = [];

  const check = (qId: string, val: string, desc: string, severity: 'CRITICAL' | 'WARNING') => {
    const a = answers.find((a) => a.questionId === qId);
    if (a && a.answer.toLowerCase() === val) flags.push({ description: desc, severity });
  };

  check('active_cancer', 'yes', 'Active cancer diagnosis reported', 'CRITICAL');
  check('blood_clots_history', 'yes', 'History of blood clots or DVT reported', 'CRITICAL');
  check('unexplained_bleeding', 'yes', 'Unexplained vaginal bleeding reported', 'CRITICAL');
  check('liver_disease', 'yes', 'Liver disease reported', 'WARNING');
  check('uncontrolled_hypertension', 'yes', 'Uncontrolled hypertension reported', 'WARNING');
  check('recent_heart_attack', 'yes', 'Recent heart attack or stroke reported', 'CRITICAL');

  return flags;
}

@Injectable()
export class ConsultationsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async findQueue() {
    const rows = await this.prisma.consultation.findMany({
      where: { status: { in: REVIEWABLE as any } },
      include: { patient: true, clinician: true, redFlags: true },
      orderBy: { submittedAt: 'asc' },
    });

    return rows.sort((a, b) => {
      const aCtitical = a.redFlags.some((f) => f.severity === 'CRITICAL');
      const bCritical = b.redFlags.some((f) => f.severity === 'CRITICAL');
      if (aCtitical && !bCritical) return -1;
      if (!aCtitical && bCritical) return 1;
      return 0;
    });
  }

  async findById(id: string) {
    const c = await this.prisma.consultation.findUnique({
      where: { id },
      include: {
        patient: true,
        clinician: true,
        redFlags: { orderBy: { severity: 'asc' } },
        prescription: true,
        messages: { orderBy: { sentAt: 'asc' } },
      },
    });
    if (!c) throw new NotFoundException(`Consultation ${id} not found`);
    return c;
  }

  findByPatient(patientId: string) {
    return this.prisma.consultation.findMany({
      where: { patientId },
      include: { redFlags: true, prescription: true },
      orderBy: { submittedAt: 'desc' },
    });
  }

  async submitIntakeQuiz(patientId: string, input: SubmitIntakeQuizInput) {
    const flags = detectRedFlags(input.answers);
    const hasCritical = flags.some((f) => f.severity === 'CRITICAL');

    if (hasCritical) {
      throw new ForbiddenException(
        'Based on your responses, please seek immediate medical attention. This service cannot safely process your submission.',
      );
    }

    const consultation = await this.prisma.consultation.create({
      data: {
        patientId,
        kind: input.kind,
        quizAnswers: input.answers as any,
        redFlags: { create: flags },
      },
      include: { patient: true, redFlags: true, messages: true },
    });

    await this.audit.log({
      actorId: patientId,
      actorRole: UserRole.PATIENT,
      action: 'CONSULTATION_SUBMITTED',
      resourceType: 'Consultation',
      resourceId: consultation.id,
    });

    return consultation;
  }

  async approve(clinicianId: string, input: ApproveConsultationInput) {
    const c = await this.findById(input.consultationId);
    if (!REVIEWABLE.includes(c.status as any)) {
      throw new ForbiddenException('Consultation is not in a reviewable state');
    }

    const updated = await this.prisma.consultation.update({
      where: { id: input.consultationId },
      data: {
        status: ConsultationStatus.APPROVED,
        clinicianId,
        prescription: {
          create: {
            medication: input.medication,
            dosage: input.dosage,
            instructions: input.instructions,
            // TODO: pharmacyRef — integrate once pharmacy partnership confirmed
          },
        },
      },
      include: { patient: true, clinician: true, redFlags: true, prescription: true, messages: true },
    });

    await this.audit.log({
      actorId: clinicianId,
      actorRole: UserRole.CLINICIAN,
      action: 'CONSULTATION_APPROVED',
      resourceType: 'Consultation',
      resourceId: input.consultationId,
      metadata: { medication: input.medication, dosage: input.dosage },
    });

    return updated;
  }

  async decline(clinicianId: string, input: DeclineConsultationInput) {
    const c = await this.findById(input.consultationId);
    if (!REVIEWABLE.includes(c.status as any)) {
      throw new ForbiddenException('Consultation is not in a reviewable state');
    }

    const updated = await this.prisma.consultation.update({
      where: { id: input.consultationId },
      data: { status: ConsultationStatus.DECLINED, clinicianId },
      include: { patient: true, clinician: true, redFlags: true, prescription: true, messages: true },
    });

    await this.audit.log({
      actorId: clinicianId,
      actorRole: UserRole.CLINICIAN,
      action: 'CONSULTATION_DECLINED',
      resourceType: 'Consultation',
      resourceId: input.consultationId,
      metadata: { reason: input.reason },
    });

    return updated;
  }

  async requestMoreInfo(clinicianId: string, consultationId: string) {
    const c = await this.findById(consultationId);
    if (
      ![ConsultationStatus.SUBMITTED, ConsultationStatus.IN_REVIEW].includes(c.status as any)
    ) {
      throw new ForbiddenException('Consultation is not in a reviewable state');
    }

    const updated = await this.prisma.consultation.update({
      where: { id: consultationId },
      data: { status: ConsultationStatus.MORE_INFO_REQUESTED, clinicianId },
      include: { patient: true, clinician: true, redFlags: true, prescription: true, messages: true },
    });

    await this.audit.log({
      actorId: clinicianId,
      actorRole: UserRole.CLINICIAN,
      action: 'CONSULTATION_MORE_INFO_REQUESTED',
      resourceType: 'Consultation',
      resourceId: consultationId,
    });

    return updated;
  }
}
