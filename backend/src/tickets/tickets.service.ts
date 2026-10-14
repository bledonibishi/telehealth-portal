import { Injectable, Optional } from '@nestjs/common';
import { Prisma, TicketPriority, TicketStatus, TicketType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotifierService } from '../notifications/notifier.service';
import { NotificationKind } from '@telehealth/shared-types';
import { AuthUser } from '../auth/access-roles';
import { ClinicianRole, UserRole } from '../common/enums';
import { appError, ErrorCode, warning } from '../common/errors/app-error';
import { CreateTicketInput, TicketFilterInput, UpdateTicketInput } from './dto/ticket.input';
import { SupportRequestInput } from './dto/support-request.input';
import { replyDueAt } from './ticket-sla';
import { EngineeringNotifierService, type SlackResult } from './engineering-notifier.service';

const INCLUDE = {
  patient: { select: { firstName: true, lastName: true } },
  assignee: { select: { firstName: true, lastName: true } },
  notes: { orderBy: { createdAt: 'asc' as const } },
  attachments: { select: { id: true, filename: true, mimeType: true, createdAt: true }, orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.TicketInclude;

type TicketRow = Prisma.TicketGetPayload<{ include: typeof INCLUDE }>;

/** A patient can open this many requests a day; more than that is almost always a stuck button or a flood. */
export const PATIENT_DAILY_LIMIT = 5;

/** Files a patient can send with one help request. */
export const MAX_ATTACHMENTS = 3;

/** The id the automated support assistant acts under (on tickets, notes, messages and the audit log). */
export const ASSISTANT_ID = 'ai-assistant';

const CLOSED: TicketStatus[] = [TicketStatus.RESOLVED, TicketStatus.CLOSED];

/** Who may take a ticket of this type: doctors answer clinical ones, support handles the rest; admins can do either. */
const HANDLERS: Record<'clinical' | 'other', string[]> = {
  clinical: [ClinicianRole.DOCTOR, ClinicianRole.ADMIN],
  other: [ClinicianRole.CX_TEAM, ClinicianRole.ADMIN],
};

@Injectable()
export class TicketsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    @Optional() private notifier?: NotifierService,
    @Optional() private engineering?: EngineeringNotifierService,
  ) {}

  private isDoctor(user: AuthUser) {
    return user.clinicianRole === ClinicianRole.DOCTOR;
  }

  /** A doctor sees clinical tickets only; support and admins see all of them. */
  private scope(user: AuthUser): Prisma.TicketWhereInput {
    return this.isDoctor(user) ? { type: TicketType.CLINICAL } : {};
  }

  private async load(id: string, user: AuthUser): Promise<TicketRow> {
    const row = await this.prisma.ticket.findFirst({ where: { id, ...this.scope(user) }, include: INCLUDE });
    if (!row) throw appError(ErrorCode.NOT_FOUND, 'That ticket doesn’t exist, or isn’t yours to see.');
    return row;
  }

  /** Turns rows into what the API returns, naming the author of each note. */
  private async present(rows: TicketRow[]) {
    const ids = [...new Set(rows.flatMap((r) => [...r.notes.map((n) => n.authorId), ...(r.engineeringSentById ? [r.engineeringSentById] : [])]))];
    const people = ids.length ? await this.prisma.clinician.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } }) : [];
    const names = new Map(people.map((p) => [p.id, `${p.firstName} ${p.lastName}`]));
    return rows.map((r) => toModel(r, names));
  }

  async list(user: AuthUser, filter?: TicketFilterInput) {
    const rows = await this.prisma.ticket.findMany({
      where: {
        ...this.scope(user),
        ...(filter?.status ? { status: filter.status } : {}),
        ...(filter?.type ? { type: filter.type } : {}),
        ...(filter?.patientId ? { patientId: filter.patientId } : {}),
        ...(filter?.mine ? { assigneeId: user.id } : {}),
      },
      include: INCLUDE,
      // Oldest first: the one that has waited longest is at the top.
      orderBy: [{ createdAt: 'asc' }],
      take: 500,
    });
    return this.present(rows);
  }

  async get(id: string, user: AuthUser) {
    return (await this.present([await this.load(id, user)]))[0];
  }

  async create(user: AuthUser, input: CreateTicketInput) {
    const subject = input.subject.trim();
    if (subject.length < 3 || subject.length > 160) throw appError(ErrorCode.BAD_REQUEST, 'The subject needs 3 to 160 characters.');
    if ((input.description?.length ?? 0) > 4000) throw appError(ErrorCode.BAD_REQUEST, 'The description is too long (4000 characters at most).');
    if (input.patientId) {
      const patient = await this.prisma.patient.findUnique({ where: { id: input.patientId }, select: { id: true } });
      if (!patient) throw appError(ErrorCode.NOT_FOUND, 'That patient doesn’t exist.');
    }
    if (this.isDoctor(user) && input.type !== TicketType.CLINICAL) {
      throw appError(ErrorCode.FORBIDDEN, 'Doctors can open clinical tickets only.');
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.ticket.create({
        data: {
          subject,
          description: input.description?.trim() || null,
          type: input.type,
          priority: input.priority ?? 'NORMAL',
          patientId: input.patientId ?? null,
          createdById: user.id,
        },
        include: INCLUDE,
      });
      await this.audit.log(
        { actorId: user.id, actorRole: UserRole.CLINICIAN, action: 'TICKET_CREATED', resourceType: 'Ticket', resourceId: created.id, patientId: input.patientId, metadata: { number: created.number, type: input.type } },
        tx,
      );
      return created;
    });
    return (await this.present([row]))[0];
  }

  async update(user: AuthUser, input: UpdateTicketInput) {
    const ticket = await this.load(input.id, user);
    const type = input.type ?? ticket.type;
    const wasClinical = ticket.type === TicketType.CLINICAL;
    const isClinical = type === TicketType.CLINICAL;
    const isSupport = user.clinicianRole === ClinicianRole.CX_TEAM;

    // Support hands a ticket to the doctors, but cannot take it back from them or close it on their behalf.
    if (isSupport && wasClinical && input.type && !isClinical) {
      throw appError(ErrorCode.FORBIDDEN, 'Only a doctor can move a clinical ticket to another type.');
    }
    if (isSupport && isClinical && input.status && CLOSED.includes(input.status)) {
      throw appError(ErrorCode.FORBIDDEN, 'A clinical ticket is closed by a doctor.');
    }
    if (this.isDoctor(user) && input.type && input.type !== TicketType.CLINICAL) {
      throw appError(ErrorCode.FORBIDDEN, 'Doctors can’t move a ticket out of clinical.');
    }

    let assigneeId: string | null | undefined;
    if (input.assigneeId !== undefined) {
      assigneeId = input.assigneeId === '' ? null : input.assigneeId;
      if (assigneeId) {
        const who = await this.prisma.clinician.findFirst({ where: { id: assigneeId, deactivatedAt: null }, select: { role: true } });
        if (!who || !HANDLERS[isClinical ? 'clinical' : 'other'].includes(who.role)) {
          throw appError(ErrorCode.BAD_REQUEST, isClinical ? 'A clinical ticket can only be assigned to a doctor.' : 'That person doesn’t handle this kind of ticket.');
        }
      }
    }
    // Handing a ticket to the doctors drops a support assignee who can no longer work it.
    if (isClinical && !wasClinical && assigneeId === undefined && ticket.assigneeId) {
      const current = await this.prisma.clinician.findUnique({ where: { id: ticket.assigneeId }, select: { role: true } });
      if (current && !HANDLERS.clinical.includes(current.role)) assigneeId = null;
    }

    const status = input.status ?? ticket.status;
    const now = new Date();
    const data: Prisma.TicketUpdateInput = {
      ...(input.type ? { type: input.type } : {}),
      ...(input.priority ? { priority: input.priority } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(assigneeId !== undefined ? { assignee: assigneeId ? { connect: { id: assigneeId } } : { disconnect: true } } : {}),
      ...(CLOSED.includes(status) ? (ticket.resolvedAt ? {} : { resolvedAt: now }) : { resolvedAt: null }),
      // Picking it up, or answering it, is the first response.
      ...(!ticket.firstResponseAt && (input.status || assigneeId) && (status !== TicketStatus.OPEN || assigneeId) ? { firstResponseAt: now } : {}),
    };

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.ticket.update({ where: { id: ticket.id }, data, include: INCLUDE });
      await this.audit.log(
        {
          actorId: user.id, actorRole: UserRole.CLINICIAN, action: 'TICKET_UPDATED', resourceType: 'Ticket', resourceId: ticket.id, patientId: ticket.patientId ?? undefined,
          metadata: { number: ticket.number, from: { status: ticket.status, type: ticket.type, priority: ticket.priority, assigneeId: ticket.assigneeId }, to: { status, type, priority: input.priority ?? ticket.priority, assigneeId: assigneeId === undefined ? ticket.assigneeId : assigneeId } },
        },
        tx,
      );
      return updated;
    });
    // Someone gave this ticket to another person: that person hears about it.
    if (assigneeId && assigneeId !== ticket.assigneeId && assigneeId !== user.id) void this.notifyAssigned(user, row, assigneeId);
    return (await this.present([row]))[0];
  }

  private async notifyAssigned(by: AuthUser, row: TicketRow, assigneeId: string) {
    const person = await this.prisma.clinician.findUnique({ where: { id: by.id }, select: { firstName: true, lastName: true } }).catch(() => null);
    await this.notifier
      ?.toStaff({ clinicianIds: [assigneeId] }, { kind: NotificationKind.TICKET_ASSIGNED, params: { by: person ? `${person.firstName} ${person.lastName}` : 'A colleague', subject: row.subject }, href: `/tickets/${row.id}`, groupKey: `ticket-assigned:${row.id}` })
      .catch(() => undefined);
  }

  /** Whether this person may write to the patient from the ticket: not for a medical question unless they are a doctor (or an admin). */
  async assertCanReply(user: AuthUser, ticketId: string) {
    const ticket = await this.load(ticketId, user);
    if (!ticket.patientId) throw appError(ErrorCode.BAD_REQUEST, 'This ticket has no patient to reply to.');
    if (ticket.type === TicketType.CLINICAL && user.clinicianRole === ClinicianRole.CX_TEAM) {
      throw appError(ErrorCode.FORBIDDEN, 'This is a medical question. A doctor needs to answer it; please don’t reply yourself.');
    }
    return ticket;
  }

  /**
   * A person wrote to the patient from this ticket: it counts as the first reply, it now waits on the patient, and it belongs
   * to whoever answered if nobody had it.
   */
  async recordStaffReply(user: AuthUser, ticketId: string) {
    const ticket = await this.load(ticketId, user);
    const waiting = ticket.status === TicketStatus.OPEN || ticket.status === TicketStatus.IN_PROGRESS;
    await this.prisma.$transaction(async (tx) => {
      await tx.ticket.update({
        where: { id: ticket.id },
        data: {
          ...(ticket.firstResponseAt ? {} : { firstResponseAt: new Date() }),
          ...(waiting ? { status: TicketStatus.WAITING_ON_PATIENT } : {}),
          ...(ticket.assigneeId ? {} : { assignee: { connect: { id: user.id } } }),
        },
      });
      await this.audit.log({ actorId: user.id, actorRole: UserRole.CLINICIAN, action: 'TICKET_REPLIED', resourceType: 'Ticket', resourceId: ticket.id, patientId: ticket.patientId ?? undefined, metadata: { number: ticket.number } }, tx);
    });
    return this.get(ticket.id, user);
  }

  async addNote(user: AuthUser, ticketId: string, body: string) {
    const text = body.trim();
    if (!text) throw appError(ErrorCode.BAD_REQUEST, 'Write something first.');
    if (text.length > 4000) throw appError(ErrorCode.BAD_REQUEST, 'That note is too long (4000 characters at most).');
    const ticket = await this.load(ticketId, user);
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.ticketNote.create({ data: { ticketId: ticket.id, authorId: user.id, body: text } });
      const updated = await tx.ticket.update({
        where: { id: ticket.id },
        data: { ...(ticket.firstResponseAt ? {} : { firstResponseAt: new Date() }) },
        include: INCLUDE,
      });
      await this.audit.log(
        { actorId: user.id, actorRole: UserRole.CLINICIAN, action: 'TICKET_NOTE_ADDED', resourceType: 'Ticket', resourceId: ticket.id, patientId: ticket.patientId ?? undefined, metadata: { number: ticket.number } },
        tx,
      );
      return updated;
    });
    return (await this.present([row]))[0];
  }

  /** A patient asks for help from their own app. A medical question is routed to the doctors and made High priority. */
  async openAsPatient(patientId: string, input: SupportRequestInput) {
    const subject = input.subject.trim();
    if (subject.length < 3 || subject.length > 160) throw appError(ErrorCode.BAD_REQUEST, 'Please sum up your question in a few words (3 to 160 characters).');
    const description = input.description?.trim() ?? '';
    if (description.length > 4000) throw appError(ErrorCode.BAD_REQUEST, 'That message is too long. Please keep it under 4000 characters.');

    const since = new Date(Date.now() - 24 * 3_600_000);
    const recent = await this.prisma.ticket.count({ where: { patientId, createdById: patientId, createdAt: { gte: since } } });
    if (recent >= PATIENT_DAILY_LIMIT) throw warning('You’ve sent a few requests today already. We’ll get back to you on those first.', ErrorCode.RATE_LIMITED);

    const patient = await this.prisma.patient.findUnique({ where: { id: patientId }, select: { firstName: true, lastName: true } });
    if (!patient) throw appError(ErrorCode.NOT_FOUND, 'We couldn’t find your account.');

    // Only the patient's own files that were uploaded for this purpose and have not been sent yet.
    const attachmentIds = [...new Set(input.attachmentIds ?? [])];
    if (attachmentIds.length > MAX_ATTACHMENTS) throw appError(ErrorCode.BAD_REQUEST, `You can attach up to ${MAX_ATTACHMENTS} files.`);
    if (attachmentIds.length) {
      const own = await this.prisma.uploadedFile.count({ where: { id: { in: attachmentIds }, patientId, kind: 'SUPPORT_ATTACHMENT', ticketId: null, messageId: null } });
      if (own !== attachmentIds.length) throw appError(ErrorCode.BAD_REQUEST, 'One of the files could not be attached. Please add it again.');
    }

    const clinical = input.type === TicketType.CLINICAL;
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.ticket.create({
        data: { subject, description: description || null, type: input.type, priority: clinical ? 'HIGH' : 'NORMAL', patientId, createdById: patientId },
        include: INCLUDE,
      });
      if (attachmentIds.length) {
        await tx.uploadedFile.updateMany({ where: { id: { in: attachmentIds }, patientId, kind: 'SUPPORT_ATTACHMENT', ticketId: null, messageId: null }, data: { ticketId: created.id } });
        created.attachments = await tx.uploadedFile.findMany({ where: { ticketId: created.id }, select: { id: true, filename: true, mimeType: true, createdAt: true }, orderBy: { createdAt: 'asc' } });
      }
      await this.audit.log(
        { actorId: patientId, actorRole: UserRole.PATIENT, action: 'TICKET_OPENED_BY_PATIENT', resourceType: 'Ticket', resourceId: created.id, patientId, metadata: { number: created.number, type: input.type, attachments: attachmentIds.length } },
        tx,
      );
      return created;
    });

    // Telling the team is best-effort: the request is saved either way.
    await this.notifier
      ?.toStaff(
        { roles: [clinical ? ClinicianRole.DOCTOR : ClinicianRole.CX_TEAM] },
        { kind: NotificationKind.TICKET_OPENED, params: { patient: `${patient.firstName} ${patient.lastName ?? ''}`.trim(), subject }, href: '/tickets', groupKey: `ticket:${row.id}`, email: clinical },
      )
      .catch(() => undefined);
    return toPatientModel(row);
  }

  /** The automated assistant starts a ticket for a conversation it is handling. Nobody is told until it needs a person. */
  async openForAssistant(patientId: string, input: { type: TicketType; subject: string; priority?: TicketPriority; note?: string }) {
    const subject = input.subject.trim().slice(0, 160) || 'Support question';
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.ticket.create({
        data: {
          subject: subject.length < 3 ? 'Support question' : subject, type: input.type, priority: input.priority ?? 'NORMAL', patientId, createdById: ASSISTANT_ID, status: 'IN_PROGRESS', firstResponseAt: new Date(),
          ...(input.note ? { notes: { create: { authorId: ASSISTANT_ID, body: input.note.slice(0, 4000) } } } : {}),
        },
        include: INCLUDE,
      });
      await this.audit.log({ actorId: ASSISTANT_ID, actorRole: UserRole.CLINICIAN, action: 'TICKET_OPENED_BY_ASSISTANT', resourceType: 'Ticket', resourceId: created.id, patientId, metadata: { number: created.number, type: input.type } }, tx);
      return created;
    });
    return row.id;
  }

  /** The assistant moves its own ticket along, with a note on what it did. */
  async assistantUpdate(ticketId: string, patch: { status?: TicketStatus; type?: TicketType; priority?: TicketPriority; note?: string }) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId }, select: { id: true, number: true, patientId: true, status: true, resolvedAt: true } });
    if (!ticket) return;
    const status = patch.status ?? ticket.status;
    await this.prisma.$transaction(async (tx) => {
      await tx.ticket.update({
        where: { id: ticketId },
        data: {
          ...(patch.type ? { type: patch.type } : {}), ...(patch.priority ? { priority: patch.priority } : {}), ...(patch.status ? { status: patch.status } : {}),
          ...(CLOSED.includes(status) ? (ticket.resolvedAt ? {} : { resolvedAt: new Date() }) : { resolvedAt: null }),
          ...(patch.note ? { notes: { create: { authorId: ASSISTANT_ID, body: patch.note.slice(0, 4000) } } } : {}),
        },
      });
      await this.audit.log({ actorId: ASSISTANT_ID, actorRole: UserRole.CLINICIAN, action: 'TICKET_UPDATED_BY_ASSISTANT', resourceType: 'Ticket', resourceId: ticketId, patientId: ticket.patientId ?? undefined, metadata: { number: ticket.number, status, type: patch.type } }, tx);
    });
  }

  /** Tells the right team a ticket needs a person: doctors for a clinical one, support for the rest. Never throws. */
  async notifyStaffAbout(ticketId: string) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId }, include: { patient: { select: { firstName: true, lastName: true } } } });
    if (!ticket) return;
    const clinical = ticket.type === TicketType.CLINICAL;
    await this.notifier
      ?.toStaff(
        { roles: [clinical ? ClinicianRole.DOCTOR : ClinicianRole.CX_TEAM] },
        { kind: NotificationKind.TICKET_OPENED, params: { patient: ticket.patient ? `${ticket.patient.firstName} ${ticket.patient.lastName ?? ''}`.trim() : '', subject: ticket.subject }, href: '/tickets', groupKey: `ticket:${ticket.id}`, email: clinical },
      )
      .catch(() => undefined);
  }

  /**
   * Support passes a ticket to the engineers: it is marked, a note is left on it, and the engineers are told in Slack. The
   * Slack message holds only what support wrote, the ticket number and a link (no patient details). If Slack can't be
   * reached the ticket is still marked, and the result says so.
   */
  async sendToEngineering(user: AuthUser, ticketId: string, note: string): Promise<{ ticket: Awaited<ReturnType<TicketsService['get']>>; slack: SlackResult }> {
    const text = note.trim();
    if (text.length < 10) throw appError(ErrorCode.BAD_REQUEST, 'Tell the engineers what is wrong, in a sentence or two (at least 10 characters).');
    if (text.length > 1500) throw appError(ErrorCode.BAD_REQUEST, 'That is too long (1500 characters at most).');
    const ticket = await this.load(ticketId, user);
    if (ticket.engineeringSentAt && !ticket.engineeringDoneAt) throw warning('This ticket is already with the engineers.', ErrorCode.CONFLICT);

    await this.prisma.$transaction(async (tx) => {
      await tx.ticket.update({
        where: { id: ticket.id },
        data: {
          engineeringSentAt: new Date(), engineeringSentById: user.id, engineeringNote: text, engineeringDoneAt: null,
          notes: { create: { authorId: user.id, body: `Passed to the engineers:\n${text}` } },
        },
      });
      await this.audit.log({ actorId: user.id, actorRole: UserRole.CLINICIAN, action: 'TICKET_SENT_TO_ENGINEERING', resourceType: 'Ticket', resourceId: ticket.id, patientId: ticket.patientId ?? undefined, metadata: { number: ticket.number } }, tx);
    });

    const base = (process.env.CLINICIAN_APP_URL ?? 'http://localhost:3002').replace(/\/$/, '');
    const slack = (await this.engineering?.post(`:bug: *Ticket #${ticket.number}* passed to engineering (${ticket.priority.toLowerCase()} priority)\n${text}\n${base}/tickets/${ticket.id}`)) ?? 'NOT_CONFIGURED';
    return { ticket: await this.get(ticket.id, user), slack };
  }

  /** The engineers are done with it: the mark comes off, and support can tell the patient. */
  async finishEngineering(user: AuthUser, ticketId: string) {
    const ticket = await this.load(ticketId, user);
    if (!ticket.engineeringSentAt || ticket.engineeringDoneAt) throw warning('This ticket is not with the engineers.', ErrorCode.CONFLICT);
    await this.prisma.$transaction(async (tx) => {
      await tx.ticket.update({ where: { id: ticket.id }, data: { engineeringDoneAt: new Date(), notes: { create: { authorId: user.id, body: 'The engineers are done with this.' } } } });
      await this.audit.log({ actorId: user.id, actorRole: UserRole.CLINICIAN, action: 'TICKET_BACK_FROM_ENGINEERING', resourceType: 'Ticket', resourceId: ticket.id, patientId: ticket.patientId ?? undefined, metadata: { number: ticket.number } }, tx);
    });
    return this.get(ticket.id, user);
  }

  /** What the patient sees of their own requests: no internal notes, no assignee. */
  async listForPatient(patientId: string) {
    const rows = await this.prisma.ticket.findMany({ where: { patientId }, include: INCLUDE, orderBy: { createdAt: 'desc' }, take: 50 });
    return rows.map(toPatientModel);
  }

  /** The staff who can be given tickets of each kind, for the "assign to" list. */
  async handlers(user: AuthUser, clinical: boolean) {
    if (this.isDoctor(user) && !clinical) return [];
    const rows = await this.prisma.clinician.findMany({
      where: { deactivatedAt: null, role: { in: HANDLERS[clinical ? 'clinical' : 'other'] as ClinicianRole[] } },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { firstName: 'asc' },
    });
    return rows.map((r) => ({ id: r.id, name: `${r.firstName} ${r.lastName}` }));
  }
}

