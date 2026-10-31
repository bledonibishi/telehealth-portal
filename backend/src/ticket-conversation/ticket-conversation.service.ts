import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MessagingService } from '../messaging/messaging.service';
import { TicketsService } from '../tickets/tickets.service';
import { AuthUser } from '../auth/access-roles';
import { UserRole } from '../common/enums';
import { appError, ErrorCode } from '../common/errors/app-error';

const LIMIT = 200;
/** Reading a patient's messages is recorded, but the screen refreshes every few seconds: once per this long per reader and ticket. */
const AUDIT_EVERY_MS = 10 * 60_000;

@Injectable()
export class TicketConversationService {
  private readonly logger = new Logger(TicketConversationService.name);
  private lastAudited = new Map<string, number>();

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private messaging: MessagingService,
    private tickets: TicketsService,
  ) {}

  /** The patient's whole conversation with the care team, oldest first, for the person working this ticket. */
  async conversation(user: AuthUser, ticketId: string) {
    const ticket = await this.tickets.get(ticketId, user); // refuses a ticket this person may not see
    if (!ticket.patientId) return [];
    await this.noteRead(user, ticket.id, ticket.patientId);
    const rows = await this.prisma.message.findMany({ where: { patientId: ticket.patientId }, orderBy: { sentAt: 'desc' }, take: LIMIT });
    return rows.reverse();
  }

  /** Writes to the patient from the ticket, as the person signed in, and updates the ticket. */
  async reply(user: AuthUser, ticketId: string, content: string) {
    const text = content.trim();
    if (!text) throw appError(ErrorCode.BAD_REQUEST, 'Write something first.');
    if (text.length > 2000) throw appError(ErrorCode.BAD_REQUEST, 'That message is too long (2000 characters at most).');
    const ticket = await this.tickets.assertCanReply(user, ticketId);
    // The reply goes into the conversation this ticket came from, not whichever chat the patient has opened since.
    const thread = await this.prisma.supportThread.findFirst({ where: { ticketId }, select: { patientId: true, consultationId: true } });
    const message = thread
      ? await this.messaging.sendToThread(user, thread, text)
      : await this.messaging.sendAs(user, { patientId: ticket.patientId!, content: text } as any);
    // The patient has the message now, and that can't be undone: from here the reply has succeeded. Failing the request
    // would tell the doctor nothing was sent, and a retry would send the same answer twice. So recording it on the ticket
    // (first reply, waiting on the patient, assignee) is tried twice and, if it still fails, logged, never thrown.
    return { message, ticket: await this.recordReply(user, ticketId) };
  }

  private async recordReply(user: AuthUser, ticketId: string) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        return await this.tickets.recordStaffReply(user, ticketId);
      } catch (err) {
        this.logger.error(`Reply sent on ticket ${ticketId}, but recording it failed (attempt ${attempt}): ${(err as Error)?.message}`);
      }
    }
    return this.tickets.get(ticketId, user).catch(() => null);
  }

  private async noteRead(user: AuthUser, ticketId: string, patientId: string) {
    const key = `${user.id}:${ticketId}`;
    const last = this.lastAudited.get(key) ?? 0;
    if (Date.now() - last < AUDIT_EVERY_MS) return;
    this.lastAudited.set(key, Date.now());
    await this.audit.log({ actorId: user.id, actorRole: UserRole.CLINICIAN, action: 'MESSAGES_VIEWED_FROM_TICKET', resourceType: 'Ticket', resourceId: ticketId, patientId });
  }
}
