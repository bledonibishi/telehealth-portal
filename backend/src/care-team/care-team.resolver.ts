import { Field, ID, ObjectType, Query, Resolver } from '@nestjs/graphql';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/access-roles';
import { PrismaService } from '../prisma/prisma.service';
import { PrescriptionStatus } from '../common/enums';
import { type CareTeamSource, careTeamOf } from './care-team';

@ObjectType('CareTeamMember', { description: 'Someone on the signed-in patient’s care team. Never their email or licence number.' })
export class CareTeamMemberModel {
  @Field(() => ID)
  id: string;

  @Field()
  name: string;

  @Field({ description: 'e.g. "Doctor"' })
  role: string;

  @Field({ nullable: true, description: 'Who they are registered with, when verified' })
  licensingBody?: string | null;

  @Field({ description: 'The doctor responsible for the patient’s current treatment' })
  primary: boolean;

  @Field({ description: 'How they are involved, in the patient’s words' })
  involvement: string;

  @Field()
  since: Date;

  @Field({ nullable: true, description: 'e.g. "Endocrinologist"' })
  specialty?: string | null;

  @Field({ nullable: true })
  bio?: string | null;

  @Field(() => [String])
  languages: string[];
}

const INVOLVEMENT = { PRESCRIBER: 'Prescribed your current treatment', CONSULTATION: 'Reviewed your consultation', APPOINTMENT: 'Your appointments' } as const;
const ROLE: Record<string, string> = { DOCTOR: 'Doctor', ADMIN: 'Clinical lead', CX_TEAM: 'Patient support', PROVIDER: 'Pharmacy team' };

@Resolver()
export class CareTeamResolver {
  constructor(private prisma: PrismaService) {}

  // The patient id always comes from the token, never an argument.
  @Authorized('PATIENT')
  @Query(() => [CareTeamMemberModel], { description: 'The clinicians looking after the signed-in patient, their main doctor first' })
  async myCareTeam(@CurrentUser() user: AuthUser): Promise<CareTeamMemberModel[]> {
    const [prescriptions, consultations, appointments] = await Promise.all([
      this.prisma.prescription.findMany({ where: { patientId: user.id, status: PrescriptionStatus.ACTIVE, prescriberId: { not: null } }, select: { prescriberId: true, issuedAt: true }, orderBy: { issuedAt: 'desc' }, take: 1 }),
      this.prisma.consultation.findMany({ where: { patientId: user.id, clinicianId: { not: null } }, select: { clinicianId: true, submittedAt: true } }),
      this.prisma.appointmentRequest.findMany({ where: { patientId: user.id, handledById: { not: null }, status: { in: ['SCHEDULED', 'COMPLETED'] } }, select: { handledById: true, createdAt: true } }),
    ]);
    const sources: CareTeamSource[] = [
      ...prescriptions.map((p) => ({ clinicianId: p.prescriberId!, via: 'PRESCRIBER' as const, at: p.issuedAt })),
      ...consultations.map((c) => ({ clinicianId: c.clinicianId!, via: 'CONSULTATION' as const, at: c.submittedAt })),
      ...appointments.map((a) => ({ clinicianId: a.handledById!, via: 'APPOINTMENT' as const, at: a.createdAt })),
    ];
    const team = careTeamOf(sources);
    if (!team.length) return [];
    const clinicians = await this.prisma.clinician.findMany({
      where: { id: { in: team.map((t) => t.clinicianId) } },
      select: { id: true, firstName: true, lastName: true, role: true, licensingBody: true, isVerified: true, specialty: true, bio: true, languages: true },
    });
    const byId = new Map(clinicians.map((c) => [c.id, c]));
    return team.flatMap((t) => {
      const c = byId.get(t.clinicianId);
      if (!c) return [];
      return [{
        id: c.id,
        name: `${c.role === 'DOCTOR' ? 'Dr. ' : ''}${c.firstName} ${c.lastName}`,
        role: ROLE[c.role] ?? 'Care team',
        licensingBody: c.isVerified ? c.licensingBody : null,
        primary: t.primary,
        involvement: INVOLVEMENT[t.via],
        since: t.since,
        specialty: c.specialty,
        bio: c.bio,
        languages: c.languages,
      }];
    });
  }
}
