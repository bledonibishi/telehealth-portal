import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/access-roles';
import { UserRole } from '../common/enums';
import { appError, ErrorCode } from '../common/errors/app-error';

export type Rating = 'GOOD' | 'BAD';

/** What the team needs to judge the assistant: how it is doing, the answers it gave, and the conversations it handed over. */
@Injectable()
export class AssistantReviewService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /** A team member says whether an answer from the assistant was right. Rating it again replaces the earlier rating. */
  async rate(user: AuthUser, messageId: string, rating: Rating, note?: string | null) {
    if (rating !== 'GOOD' && rating !== 'BAD') throw appError(ErrorCode.BAD_REQUEST, 'Rate it good or bad.');
    const message = await this.prisma.message.findUnique({ where: { id: messageId }, select: { id: true, isAi: true, patientId: true } });
    if (!message || !message.isAi) throw appError(ErrorCode.NOT_FOUND, 'That isn’t a message from the assistant.');
    const cleaned = note?.trim().slice(0, 500) || null;
    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { aiFeedback: rating, aiFeedbackNote: cleaned, aiFeedbackById: user.id, aiFeedbackAt: new Date() },
    });
    await this.audit.log({ actorId: user.id, actorRole: UserRole.CLINICIAN, action: 'ASSISTANT_ANSWER_RATED', resourceType: 'Message', resourceId: messageId, patientId: message.patientId, metadata: { rating } });
    return updated;
  }

  async review(days = 30) {
    const since = new Date(Date.now() - Math.min(Math.max(days, 1), 365) * 86_400_000);
    const answered = { isAi: true, aiArticleId: { not: null }, sentAt: { gte: since } } as const;
    const [answers, total, good, bad, handedOverCount, resolved] = await Promise.all([
      this.prisma.message.findMany({ where: answered, orderBy: { sentAt: 'desc' }, take: 100, select: { id: true, content: true, sentAt: true, aiArticleId: true, aiFeedback: true, aiFeedbackNote: true, patientId: true, consultationId: true, patient: { select: { firstName: true, lastName: true } } } }),
      this.prisma.message.count({ where: answered }),
      this.prisma.message.count({ where: { ...answered, aiFeedback: 'GOOD' } }),
      this.prisma.message.count({ where: { ...answered, aiFeedback: 'BAD' } }),
      this.prisma.supportThread.count({ where: { escalatedAt: { gte: since } } }),
      this.prisma.supportThread.count({ where: { status: 'DONE', updatedAt: { gte: since } } }),
    ]);
    const articleIds = [...new Set(answers.map((a) => a.aiArticleId).filter((x): x is string => !!x))];
    const articles = articleIds.length ? await this.prisma.supportArticle.findMany({ where: { id: { in: articleIds } }, select: { id: true, title: true } }) : [];
    const titles = new Map(articles.map((a) => [a.id, a.title]));

    const threads = await this.prisma.supportThread.findMany({ where: { escalatedAt: { gte: since } }, orderBy: { escalatedAt: 'desc' }, take: 50 });
    const patientIds = [...new Set(threads.map((t) => t.patientId))];
    const patients = patientIds.length ? await this.prisma.patient.findMany({ where: { id: { in: patientIds } }, select: { id: true, firstName: true, lastName: true } }) : [];
    const names = new Map(patients.map((p) => [p.id, `${p.firstName} ${p.lastName}`.trim()]));
    const ticketIds = threads.map((t) => t.ticketId).filter((x): x is string => !!x);
    const tickets = ticketIds.length ? await this.prisma.ticket.findMany({ where: { id: { in: ticketIds } }, select: { id: true, number: true, subject: true } }) : [];
    const ticketOf = new Map(tickets.map((t) => [t.id, t]));

    return {
      days,
      answers: total,
      ratedGood: good,
      ratedBad: bad,
      handedOver: handedOverCount,
      resolvedByAssistant: resolved,
      recentAnswers: answers.map((a) => ({
        id: a.id, content: a.content, sentAt: a.sentAt, patientName: `${a.patient.firstName} ${a.patient.lastName}`.trim(),
        articleId: a.aiArticleId ?? '', articleTitle: titles.get(a.aiArticleId ?? '') ?? a.aiArticleId ?? '', rating: a.aiFeedback ?? null, ratingNote: a.aiFeedbackNote ?? null,
      })),
      recentHandovers: threads.map((t) => ({
        id: t.id, patientId: t.patientId, patientName: names.get(t.patientId) ?? '', reason: t.escalationReason ?? '', at: t.escalatedAt as Date,
        ticketId: t.ticketId ?? null, ticketNumber: t.ticketId ? ticketOf.get(t.ticketId)?.number ?? null : null, ticketSubject: t.ticketId ? ticketOf.get(t.ticketId)?.subject ?? null : null,
      })),
    };
  }
}
