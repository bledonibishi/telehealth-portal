import { CheckInReviewService } from './check-in-review.service';
import { planFor } from '../stripe/plan-pricing';

const PATIENT = { id: 'p-1', email: 'p@example.com', firstName: 'Tia', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' };
const RX = { id: 'rx-1', status: 'ACTIVE' };
const CHECK_IN = { id: 'ci-1', status: 'COMPLETED', reviewedAt: null, kind: 'GLP1', answers: [], patient: PATIENT, prescription: RX };

describe('CheckInReviewService.review', () => {
  let prisma: any;
  let billing: Record<string, jest.Mock>;
  let orders: { createRepeat: jest.Mock };
  let prescribing: Record<string, jest.Mock>;
  let prescriptions: { cancel: jest.Mock };
  let config: { get: jest.Mock };
  let service: CheckInReviewService;

  beforeEach(() => {
    prisma = {
      checkIn: {
        findUnique: jest.fn().mockResolvedValue(CHECK_IN),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...CHECK_IN, ...data })),
      },
      consultation: { findFirst: jest.fn().mockResolvedValue({ id: 'c-1', quizAnswers: [{ questionId: 'has_uterus', answer: 'No', value: 'no' }] }) },
      order: { findFirst: jest.fn().mockResolvedValue({ id: 'o-new' }) },
      prescriptionItem: {
        findMany: jest.fn().mockResolvedValue([{ product: { category: 'GLP1' }, strength: { titrationStep: 3 } }]),
      },
      $transaction: jest.fn((fn: (tx: any) => unknown) => fn(prisma)),
    };
    billing = {
      resume: jest.fn().mockResolvedValue('Billing active'),
      pause: jest.fn().mockResolvedValue('Billing paused'),
      cancelAtPeriodEnd: jest.fn().mockResolvedValue('Subscription cancels at the end of the current period'),
      changePrice: jest.fn().mockResolvedValue('Plan changed to price_adv from the next billing cycle'),
    };
    orders = { createRepeat: jest.fn().mockResolvedValue({ id: 'o-2' }) };
    prescribing = {
      assertCanPrescribe: jest.fn(),
      assertIdentityVerified: jest.fn(),
      issue: jest.fn().mockResolvedValue({ id: 'rx-2' }),
    };
    prescriptions = { cancel: jest.fn() };
    config = { get: jest.fn((key: string) => (key === 'STRIPE_PRICE_GLP1_ADVANCED' ? 'price_adv' : undefined)) };
    service = new CheckInReviewService(
      prisma,
      { log: jest.fn() } as any,
      billing as any,
      { sendConsultationUpdateEmail: jest.fn() } as any,
      { send: jest.fn() } as any,
      orders as any,
      prescribing as any,
      prescriptions as any,
      config as any,
    );
  });

  const saved = () => prisma.checkIn.update.mock.calls[0][0].data;

  it('REPEAT queues the next supply and makes sure billing is running', async () => {
    await service.review('doc-1', { checkInId: 'ci-1', outcome: 'REPEAT' as any });
    expect(orders.createRepeat).toHaveBeenCalledWith('doc-1', 'rx-1');
    expect(billing.resume).toHaveBeenCalledWith(PATIENT);
    expect(saved()).toMatchObject({ outcome: 'REPEAT', reviewedById: 'doc-1', resultOrderId: 'o-2', billingNote: 'Billing active' });
  });

  it('NEW_PRESCRIPTION supersedes the current prescription and moves to the matching plan', async () => {
    const items = [{ productId: 'sema', strengthId: 'step3', quantity: 1, directions: 'Weekly' }];
    await service.review('doc-1', { checkInId: 'ci-1', outcome: 'NEW_PRESCRIPTION' as any, items });

    expect(prescribing.assertCanPrescribe).toHaveBeenCalledWith('doc-1');
    expect(prescribing.issue).toHaveBeenCalledWith(
      expect.objectContaining({
        patientId: 'p-1',
        supersedesId: 'rx-1',
        items,
        kind: 'GLP1',
        answers: expect.arrayContaining([expect.objectContaining({ questionId: 'has_uterus' })]),
      }),
      prisma,
    );
    expect(billing.changePrice).toHaveBeenCalledWith(PATIENT, 'price_adv');
    expect(saved()).toMatchObject({ resultPrescriptionId: 'rx-2', resultOrderId: 'o-new' });
  });

  it('HOLD pauses billing without ordering anything', async () => {
    await service.review('doc-1', { checkInId: 'ci-1', outcome: 'HOLD' as any });
    expect(billing.pause).toHaveBeenCalled();
    expect(orders.createRepeat).not.toHaveBeenCalled();
    expect(saved()).toMatchObject({ outcome: 'HOLD', billingNote: 'Billing paused' });
  });

  it('STOP cancels the prescription and ends the subscription at period end', async () => {
    await service.review('doc-1', { checkInId: 'ci-1', outcome: 'STOP' as any, note: 'Pregnant' });
    expect(prescriptions.cancel).toHaveBeenCalledWith('doc-1', 'rx-1', 'Pregnant');
    expect(billing.cancelAtPeriodEnd).toHaveBeenCalled();
  });

  it('refuses a check-in that was already reviewed', async () => {
    prisma.checkIn.findUnique.mockResolvedValue({ ...CHECK_IN, reviewedAt: new Date() });
    await expect(service.review('doc-1', { checkInId: 'ci-1', outcome: 'REPEAT' as any })).rejects.toThrow(/already been reviewed/);
  });
});

describe('CheckInReviewService.queue', () => {
  it('orders critical first, then warning, then unflagged, keeping completedAt order within each group', async () => {
    const prisma = {
      checkIn: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'unflagged-1', redFlags: [] },
          { id: 'warning-1', redFlags: [{ severity: 'WARNING', description: 'Titration step-up with severe side effects' }] },
          { id: 'unflagged-2', redFlags: [] },
          { id: 'critical-1', redFlags: [{ severity: 'CRITICAL', description: 'Possible pancreatitis' }] },
        ]),
      },
    };
    const service = new CheckInReviewService(prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);

    const queue = await service.queue();

    expect(queue.map((c: any) => c.id)).toEqual(['critical-1', 'warning-1', 'unflagged-1', 'unflagged-2']);
  });
});

describe('planFor', () => {
  it('maps GLP-1 titration steps and HRT combinations to the website plans', () => {
    expect(planFor('GLP1', [{ category: 'GLP1', titrationStep: 1 }])).toBe('GLP1_STARTER');
    expect(planFor('GLP1', [{ category: 'GLP1', titrationStep: 2 }])).toBe('GLP1_STARTER');
    expect(planFor('GLP1', [{ category: 'GLP1', titrationStep: 3 }])).toBe('GLP1_ADVANCED');
    expect(planFor('HRT', [{ category: 'ESTROGEN', titrationStep: null }])).toBe('HRT_STARTER');
    expect(planFor('HRT', [{ category: 'ESTROGEN', titrationStep: null }, { category: 'PROGESTOGEN', titrationStep: null }])).toBe('HRT_COMPLETE');
    expect(planFor('TRT', [{ category: 'TESTOSTERONE', titrationStep: null }])).toBe('TRT_STANDARD');
  });
});
