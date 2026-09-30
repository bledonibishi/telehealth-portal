import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ClinicianRole } from '@prisma/client';
import { UserRole } from '../common/enums';
import { VerifyClinicianInput } from './dto/verify-clinician.input';

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
