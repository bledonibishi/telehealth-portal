import { AssistantReviewService } from './assistant-review.service';

const cx = { id: 'cx-1', email: 'cx@x.com', role: 'CLINICIAN', clinicianRole: 'CX_TEAM' } as any;

function setup() {
  const prisma: any = {
    message: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({ id: 'm-1' }), findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    supportThread: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    supportArticle: { findMany: jest.fn().mockResolvedValue([]) },
    patient: { findMany: jest.fn().mockResolvedValue([]) },
    ticket: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  return { service: new AssistantReviewService(prisma, audit as any), prisma, audit };
}

describe('AssistantReviewService.rate', () => {
  it('rates an assistant answer and records who did', async () => {
    const { service, prisma, audit } = setup();
    prisma.message.findUnique.mockResolvedValue({ id: 'm-1', isAi: true, patientId: 'p-1' });
    await service.rate(cx, 'm-1', 'BAD', '  It promised a refund  ');
    expect(prisma.message.update.mock.calls[0][0].data).toMatchObject({ aiFeedback: 'BAD', aiFeedbackNote: 'It promised a refund', aiFeedbackById: 'cx-1' });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'ASSISTANT_ANSWER_RATED', metadata: { rating: 'BAD' } }));
  });

  it('refuses to rate a message that is not from the assistant, or with a rating that is neither good nor bad', async () => {
    const { service, prisma } = setup();
    prisma.message.findUnique.mockResolvedValue({ id: 'm-1', isAi: false, patientId: 'p-1' });
    await expect(service.rate(cx, 'm-1', 'GOOD')).rejects.toThrow(/isn’t a message from the assistant/i);
    await expect(service.rate(cx, 'm-1', 'MEH' as any)).rejects.toThrow(/good or bad/i);
  });
});

describe('AssistantReviewService.review', () => {
  it('counts answers, ratings, handovers and solved conversations for the period', async () => {
    const { service, prisma } = setup();
    prisma.message.count.mockImplementation(({ where }: any) => Promise.resolve(where.aiFeedback === 'GOOD' ? 6 : where.aiFeedback === 'BAD' ? 2 : 10));
    prisma.supportThread.count.mockImplementation(({ where }: any) => Promise.resolve(where.status === 'DONE' ? 4 : 3));
    const r = await service.review(7);
    expect(r).toMatchObject({ days: 7, answers: 10, ratedGood: 6, ratedBad: 2, handedOver: 3, resolvedByAssistant: 4 });
  });

  it('lists the handovers with the reason, the patient and the ticket', async () => {
    const { service, prisma } = setup();
    prisma.supportThread.findMany.mockResolvedValue([{ id: 't-1', patientId: 'p-1', ticketId: 'tk-1', escalationReason: 'No help article covers this question.', escalatedAt: new Date() }]);
    prisma.patient.findMany.mockResolvedValue([{ id: 'p-1', firstName: 'Pat', lastName: 'Lee' }]);
    prisma.ticket.findMany.mockResolvedValue([{ id: 'tk-1', number: 61, subject: 'Refund' }]);
    const r = await service.review();
    expect(r.recentHandovers[0]).toMatchObject({ patientName: 'Pat Lee', reason: 'No help article covers this question.', ticketNumber: 61 });
  });

  it('names the article behind each answer', async () => {
    const { service, prisma } = setup();
    prisma.message.findMany.mockResolvedValue([{ id: 'm-1', content: 'Open Settings', sentAt: new Date(), aiArticleId: 'manage-subscription', aiFeedback: 'GOOD', aiFeedbackNote: null, patientId: 'p-1', consultationId: null, patient: { firstName: 'A', lastName: 'B' } }]);
    prisma.supportArticle.findMany.mockResolvedValue([{ id: 'manage-subscription', title: 'Card, invoices…' }]);
    const r = await service.review();
    expect(r.recentAnswers[0]).toMatchObject({ articleTitle: 'Card, invoices…', rating: 'GOOD' });
  });
});
