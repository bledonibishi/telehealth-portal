import { TicketPriority, TicketStatus } from '@prisma/client';

/**
 * How long a ticket may wait for its first reply, by priority. These are working targets the team can change here; they are
 * not a promise to patients.
 */
export const REPLY_TARGET_HOURS: Record<TicketPriority, number> = { URGENT: 1, HIGH: 4, NORMAL: 24, LOW: 48 };

const FINISHED: TicketStatus[] = [TicketStatus.RESOLVED, TicketStatus.CLOSED];

/** When the first reply is due: never once someone has replied, or for a ticket that is already finished. */
export function replyDueAt(ticket: { createdAt: Date; priority: TicketPriority; status: TicketStatus; firstResponseAt: Date | null }): Date | null {
  if (ticket.firstResponseAt || FINISHED.includes(ticket.status)) return null;
  return new Date(ticket.createdAt.getTime() + REPLY_TARGET_HOURS[ticket.priority] * 3_600_000);
}
