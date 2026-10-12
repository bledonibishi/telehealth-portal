import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ConsultationKind, OnboardingStatus, RiskTag, UserRole } from '../common/enums';
import { triageEligibility } from '../questionnaires/triage';
import { CxTaskKind } from './cx.model';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// A lead gets an hour to pay on their own before anyone is asked to follow up, and drops off the list after a
// month: by then they have decided, and we should not keep chasing (or keep reading) an old quiz.
const LEAD_GRACE_MS = HOUR;
const LEAD_WINDOW_MS = 30 * DAY;
// Once contacted, a lead rests this long before it is offered again.
const LEAD_RECONTACT_MS = 3 * DAY;
// Paid but not signed in yet: the activation email usually does the job within a day.
const ACTIVATION_GRACE_MS = DAY;
// Signed in but the ID or photos are still unfinished.
const ONBOARDING_GRACE_MS = 2 * DAY;

@Injectable()
export class CxService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async workQueue(now = new Date()) {
    const at = (msAgo: number) => new Date(now.getTime() - msAgo);
    const weekAgo = at(7 * DAY);

    const [reply, leads, activation, onboarding, leadsThisWeek, paidThisWeek, activatedThisWeek] = await Promise.all([
      this.replyTasks(),
      this.leadTasks(at(LEAD_WINDOW_MS), at(LEAD_GRACE_MS), at(LEAD_RECONTACT_MS)),
      this.activationTasks(at(ACTIVATION_GRACE_MS)),
      this.onboardingTasks(at(ONBOARDING_GRACE_MS)),
      this.prisma.lead.count({ where: { createdAt: { gte: weekAgo } } }),
      this.prisma.lead.count({ where: { createdAt: { gte: weekAgo }, convertedAt: { not: null } } }),
      this.prisma.patient.count({ where: { activatedAt: { gte: weekAgo } } }),
    ]);

