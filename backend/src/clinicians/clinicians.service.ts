import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { Prisma, type Clinician } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ClinicianRole } from '@prisma/client';
import { ConsultationStatus, UserRole } from '../common/enums';
import { EmailService } from '../email/email.service';
import { newActivationToken } from '../auth/activation-token';
import { CreateClinicianInput, UpdateClinicianInput } from './dto/clinician-account.input';
import { VerifyClinicianInput } from './dto/verify-clinician.input';
import { UpdateClinicianProfileInput } from './dto/update-clinician-profile.input';

export const MAX_SPECIALTY_LENGTH = 100;
export const MAX_BIO_LENGTH = 500;
export const MAX_LANGUAGES = 8;
export const MAX_LANGUAGE_LENGTH = 30;
export const MAX_NAME_LENGTH = 60;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A name as it is stored: trimmed, not empty, not absurdly long. */
function cleanName(value: string | undefined, label: string): string {
  const v = (value ?? '').trim();
  if (!v) throw new BadRequestException(`${label} is required`);
  if (v.length > MAX_NAME_LENGTH) throw new BadRequestException(`${label} can be up to ${MAX_NAME_LENGTH} characters`);
  return v;
}

/** Emails are kept lower-case and trimmed, so the same address cannot be added twice in different cases. */
export function cleanEmail(value: string | undefined): string {
  const v = (value ?? '').trim().toLowerCase();
  if (!v || v.length > 254 || !EMAIL_PATTERN.test(v)) throw new BadRequestException('Please enter a valid email address');
  return v;
}

export interface InviteDelivery {
  /** True only when the email provider accepted it. */
  emailSent: boolean;
  /** The link, given to the admin only when the email did not go out, so they can pass it on themselves. */
  inviteUrl?: string;
}

