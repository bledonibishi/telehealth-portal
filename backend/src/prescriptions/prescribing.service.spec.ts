import { ForbiddenException } from '@nestjs/common';
import { PrescribingService, hashPrescription } from './prescribing.service';

const makeRx = (): any => ({
  id: 'rx-1',
  issuedAt: new Date('2026-09-29T10:00:00Z'),
  validUntil: new Date('2027-03-28T10:00:00Z'),
  refillsAllowed: 2,
  instructions: 'Two pumps daily',
  patient: { id: 'p-1', firstName: 'Emma', lastName: 'White', dateOfBirth: new Date('1978-04-14T00:00:00Z') },
  prescriber: { id: 'd-1', firstName: 'David', lastName: 'Chen', licenseNumber: 'KS-1', licensingBody: 'KCP' },
  items: [
    {
      quantity: 1,
      directions: 'Two pumps daily',
      product: { name: 'Estradiol gel 0.06%', brandName: 'Oestrogel' },
      strength: { label: '0.75 mg per pump' },
    },
  ],
});
const RX = makeRx();

describe('hashPrescription', () => {
  it('is stable for the same content', () => {
    expect(hashPrescription(RX)).toBe(hashPrescription(makeRx()));
    expect(hashPrescription(RX)).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    ['quantity', (rx: any) => (rx.items[0].quantity = 2)],
    ['strength', (rx: any) => (rx.items[0].strength.label = '1.5 mg per pump')],
    ['directions', (rx: any) => (rx.items[0].directions = 'Four pumps daily')],
    ['repeats', (rx: any) => (rx.refillsAllowed = 5)],
    ['validity', (rx: any) => (rx.validUntil = new Date('2028-01-01'))],
    ['prescriber licence', (rx: any) => (rx.prescriber.licenseNumber = 'KS-2')],
    ['patient', (rx: any) => (rx.patient.lastName = 'Black')],
  ])('changes when the %s changes', (_field, mutate) => {
    const altered = makeRx();
    mutate(altered);
    expect(hashPrescription(altered)).not.toBe(hashPrescription(RX));
  });
});

describe('PrescribingService checks', () => {
  const VERIFIED = { id: 'doc-1', isVerified: true, licenseNumber: 'KS-1', mfaEnabled: true };
  let prisma: any;
  let config: { get: jest.Mock };
  let service: PrescribingService;

  beforeEach(() => {
    prisma = {
      clinician: { findUnique: jest.fn().mockResolvedValue(VERIFIED) },
      onboardingSubmission: { findUnique: jest.fn().mockResolvedValue({ status: 'APPROVED' }) },
    };
    config = { get: jest.fn((_k: string, fallback: string) => fallback) };
    service = new PrescribingService(prisma, {} as any, {} as any, config as any);
  });

  it('accepts a verified, licensed prescriber with MFA', async () => {
    await expect(service.assertCanPrescribe('doc-1')).resolves.toBeUndefined();
  });

  it('refuses a clinician without a verified licence', async () => {
    prisma.clinician.findUnique.mockResolvedValue({ ...VERIFIED, isVerified: false });
    await expect(service.assertCanPrescribe('doc-1')).rejects.toThrow(/licence must be verified/);
    prisma.clinician.findUnique.mockResolvedValue({ ...VERIFIED, licenseNumber: null });
    await expect(service.assertCanPrescribe('doc-1')).rejects.toThrow(ForbiddenException);
  });

  it('refuses a prescriber without MFA unless PRESCRIBER_MFA_REQUIRED=false', async () => {
    prisma.clinician.findUnique.mockResolvedValue({ ...VERIFIED, mfaEnabled: false });
    await expect(service.assertCanPrescribe('doc-1')).rejects.toThrow(/two-factor/);

    config.get.mockImplementation((key: string, fallback: string) => (key === 'PRESCRIBER_MFA_REQUIRED' ? 'false' : fallback));
    await expect(service.assertCanPrescribe('doc-1')).resolves.toBeUndefined();
  });

  it('refuses when the patient has not passed onboarding', async () => {
    prisma.onboardingSubmission.findUnique.mockResolvedValue({ status: 'PENDING_REVIEW' });
    await expect(service.assertIdentityVerified('p-1')).rejects.toThrow(/onboarding checks must be approved/);
    prisma.onboardingSubmission.findUnique.mockResolvedValue(null);
    await expect(service.assertIdentityVerified('p-1')).rejects.toThrow(ForbiddenException);
  });
});

describe('PrescribingService.issue', () => {
  const strength = { id: 'str-2', label: '0.5 mg', titrationStep: 2, active: true, productId: 'sema', packDescription: null,
    product: { id: 'sema', name: 'Semaglutide', brandName: 'Wegovy', kind: 'GLP1', category: 'GLP1', active: true } };

  function setup(items: any[]) {
    const created = {
      id: 'rx-2', issuedAt: new Date(), validUntil: new Date(), refillsAllowed: 0, instructions: 'x',
      patient: { id: 'p-1', firstName: 'A', lastName: 'B', dateOfBirth: new Date('1980-01-01') },
      prescriber: null, items,
    };
    const db: any = {
      productStrength: { findMany: jest.fn().mockResolvedValue([strength]) },
      onboardingSubmission: { findUnique: jest.fn().mockResolvedValue({ status: 'APPROVED', priorMedicationUse: false }) },
      prescriptionItem: { findFirst: jest.fn().mockResolvedValue({ strength: { titrationStep: 1 } }) },
      prescription: { update: jest.fn().mockResolvedValue(created), create: jest.fn().mockResolvedValue(created) },
    };
    const orders = { createInitial: jest.fn(), cancelPendingFor: jest.fn() };
    const dosing = { generateForItem: jest.fn(), cancelForPrescription: jest.fn() };
    const service = new PrescribingService(db, orders as any, dosing as any, { get: jest.fn() } as any);
    return { db, orders, dosing, service, created };
  }

  it('supersedes the old prescription and cancels its undispatched orders and scheduled doses', async () => {
    const { db, orders, dosing, service, created } = setup([]);

    await service.issue(
      {
        patientId: 'p-1', prescriberId: 'd-1', kind: 'GLP1' as any, answers: [], supersedesId: 'rx-1',
        items: [{ productId: 'sema', strengthId: 'str-2', quantity: 1, directions: 'Weekly' }],
      },
      db,
    );

    expect(db.prescription.update).toHaveBeenCalledWith({ where: { id: 'rx-1' }, data: { status: 'SUPERSEDED' } });
    expect(orders.cancelPendingFor).toHaveBeenCalledWith('rx-1', 'Superseded by a new prescription', db);
    expect(dosing.cancelForPrescription).toHaveBeenCalledWith('rx-1', db);
    expect(orders.createInitial).toHaveBeenCalledWith(created, db);
  });

  it('generates a dose calendar for each item of the new prescription', async () => {
    const item = { id: 'item-1', prescriptionId: 'rx-2', productId: 'sema', quantity: 1, directions: 'Weekly', product: strength.product, strength };
    const { db, dosing, service } = setup([item]);

    await service.issue(
      {
        patientId: 'p-1', prescriberId: 'd-1', kind: 'GLP1' as any, answers: [],
        items: [{ productId: 'sema', strengthId: 'str-2', quantity: 1, directions: 'Weekly' }],
      },
      db,
    );

    expect(dosing.generateForItem).toHaveBeenCalledWith(item, 'p-1', expect.any(Date), db);
  });
});