    const tasks = [...reply, ...leads, ...activation, ...onboarding].sort((a, b) => a.since.getTime() - b.since.getTime());
    return { tasks, leadsThisWeek, paidThisWeek, activatedThisWeek };
  }

  /** Patients whose newest message is their own. They have been waiting since the first one nobody answered. */
  private async replyTasks() {
    const newest = await this.prisma.message.findMany({
      distinct: ['patientId'],
      orderBy: { sentAt: 'desc' },
      select: { patientId: true, senderRole: true },
    });
    const waiting = newest.filter((m) => m.senderRole === UserRole.PATIENT).map((m) => m.patientId);
    if (!waiting.length) return [];

    const [messages, patients] = await Promise.all([
      this.prisma.message.findMany({
        where: { patientId: { in: waiting } },
        orderBy: { sentAt: 'desc' },
        select: { patientId: true, senderRole: true, sentAt: true },
      }),
      this.prisma.patient.findMany({ where: { id: { in: waiting } }, select: PERSON }),
    ]);
    // Newest first: keep moving `since` back until the first message that isn't the patient's.
    const since = new Map<string, Date>();
    const answered = new Set<string>();
    for (const m of messages) {
      if (answered.has(m.patientId)) continue;
      if (m.senderRole === UserRole.PATIENT) since.set(m.patientId, m.sentAt);
      else answered.add(m.patientId);
    }
    return patients.map((p) => patientTask(CxTaskKind.REPLY, p, since.get(p.id)!));
  }

  /** Leads worth a follow-up: eligible, unpaid, recent, and not contacted in the last few days. */
  private async leadTasks(from: Date, to: Date, contactedBefore: Date) {
    const leads = await this.prisma.lead.findMany({
      where: {
        convertedAt: null,
        doNotContactAt: null,
        createdAt: { gte: from, lte: to },
        OR: [{ lastContactedAt: null }, { lastContactedAt: { lt: contactedBefore } }],
      },
      select: {
        id: true, email: true, firstName: true, lastName: true, productKind: true, quizAnswers: true,
        createdAt: true, lastContactedAt: true, lastContactedById: true,
      },
    });
    // Someone whose answers rule out treatment online is never encouraged to pay.
    const eligible = leads.filter((l) => triageEligibility(l.productKind as ConsultationKind, l.quizAnswers as any).riskTag !== RiskTag.RED);

    const staffIds = [...new Set(eligible.map((l) => l.lastContactedById).filter((id): id is string => !!id))];
    const staff = staffIds.length
      ? await this.prisma.clinician.findMany({ where: { id: { in: staffIds } }, select: { id: true, firstName: true, lastName: true } })
      : [];
    const staffName = new Map(staff.map((c) => [c.id, `${c.firstName} ${c.lastName}`]));

    return eligible.map((l) => ({
      id: `${CxTaskKind.LEAD}:${l.id}`,
      kind: CxTaskKind.LEAD,
      name: `${l.firstName} ${l.lastName}`,
      email: l.email,
      programme: l.productKind as ConsultationKind,
      // Waiting since they finished the quiz, or since the last time we tried.
      since: l.lastContactedAt ?? l.createdAt,
      leadId: l.id,
      sentBack: false,
      lastContactedAt: l.lastContactedAt ?? undefined,
      lastContactedBy: (l.lastContactedById && staffName.get(l.lastContactedById)) || undefined,
    }));
  }

  private async activationTasks(before: Date) {
    const patients = await this.prisma.patient.findMany({
      where: { activatedAt: null, createdAt: { lt: before } },
      select: { ...PERSON, createdAt: true },
    });
    return patients.map((p) => patientTask(CxTaskKind.ACTIVATION, p, p.createdAt));
  }

  /** Activated patients who left the ID or photos unfinished, or were asked by the doctor to send a step again. */
  private async onboardingTasks(before: Date) {
    const rows = await this.prisma.onboardingSubmission.findMany({
      where: {
        patient: { activatedAt: { not: null } },
        OR: [{ status: OnboardingStatus.REJECTED }, { status: OnboardingStatus.IN_PROGRESS, updatedAt: { lt: before } }],
      },
      select: { status: true, updatedAt: true, patient: { select: PERSON } },
    });
    return rows.map((r) => ({
      ...patientTask(CxTaskKind.ONBOARDING, r.patient, r.updatedAt),
      sentBack: r.status === OnboardingStatus.REJECTED,
    }));
  }

  /** "I got in touch": takes the lead off everyone's list for a few days and records who did it. */
  async markLeadContacted(actorId: string, leadId: string) {
    await this.openLead(leadId);
    await this.prisma.$transaction(async (tx) => {
      await tx.lead.update({ where: { id: leadId }, data: { lastContactedAt: new Date(), lastContactedById: actorId } });
      await this.audit.log({ actorId, actorRole: UserRole.CLINICIAN, action: 'LEAD_CONTACTED', resourceType: 'Lead', resourceId: leadId }, tx);
    });
    return true;
  }

  /** Not interested, or asked not to be contacted: the lead never comes back to the list. */
  async stopLeadFollowUp(actorId: string, leadId: string) {
    await this.openLead(leadId);
    await this.prisma.$transaction(async (tx) => {
      await tx.lead.update({ where: { id: leadId }, data: { doNotContactAt: new Date() } });
      await this.audit.log({ actorId, actorRole: UserRole.CLINICIAN, action: 'LEAD_FOLLOW_UP_STOPPED', resourceType: 'Lead', resourceId: leadId }, tx);
    });
    return true;
  }

  private async openLead(leadId: string) {
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId }, select: { convertedAt: true } });
    if (!lead) throw new BadRequestException('Lead not found');
    if (lead.convertedAt) throw new BadRequestException('This lead has already become a patient');
  }
}

const PERSON = {
  id: true, email: true, firstName: true, lastName: true, phone: true,
  lead: { select: { productKind: true } },
} as const;

type Person = { id: string; email: string; firstName: string; lastName: string; phone: string | null; lead: { productKind: string } | null };

function patientTask(kind: CxTaskKind, p: Person, since: Date) {
  return {
    id: `${kind}:${p.id}`,
    kind,
    name: `${p.firstName} ${p.lastName}`,
    email: p.email,
    phone: p.phone ?? undefined,
    programme: (p.lead?.productKind as ConsultationKind | undefined) ?? undefined,
    since,
    patientId: p.id,
    sentBack: false,
  };
}
