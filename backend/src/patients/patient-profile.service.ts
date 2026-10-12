import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UserRole } from '../common/enums';
import { PatientProfileModel, UpdateMyProfileInput } from './models/patient-profile.model';

import { MAX_HEIGHT_CM, MIN_HEIGHT_CM } from './bmi';

const MAX_TEXT = 500;
const PHONE = /^[+0-9 ()-]{6,20}$/;

/** "#HH-2487"-style: the last characters of the id, so it is stable and needs no extra column. */
export const patientNumberOf = (id: string) => `#HH-${id.slice(-6).toUpperCase()}`;

/** The newest intake answer to `questionId` that is a number, if any. */
export function intakeNumber(consultations: Array<{ quizAnswers: unknown }>, questionId: string): number | null {
  for (const c of consultations) {
    const answers = Array.isArray(c.quizAnswers) ? (c.quizAnswers as any[]) : [];
    const v = Number(answers.find((a) => a?.questionId === questionId)?.value);
    if (Number.isFinite(v) && v > 0) return v;
  }
  return null;
}

@Injectable()
export class PatientProfileService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async mine(patientId: string): Promise<PatientProfileModel> {
    const p = await this.prisma.patient.findUniqueOrThrow({
      where: { id: patientId },
      include: {
        onboarding: { select: { status: true } },
        consultations: { orderBy: { submittedAt: 'desc' }, select: { quizAnswers: true } },
      },
    });
    const intakeHeight = p.heightCm == null ? intakeNumber(p.consultations, 'height_cm') : null;
    return {
      id: p.id,
      patientNumber: patientNumberOf(p.id),
      firstName: p.firstName,
      lastName: p.lastName,
      email: p.email,
      dateOfBirth: p.dateOfBirth,
      gender: p.gender,
      heightCm: p.heightCm ?? intakeHeight,
      heightFromIntake: p.heightCm == null && intakeHeight != null,
      phone: p.phone,
      addressLine1: p.addressLine1,
      addressLine2: p.addressLine2,
      city: p.city,
      postcode: p.postcode,
      country: p.country,
      allergies: p.allergies,
      emergencyContactName: p.emergencyContactName,
      emergencyContactPhone: p.emergencyContactPhone,
      verified: p.onboarding?.status === 'APPROVED',
      memberSince: p.activatedAt,
    };
  }

  async update(patientId: string, input: UpdateMyProfileInput): Promise<PatientProfileModel> {
    const data: Record<string, unknown> = {};
    if (input.gender !== undefined) data.gender = input.gender;
    if (input.heightCm !== undefined && input.heightCm !== null) {
      if (!(input.heightCm >= MIN_HEIGHT_CM && input.heightCm <= MAX_HEIGHT_CM)) {
        throw new BadRequestException(`Please enter a height between ${MIN_HEIGHT_CM} and ${MAX_HEIGHT_CM} cm`);
      }
      data.heightCm = Math.round(input.heightCm * 10) / 10;
    }
    if (input.phone !== undefined) {
      const phone = input.phone?.trim();
      if (!phone || !PHONE.test(phone)) throw new BadRequestException('Please enter a valid phone number');
      data.phone = phone;
    }
    if (input.allergies !== undefined) data.allergies = input.allergies.trim().slice(0, MAX_TEXT) || null;
    if (input.emergencyContactName !== undefined) data.emergencyContactName = input.emergencyContactName.trim().slice(0, 120) || null;
    if (input.emergencyContactPhone !== undefined) {
      const phone = input.emergencyContactPhone.trim();
      if (phone && !PHONE.test(phone)) throw new BadRequestException('Please enter a valid phone number for your emergency contact');
      data.emergencyContactPhone = phone || null;
    }
    if (Object.keys(data).length) {
      await this.prisma.patient.update({ where: { id: patientId }, data });
      await this.audit.log({
        actorId: patientId, actorRole: UserRole.PATIENT, action: 'PROFILE_UPDATED', resourceType: 'Patient', resourceId: patientId, patientId,
        metadata: { fields: Object.keys(data) },
      });
    }
    return this.mine(patientId);
  }
}
