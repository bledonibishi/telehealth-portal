import { NotFoundException } from '@nestjs/common';
import { changeText, decisionOf, weekLabelFor, weightFacts } from './check-in-report';
import { CheckInReportService } from './check-in-report.service';

describe('weekLabelFor', () => {
  it('labels the check-ins weeks 4, 8, 12', () => {
    expect([1, 2, 3].map(weekLabelFor)).toEqual(['Week 4', 'Week 8', 'Week 12']);
  });
});

describe('weightFacts', () => {
  it('works out the change since the last check-in and since the start', () => {
    expect(weightFacts(92.6, 95, 100)).toEqual({ currentKg: 92.6, previousKg: 95, changeKg: -2.4, changePct: -2.5, startingKg: 100, lostSinceStartKg: 7.4 });
  });

  it('has no change at the first check-in', () => {
    expect(weightFacts(97, null, 100)).toMatchObject({ changeKg: null, changePct: null, lostSinceStartKg: 3 });
  });

  it('copes with a missing weight or start', () => {
    expect(weightFacts(null, 95, null)).toMatchObject({ changeKg: null, lostSinceStartKg: null });
  });
});

describe('changeText', () => {
  it('shows direction, size and percentage', () => {
    expect(changeText(-2.4, -2.5)).toBe('−2.4 kg (−2.5%)');
    expect(changeText(0.5, 0.5)).toBe('+0.5 kg (+0.5%)');
    expect(changeText(0, 0)).toBe('no change');
    expect(changeText(null, null)).toBe('—');
  });
});

describe('decisionOf', () => {
  const current = { medication: 'Semaglutide', dosage: '0.25 mg weekly', items: [{ label: 'Semaglutide (Wegovy) 0.25 mg', directions: 'Inject once a week.' }] };
  const stepUp = { medication: 'Semaglutide', dosage: '0.5 mg weekly', items: [{ label: 'Semaglutide (Wegovy) 0.5 mg', directions: 'Inject 0.5 mg once a week.' }] };

  it('says the dose continues for a repeat', () => {
    expect(decisionOf('REPEAT', current, null)).toMatchObject({ title: 'Continue on Semaglutide (Wegovy) 0.25 mg' });
  });

  it('names the new approved dose and how to take it', () => {
    expect(decisionOf('NEW_PRESCRIPTION', current, stepUp)).toEqual({ title: 'New dose approved: Semaglutide (Wegovy) 0.5 mg', detail: 'Inject 0.5 mg once a week.' });
  });

  it('falls back to the free-text summary of an older prescription', () => {
    expect(decisionOf('REPEAT', { medication: 'Wegovy', dosage: '1 mg', items: [] }, null).title).toBe('Continue on Wegovy 1 mg');
  });

  it('explains a hold and a stop', () => {
    expect(decisionOf('HOLD', current, null).title).toBe('No supply this cycle');
    expect(decisionOf('STOP', current, null).title).toBe('Treatment stopped');
  });
});

describe('CheckInReportService', () => {
  const product = { name: 'Semaglutide', brandName: 'Wegovy' };
  const rx = (label: string, directions: string) => ({ medication: 'Semaglutide', dosage: label, items: [{ directions, product, strength: { label } }] });
  const checkIn = (over: object = {}) => ({
    id: 'ci-2', patientId: 'p-1', status: 'COMPLETED', kind: 'GLP1', outcome: 'NEW_PRESCRIPTION',
    completedAt: new Date('2026-11-05T10:00:00Z'), reviewedAt: new Date('2026-11-06T09:00:00Z'), weightKg: '92.6',
    patientNote: ' Well done — we are stepping up. ', reviewNote: 'INTERNAL: watch GI tolerance', resultPrescriptionId: 'rx-2',
    patient: { firstName: 'Mason', lastName: 'Brown' }, reviewedBy: { firstName: 'Arta', lastName: 'Hoxha' }, prescription: rx('0.25 mg', 'Inject once a week.'),
    ...over,
  });
  let prisma: any;
  let service: CheckInReportService;

  beforeEach(() => {
    prisma = {
      checkIn: { findUnique: jest.fn().mockResolvedValue(checkIn()), findMany: jest.fn() },
      weightGoal: { findUnique: jest.fn().mockResolvedValue({ startingWeightKg: '100' }) },
      prescription: { findUnique: jest.fn().mockResolvedValue(rx('0.5 mg', 'Inject 0.5 mg once a week.')) },
    };
    prisma.checkIn.findMany.mockResolvedValue([{ id: 'ci-1', weightKg: '95.0' }, { id: 'ci-2', weightKg: '92.6' }]);
    service = new CheckInReportService(prisma, { get: (_k: string, d: string) => d } as any);
  });

  it('builds the report from the records: week, weight change, new dose and the patient-facing note', async () => {
    const data = await service.build(await service.load('ci-2'));
    expect(data).toMatchObject({
      patientName: 'Mason Brown', weekLabel: 'Week 8', clinicianName: 'Dr. Arta Hoxha',
      weight: { currentKg: 92.6, previousKg: 95, changeKg: -2.4, lostSinceStartKg: 7.4 },
      decision: { title: 'New dose approved: Semaglutide (Wegovy) 0.5 mg' },
      doctorNote: 'Well done — we are stepping up.',
    });
  });

  it('never carries the internal clinical note', async () => {
    const data = await service.build(await service.load('ci-2'));
    expect(JSON.stringify(data)).not.toContain('INTERNAL');
  });

  it('renders a PDF', async () => {
    const pdf = await service.render(await service.build(await service.load('ci-2')));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it.each([
    ['not reviewed yet', { reviewedAt: null }],
    ['not completed', { status: 'SENT' }],
    ['not a weight-management check-in', { kind: 'HRT' }],
  ])('has no report for a check-in that is %s', async (_n, over) => {
    prisma.checkIn.findUnique.mockResolvedValue(checkIn(over));
    await expect(service.load('ci-2')).rejects.toThrow(NotFoundException);
  });

  it('lists reviewed GLP-1 check-ins newest first, numbering them by order', async () => {
    prisma.checkIn.findMany.mockResolvedValue([
      { id: 'ci-1', completedAt: new Date('2026-10-05'), reviewedAt: new Date('2026-10-06'), outcome: 'REPEAT', kind: 'GLP1' },
      { id: 'ci-2', completedAt: new Date('2026-11-05'), reviewedAt: new Date('2026-11-06'), outcome: 'NEW_PRESCRIPTION', kind: 'GLP1' },
      { id: 'ci-3', completedAt: new Date('2026-12-03'), reviewedAt: null, outcome: null, kind: 'GLP1' },
    ]);
    const list = await service.listFor('p-1');
    expect(list.map((r) => [r.id, r.weekLabel, r.reportUrl])).toEqual([
      ['ci-2', 'Week 8', '/check-ins/ci-2/report'],
      ['ci-1', 'Week 4', '/check-ins/ci-1/report'],
    ]);
  });
});
