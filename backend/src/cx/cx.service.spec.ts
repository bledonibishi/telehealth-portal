import { BadRequestException } from '@nestjs/common';
import { CxService } from './cx.service';
import { CxTaskKind } from './cx.model';
import { triageEligibility } from '../questionnaires/triage';

jest.mock('../questionnaires/triage', () => ({ triageEligibility: jest.fn(() => ({ riskTag: 'GREEN', reasons: [] })) }));

const NOW = new Date('2026-10-09T12:00:00Z');
const ago = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000);
const person = (id: string) => ({ id, email: `${id}@x.com`, firstName: 'Ana', lastName: id, phone: null, lead: { productKind: 'GLP1' } });

function build(over: { newest?: any[]; messages?: any[]; patients?: any[]; leads?: any[]; onboarding?: any[]; lead?: any } = {}) {
  const tx = { lead: { update: jest.fn() } };
  const prisma = {
    message: {
      // First call: the newest message per patient. Second: every message of those still waiting.
      findMany: jest.fn().mockResolvedValueOnce(over.newest ?? []).mockResolvedValueOnce(over.messages ?? []),
    },
    patient: { findMany: jest.fn().mockResolvedValue(over.patients ?? []), count: jest.fn().mockResolvedValue(0) },
    lead: {
      findMany: jest.fn().mockResolvedValue(over.leads ?? []),
      findUnique: jest.fn().mockResolvedValue(over.lead ?? null),
      count: jest.fn().mockResolvedValue(0),
    },
    clinician: { findMany: jest.fn().mockResolvedValue([{ id: 'cx-1', firstName: 'Clara', lastName: 'Watson' }]) },
    onboardingSubmission: { findMany: jest.fn().mockResolvedValue(over.onboarding ?? []) },
    $transaction: jest.fn((fn: any) => fn(tx)),
  };
  const audit = { log: jest.fn() };
  return { svc: new CxService(prisma as any, audit as any), prisma, audit, tx };
}

describe('CxService.workQueue', () => {
  it('counts a patient as waiting since their first message nobody answered', async () => {
    const { svc, prisma } = build({
      newest: [{ patientId: 'p-1', senderRole: 'PATIENT' }, { patientId: 'p-2', senderRole: 'CLINICIAN' }],
      messages: [
        { patientId: 'p-1', senderRole: 'PATIENT', sentAt: ago(1) },
        { patientId: 'p-1', senderRole: 'PATIENT', sentAt: ago(5) },
        { patientId: 'p-1', senderRole: 'CLINICIAN', sentAt: ago(30) },
        { patientId: 'p-1', senderRole: 'PATIENT', sentAt: ago(40) },
      ],
    });
    // Only the reply lookup (by id) returns anyone; the activation list is empty.
    prisma.patient.findMany.mockImplementation(({ where }: any) => Promise.resolve(where.id ? [person('p-1')] : []));

    const { tasks } = await svc.workQueue(NOW);

    expect(tasks).toEqual([expect.objectContaining({ id: 'REPLY:p-1', kind: CxTaskKind.REPLY, patientId: 'p-1', since: ago(5) })]);
  });

  it('never offers a lead whose answers rule out treatment', async () => {
    (triageEligibility as jest.Mock).mockImplementation((_kind, answers) => ({ riskTag: answers === 'red' ? 'RED' : 'GREEN', reasons: [] }));
    const lead = (id: string, quizAnswers: any) => ({ id, email: `${id}@x.com`, firstName: 'L', lastName: id, productKind: 'GLP1', quizAnswers, createdAt: ago(48), lastContactedAt: null, lastContactedById: null });
    const { svc } = build({ leads: [lead('l-ok', []), lead('l-red', 'red')] });

    const { tasks } = await svc.workQueue(NOW);

    expect(tasks.map((t) => t.id)).toEqual(['LEAD:l-ok']);
  });

  it('asks only for unpaid, open leads inside the follow-up window that were not contacted lately', async () => {
    const { svc, prisma } = build();
    await svc.workQueue(NOW);
    expect(prisma.lead.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        convertedAt: null,
        doNotContactAt: null,
        createdAt: { gte: ago(30 * 24), lte: ago(1) },
        OR: [{ lastContactedAt: null }, { lastContactedAt: { lt: ago(72) } }],
      },
    }));
  });

  it('says who contacted a lead last and puts the longest wait first', async () => {
    const { svc } = build({
      leads: [{ id: 'l-1', email: 'l@x.com', firstName: 'L', lastName: 'One', productKind: 'HRT', quizAnswers: [], createdAt: ago(200), lastContactedAt: ago(100), lastContactedById: 'cx-1' }],
      onboarding: [{ status: 'REJECTED', updatedAt: ago(150), patient: person('p-9') }],
    });

    const { tasks } = await svc.workQueue(NOW);

    expect(tasks.map((t) => t.id)).toEqual(['ONBOARDING:p-9', 'LEAD:l-1']);
    expect(tasks[0].sentBack).toBe(true);
    expect(tasks[1]).toEqual(expect.objectContaining({ since: ago(100), lastContactedBy: 'Clara Watson' }));
  });
});

describe('CxService lead follow-up', () => {
  it('records who contacted the lead, with an audit entry in the same transaction', async () => {
    const { svc, tx, audit } = build({ lead: { convertedAt: null } });
    await svc.markLeadContacted('cx-1', 'l-1');
    expect(tx.lead.update).toHaveBeenCalledWith({ where: { id: 'l-1' }, data: { lastContactedAt: expect.any(Date), lastContactedById: 'cx-1' } });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'LEAD_CONTACTED', resourceId: 'l-1', actorId: 'cx-1' }), tx);
  });

  it('closes a lead for good', async () => {
    const { svc, tx, audit } = build({ lead: { convertedAt: null } });
    await svc.stopLeadFollowUp('cx-1', 'l-1');
    expect(tx.lead.update).toHaveBeenCalledWith({ where: { id: 'l-1' }, data: { doNotContactAt: expect.any(Date) } });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'LEAD_FOLLOW_UP_STOPPED' }), tx);
  });

  it('refuses a lead that does not exist or has already paid', async () => {
    await expect(build().svc.markLeadContacted('cx-1', 'nope')).rejects.toThrow(BadRequestException);
    await expect(build({ lead: { convertedAt: new Date() } }).svc.stopLeadFollowUp('cx-1', 'l-1')).rejects.toThrow(/already become a patient/);
  });
});