@Injectable()
export class CliniciansService {
  private readonly logger = new Logger(CliniciansService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private email: EmailService,
    private config: ConfigService,
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

  // ── team management (admins) ──────────────────────────────────────────────

  /**
   * Adds a member. They are never given a password: they get a single-use link (7 days) to choose their own, and until
   * they do, the account holds an unguessable placeholder. Their role decides what they can open.
   */
  async create(actorId: string, input: CreateClinicianInput): Promise<{ clinician: Clinician; delivery: InviteDelivery }> {
    const firstName = cleanName(input.firstName, 'First name');
    const lastName = cleanName(input.lastName, 'Last name');
    const email = cleanEmail(input.email);
    if (!Object.values(ClinicianRole).includes(input.role)) throw new BadRequestException('Choose a role');
    if (await this.prisma.clinician.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } })) {
      throw new ConflictException('Someone with that email is already on the team');
    }

    const invite = newActivationToken();
    const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
    let created;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const row = await tx.clinician.create({ data: { firstName, lastName, email, role: input.role, passwordHash, passwordSetAt: null, inviteToken: invite.activationToken, inviteTokenExpiresAt: invite.activationTokenExpiresAt } });
        await this.audit.log({ actorId, actorRole: UserRole.CLINICIAN, action: 'CLINICIAN_CREATED', resourceType: 'Clinician', resourceId: row.id, metadata: { email, role: input.role } }, tx);
        return row;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new ConflictException('Someone with that email is already on the team');
      throw err;
    }
    return { clinician: created, delivery: await this.deliverInvite(actorId, created, true) };
  }

  /** Changes a member's name or email. What is left out stays. */
  async update(actorId: string, input: UpdateClinicianInput) {
    const before = await this.prisma.clinician.findUnique({ where: { id: input.clinicianId } });
    if (!before) throw new NotFoundException('Team member not found');
    const data: { firstName?: string; lastName?: string; email?: string } = {};
    if (input.firstName != null) data.firstName = cleanName(input.firstName, 'First name');
    if (input.lastName != null) data.lastName = cleanName(input.lastName, 'Last name');
    if (input.email != null) {
      data.email = cleanEmail(input.email);
      const taken = await this.prisma.clinician.findFirst({ where: { email: { equals: data.email, mode: 'insensitive' }, id: { not: before.id } }, select: { id: true } });
      if (taken) throw new ConflictException('Someone else on the team already has that email');
    }
    if (Object.keys(data).length === 0) throw new BadRequestException('Nothing to change');

    // A link already sent went to the old address. Once the address changes, whoever holds that link must not be able
    // to set this account's password with it: it stops working in the same write as the change. Someone still waiting
    // on their invitation gets a new one at the new address; a password link is simply voided (the admin can send another).
    const emailChanged = data.email !== undefined && data.email !== before.email;
    const hadLink = emailChanged && !!before.inviteToken;
    const reinvite = hadLink && !before.passwordSetAt && !before.deactivatedAt;
    const fresh = reinvite ? newActivationToken() : null;
    const link = hadLink ? { inviteToken: fresh?.activationToken ?? null, inviteTokenExpiresAt: fresh?.activationTokenExpiresAt ?? null } : {};

    let updated: Clinician;
    try {
      updated = await this.prisma.$transaction(async (tx) => {
        const row = await tx.clinician.update({ where: { id: before.id }, data: { ...data, ...link } });
        await this.audit.log(
          {
            actorId, actorRole: UserRole.CLINICIAN, action: 'CLINICIAN_DETAILS_CHANGED', resourceType: 'Clinician', resourceId: before.id,
            metadata: { from: Object.fromEntries(Object.keys(data).map((k) => [k, (before as any)[k]])), to: data, ...(hadLink ? { oldLinkVoided: true, newInvitationSent: reinvite } : {}) },
          },
          tx,
        );
        return row;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new ConflictException('Someone else on the team already has that email');
      throw err;
    }
    // If this email does not go out, the member still shows as invited and "Resend invitation" gives the admin the link.
    if (reinvite) await this.deliverInvite(actorId, updated, true);
    return updated;
  }

  /**
   * Turns an account off without deleting anything: the history it made (decisions, prescriptions, notes) stays, it can no
   * longer sign in, and a session already open stops working. Consultations it had claimed go back to the queue.
   */
  async deactivate(actorId: string, id: string) {
    if (actorId === id) throw new BadRequestException('You cannot deactivate your own account');
    const before = await this.prisma.clinician.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Team member not found');
    if (before.deactivatedAt) return before;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.clinician.update({ where: { id }, data: { deactivatedAt: new Date(), inviteToken: null, inviteTokenExpiresAt: null } });
      const released = await tx.consultation.updateMany({ where: { clinicianId: id, status: ConsultationStatus.IN_REVIEW }, data: { status: ConsultationStatus.SUBMITTED, clinicianId: null } });
      await this.audit.log({ actorId, actorRole: UserRole.CLINICIAN, action: 'CLINICIAN_DEACTIVATED', resourceType: 'Clinician', resourceId: id, metadata: { releasedConsultations: released.count } }, tx);
      return updated;
    });
  }

  async reactivate(actorId: string, id: string) {
    const before = await this.prisma.clinician.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Team member not found');
    if (!before.deactivatedAt) return before;
    const updated = await this.prisma.clinician.update({ where: { id }, data: { deactivatedAt: null } });
    await this.audit.log({ actorId, actorRole: UserRole.CLINICIAN, action: 'CLINICIAN_REACTIVATED', resourceType: 'Clinician', resourceId: id });
    return updated;
  }

  /** A new single-use link: to finish an invitation, or for a member who lost their password. Replaces any link sent before. */
  async sendInvite(actorId: string, id: string): Promise<{ clinician: Clinician; delivery: InviteDelivery }> {
    const before = await this.prisma.clinician.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Team member not found');
    if (before.deactivatedAt) throw new BadRequestException('Turn the account back on before sending a link');
    const invite = newActivationToken();
    const updated = await this.prisma.clinician.update({ where: { id }, data: { inviteToken: invite.activationToken, inviteTokenExpiresAt: invite.activationTokenExpiresAt } });
    return { clinician: updated, delivery: await this.deliverInvite(actorId, updated, !before.passwordSetAt) };
  }

  /** Removes someone who was invited and never signed in. Anyone who has used their account is deactivated instead, so their history stays. */
  async deleteUnused(actorId: string, id: string): Promise<boolean> {
    if (actorId === id) throw new BadRequestException('You cannot delete your own account');
    const before = await this.prisma.clinician.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Team member not found');
    const used = () => new BadRequestException('This person has used their account, so it is kept for the record. Deactivate it instead.');
    if (before.passwordSetAt) throw used();
    try {
      await this.prisma.$transaction(async (tx) => {
        // Still unused at the moment it is removed: they may have accepted the invitation since it was read above.
        const { count } = await tx.clinician.deleteMany({ where: { id, passwordSetAt: null } });
        if (count !== 1) throw used();
        await this.audit.log({ actorId, actorRole: UserRole.CLINICIAN, action: 'CLINICIAN_DELETED', resourceType: 'Clinician', resourceId: id, metadata: { email: before.email, role: before.role } }, tx);
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') throw new BadRequestException('This account is linked to records, so it cannot be deleted. Deactivate it instead.');
      throw err;
    }
    return true;
  }

  private async deliverInvite(actorId: string, clinician: { id: string; email: string; firstName: string; inviteToken: string | null }, firstTime: boolean): Promise<InviteDelivery> {
    const app = (this.config.get<string>('CLINICIAN_APP_URL')?.trim() || 'http://localhost:3002').replace(/\/$/, '');
    const url = `${app}/accept-invite?token=${clinician.inviteToken}`;
    let emailSent = false;
    try {
      emailSent = await this.email.sendClinicianInviteEmail(clinician.email, clinician.firstName, url, firstTime);
    } catch (err: any) {
      emailSent = false;
      // Why it failed, for whoever has to fix the mail set-up. Never the link itself: it is as good as a password.
      this.logger.error(`The invitation email to clinician ${clinician.id} could not be sent: ${err?.message ?? err}`, err?.stack);
    }
    await this.audit.log({ actorId, actorRole: UserRole.CLINICIAN, action: 'CLINICIAN_INVITE_SENT', resourceType: 'Clinician', resourceId: clinician.id, metadata: { emailSent, firstTime } });
    return emailSent ? { emailSent } : { emailSent, inviteUrl: url };
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

  /** What patients read about a clinician. A field that is left out stays as it is; an empty value clears it. */
  async updateProfile(actorId: string, input: UpdateClinicianProfileInput) {
    const data: { specialty?: string | null; bio?: string | null; languages?: string[] } = {};
    if (input.specialty != null) {
      data.specialty = input.specialty.trim() || null;
      if (data.specialty && data.specialty.length > MAX_SPECIALTY_LENGTH) throw new BadRequestException(`The specialty can be up to ${MAX_SPECIALTY_LENGTH} characters`);
    }
    if (input.bio != null) {
      data.bio = input.bio.trim() || null;
      if (data.bio && data.bio.length > MAX_BIO_LENGTH) throw new BadRequestException(`The description can be up to ${MAX_BIO_LENGTH} characters`);
    }
    if (input.languages != null) {
      // Trimmed, blanks dropped, and no language listed twice however it was capitalised.
      const languages: string[] = [];
      for (const l of input.languages.map((x) => x.trim()).filter(Boolean)) {
        if (!languages.some((seen) => seen.toLowerCase() === l.toLowerCase())) languages.push(l);
      }
      if (languages.length > MAX_LANGUAGES) throw new BadRequestException(`List up to ${MAX_LANGUAGES} languages`);
      if (languages.some((l) => l.length > MAX_LANGUAGE_LENGTH)) throw new BadRequestException(`A language can be up to ${MAX_LANGUAGE_LENGTH} characters`);
      data.languages = languages;
    }

    const before = await this.prisma.clinician.findUnique({ where: { id: input.clinicianId } });
    if (!before) throw new NotFoundException('Clinician not found');

    const updated = await this.prisma.clinician.update({ where: { id: input.clinicianId }, data });
    await this.audit.log({
      actorId,
      actorRole: UserRole.CLINICIAN,
      action: 'CLINICIAN_PROFILE_UPDATED',
      resourceType: 'Clinician',
      resourceId: input.clinicianId,
      metadata: {
        from: Object.fromEntries(Object.keys(data).map((k) => [k, (before as any)[k]])),
        to: data,
      },
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
