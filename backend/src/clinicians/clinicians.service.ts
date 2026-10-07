import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ClinicianRole } from '@prisma/client';
import { UserRole } from '../common/enums';
import { VerifyClinicianInput } from './dto/verify-clinician.input';
import { UpdateClinicianProfileInput } from './dto/update-clinician-profile.input';

export const MAX_SPECIALTY_LENGTH = 100;
export const MAX_BIO_LENGTH = 500;
export const MAX_LANGUAGES = 8;
export const MAX_LANGUAGE_LENGTH = 30;

@Injectable()
export class CliniciansService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  findAll() {
    return this.prisma.clinician.findMany({ orderBy: { createdAt: 'asc' } });
  }

  findById(id: string) {
    return this.prisma.clinician.findUnique({ where: { id } });
  }

  findByEmail(email: string) {
    return this.prisma.clinician.findUnique({ where: { email } });
  }

  async updateRole(actorId: string, id: string, role: ClinicianRole) {
    // An admin demoting themselves could leave nobody able to manage the team.
    if (actorId === id) throw new BadRequestException('You cannot change your own role');

    const before = await this.prisma.clinician.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Clinician not found');

    const updated = await this.prisma.clinician.update({ where: { id }, data: { role } });
    await this.audit.log({
      actorId,
      actorRole: UserRole.CLINICIAN,
      action: 'CLINICIAN_ROLE_CHANGED',
      resourceType: 'Clinician',
      resourceId: id,
      metadata: { from: before.role, to: role },
    });
    return updated;
  }

  /** What patients read about a clinician. An empty value clears it. */
  async updateProfile(actorId: string, input: UpdateClinicianProfileInput) {
    const specialty = input.specialty?.trim() || null;
    const bio = input.bio?.trim() || null;
    if (specialty && specialty.length > MAX_SPECIALTY_LENGTH) throw new BadRequestException(`The specialty can be up to ${MAX_SPECIALTY_LENGTH} characters`);
    if (bio && bio.length > MAX_BIO_LENGTH) throw new BadRequestException(`The description can be up to ${MAX_BIO_LENGTH} characters`);
    // Trimmed, blanks dropped, and no language listed twice however it was capitalised.
    const languages: string[] = [];
    for (const l of (input.languages ?? []).map((x) => x.trim()).filter(Boolean)) {
      if (!languages.some((seen) => seen.toLowerCase() === l.toLowerCase())) languages.push(l);
    }
    if (languages.length > MAX_LANGUAGES) throw new BadRequestException(`List up to ${MAX_LANGUAGES} languages`);
    if (languages.some((l) => l.length > MAX_LANGUAGE_LENGTH)) throw new BadRequestException(`A language can be up to ${MAX_LANGUAGE_LENGTH} characters`);

    const before = await this.prisma.clinician.findUnique({ where: { id: input.clinicianId } });
    if (!before) throw new NotFoundException('Clinician not found');

    const updated = await this.prisma.clinician.update({ where: { id: input.clinicianId }, data: { specialty, bio, languages } });
    await this.audit.log({
      actorId,
      actorRole: UserRole.CLINICIAN,
      action: 'CLINICIAN_PROFILE_UPDATED',
      resourceType: 'Clinician',
      resourceId: input.clinicianId,
      metadata: { from: { specialty: before.specialty, bio: before.bio, languages: before.languages }, to: { specialty, bio, languages } },
    });
    return updated;
  }

  async verify(actorId: string, input: VerifyClinicianInput) {
    const licenseNumber = input.licenseNumber.trim();
    const licensingBody = input.licensingBody.trim();
    if (!licenseNumber || !licensingBody) {
      throw new BadRequestException('Licence number and licensing body are required');
    }

    const taken = await this.prisma.clinician.findUnique({ where: { licenseNumber } });
    if (taken && taken.id !== input.clinicianId) {
      throw new ConflictException('That licence number belongs to another clinician');
    }

    const updated = await this.prisma.clinician.update({
      where: { id: input.clinicianId },
      data: { licenseNumber, licensingBody, isVerified: true, verifiedAt: new Date(), verifiedById: actorId },
    });
    await this.audit.log({
      actorId,
      actorRole: UserRole.CLINICIAN,
      action: 'CLINICIAN_VERIFIED',
      resourceType: 'Clinician',
      resourceId: input.clinicianId,
      metadata: { licenseNumber, licensingBody },
    });
    return updated;
  }

  async revokeVerification(actorId: string, id: string) {
    const updated = await this.prisma.clinician.update({
      where: { id },
      data: { isVerified: false, verifiedAt: null, verifiedById: null },
    });
    await this.audit.log({
      actorId,
      actorRole: UserRole.CLINICIAN,
      action: 'CLINICIAN_VERIFICATION_REVOKED',
      resourceType: 'Clinician',
      resourceId: id,
    });
    return updated;
  }
}