function toModel(row: TicketRow, names: Map<string, string>) {
  return {
    id: row.id,
    number: row.number,
    type: row.type,
    status: row.status,
    priority: row.priority,
    subject: row.subject,
    description: row.description ?? undefined,
    patientId: row.patientId ?? undefined,
    patientName: row.patient ? `${row.patient.firstName} ${row.patient.lastName}` : undefined,
    assigneeId: row.assigneeId ?? undefined,
    assigneeName: row.assignee ? `${row.assignee.firstName} ${row.assignee.lastName}` : undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    firstResponseAt: row.firstResponseAt ?? undefined,
    replyDueAt: replyDueAt(row) ?? undefined,
    resolvedAt: row.resolvedAt ?? undefined,
    engineeringSentAt: row.engineeringSentAt ?? undefined,
    engineeringSentByName: row.engineeringSentById ? names.get(row.engineeringSentById) ?? 'A colleague' : undefined,
    engineeringNote: row.engineeringNote ?? undefined,
    engineeringDoneAt: row.engineeringDoneAt ?? undefined,
    attachments: row.attachments.map((a) => ({ id: a.id, filename: a.filename, mimeType: a.mimeType, createdAt: a.createdAt })),
    notes: row.notes.map((n) => ({ id: n.id, authorName: names.get(n.authorId) ?? (n.authorId === ASSISTANT_ID ? 'Automated assistant' : 'Former team member'), body: n.body, createdAt: n.createdAt })),
  };
}

function toPatientModel(row: TicketRow) {
  return { id: row.id, number: row.number, type: row.type, status: row.status, subject: row.subject, description: row.description ?? undefined, createdAt: row.createdAt, resolvedAt: row.resolvedAt ?? undefined, attachments: row.attachments.map((a) => ({ id: a.id, filename: a.filename, mimeType: a.mimeType, createdAt: a.createdAt })) };
}
